import {
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { posix, relative, resolve, sep } from "node:path";

export const PRIVATE_FIGHTERS = [
  "dr-mario", "mario", "luigi", "bowser", "peach", "yoshi", "donkey-kong",
  "captain-falcon", "ganondorf", "falco", "fox", "ness", "ice-climbers",
  "kirby", "samus", "zelda", "sheik", "link", "young-link", "pichu",
  "pikachu", "jigglypuff", "mewtwo", "mr-game-and-watch", "marth", "roy",
];

/**
 * Paths are relative to Vite's public root and intentionally omit a leading
 * slash so the same policy can inspect request URLs and generated dist files.
 */
export const PRIVATE_PUBLIC_PREFIXES = [
  "assets/stages/",
  "assets/audio/sfx/",
  "assets/audio/music/",
  "assets/audio/announcer/",
  "assets/audio/fighters/",
  "assets/items/",
  "assets/effects/ultimate/",
  "assets/ui/cursor/ultimate-",
  "assets/characters/ultimate-sheets/",
  "assets/characters/ultimate-sheets-graded/",
  "assets/characters/ultimate-sheets-native/",
  ...PRIVATE_FIGHTERS.flatMap((fighter) => [
    `assets/characters/${fighter}/`,
    `assets/ui/fighters/${fighter}/`,
  ]),
];

/**
 * Ignored workspace material must not become downloadable just because Vite's
 * development server can normally serve arbitrary files below its root (or
 * absolute files through /@fs/). These paths never belong to the public app.
 */
export const PRIVATE_DEVELOPMENT_PREFIXES = [
  "$PWD/",
  ".generated/",
  ".git/",
  ".idea/",
  ".tools/",
  ".vscode/",
  "assets-source/",
  "coverage/",
  "dist/",
  "validation/",
  "GOAL_SPEC.md",
];

/** Tooling that operates on proprietary game files is local-only as well. */
export const PRIVATE_TOOLING_PREFIXES = [
  "scripts/ssbu_pipeline/",
  "scripts/stage_pipeline/",
];

export const PRIVATE_TOOLING_PATHS = [
  "scripts/build_ssbu_asset_routing.mjs",
  "scripts/build_ssbu_public_catalog.mjs",
  "scripts/download_ssbu_complements.sh",
  "scripts/download_ssbu_ui_references.sh",
  "scripts/extract_ssbu_public_bundle.sh",
  "scripts/generate_boot_audio.sh",
  "scripts/generate_local_music.mjs",
  "scripts/melee_fighters.json",
  "scripts/prepare_melee_public_assets.mjs",
  "scripts/prepare_melee_sources.sh",
  "scripts/prepare_ultimate_effect_tools.sh",
  "scripts/prepare_ultimate_effects.mjs",
  "scripts/verify_ssbu_public_bundle.sh",
];

const PRIVATE_DEVELOPMENT_FILE_PATTERNS = [
  /(^|\/)\.DS_Store$/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)\.npmrc$/i,
  /\.(?:key|log|p12|pem|pfx)$/i,
];

export const assertPrivateOverlayReady = ({
  missingFiles = [],
  missingFighters = [],
  problems = [],
}) => {
  if (missingFiles.length === 0 && missingFighters.length === 0 && problems.length === 0) return;
  const details = [
    ...missingFighters.map((fighter) => `incomplete fighter: ${fighter}`),
    ...missingFiles.map((path) => `missing file: ${path}`),
    ...problems.map((problem) => `invalid content: ${problem}`),
  ];
  const visibleDetails = details.slice(0, 80);
  if (visibleDetails.length < details.length) {
    visibleDetails.push(`… ${details.length - visibleDetails.length} other error(s)`);
  }
  throw new Error(
    `Incomplete private overlay; Nintendo mode refused:\n${visibleDetails.map((line) => `- ${line}`).join("\n")}`,
  );
};

const decodePath = (value) => {
  let decoded = String(value);
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
};

const normalizeRequestPath = (value) => {
  const withoutQuery = String(value).split(/[?#]/, 1)[0] ?? "";
  const decoded = decodePath(withoutQuery);
  const slashNormalized = decoded.replaceAll("\\", "/");
  return posix.normalize(`/${slashNormalized}`).replace(/^\/+/, "");
};

const normalizePublicPath = (value) => {
  const requestPath = normalizeRequestPath(value);
  const absoluteLikePath = `/${requestPath}`;
  const publicMarker = absoluteLikePath.toLowerCase().lastIndexOf("/public/");
  const publicRelative = publicMarker >= 0
    ? absoluteLikePath.slice(publicMarker + "/public/".length)
    : requestPath;
  return posix.normalize(`/${publicRelative}`).replace(/^\/+/, "");
};

export const isPrivatePublicAssetPath = (value) => {
  const path = normalizePublicPath(value).toLowerCase();
  return PRIVATE_PUBLIC_PREFIXES.some((prefix) =>
    path.startsWith(prefix.toLowerCase())
  );
};

export const isPrivateDevelopmentRequestPath = (value) => {
  const requestPath = normalizeRequestPath(value).toLowerCase();
  if (requestPath === "@fs" || requestPath.startsWith("@fs/")) return true;
  const path = normalizePublicPath(value).toLowerCase();
  if (PRIVATE_DEVELOPMENT_FILE_PATTERNS.some((pattern) => pattern.test(path))) return true;
  return PRIVATE_DEVELOPMENT_PREFIXES.some((prefix) =>
    path === prefix.toLowerCase().replace(/\/$/, "") || path.startsWith(prefix.toLowerCase())
  );
};

export const isBlockedPublicRuntimeRequestPath = (value) =>
  isPrivatePublicAssetPath(value) || isPrivateDevelopmentRequestPath(value);

export const isForbiddenPublicRepositoryPath = (value) => {
  const path = normalizeRequestPath(value).toLowerCase();
  if (path.startsWith("public/") && isPrivatePublicAssetPath(path.slice("public/".length))) {
    return true;
  }
  if (PRIVATE_TOOLING_PATHS.some((candidate) => path === candidate.toLowerCase())) return true;
  if (PRIVATE_TOOLING_PREFIXES.some((prefix) => path.startsWith(prefix.toLowerCase()))) return true;
  return [".local-private/", ".tools/", "assets-source/", "validation/"]
    .some((prefix) => path.startsWith(prefix));
};

const filesBelow = (root, directory = root) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(root, absolute) : [
      relative(root, absolute).split(sep).join("/"),
    ];
  });
};

export const findPrivateAssetsInDirectory = (directory) =>
  filesBelow(resolve(directory)).filter(isPrivatePublicAssetPath).sort();

export const purgePrivateAssetsFromDirectory = (directory) => {
  const root = resolve(directory);
  if (!existsSync(root)) return [];
  const removed = [];
  for (const prefix of PRIVATE_PUBLIC_PREFIXES) {
    if (prefix.endsWith("/")) {
      const target = resolve(root, prefix);
      if (!target.startsWith(`${root}${sep}`) || !existsSync(target)) continue;
      rmSync(target, { recursive: true, force: true });
      removed.push(prefix);
      continue;
    }
    const slash = prefix.lastIndexOf("/");
    const parent = resolve(root, prefix.slice(0, slash + 1));
    const namePrefix = prefix.slice(slash + 1);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.name.startsWith(namePrefix)) continue;
      rmSync(resolve(parent, entry.name), { recursive: true, force: true });
      removed.push(`${prefix}${entry.name.slice(namePrefix.length)}`);
    }
  }
  return removed;
};
