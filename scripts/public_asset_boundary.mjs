import { existsSync, readdirSync } from "node:fs";
import { posix, relative, resolve, sep } from "node:path";

/**
 * Historical local-only fighter IDs are kept only as a denylist. They must
 * never be imported by runtime code or used to construct the public roster.
 */
export const LEGACY_NON_REDISTRIBUTABLE_FIGHTER_IDS = [
  "dr-mario", "mario", "luigi", "bowser", "peach", "yoshi", "donkey-kong",
  "captain-falcon", "ganondorf", "falco", "fox", "ness", "ice-climbers",
  "kirby", "samus", "zelda", "sheik", "link", "young-link", "pichu",
  "pikachu", "jigglypuff", "mewtwo", "mr-game-and-watch", "marth", "roy",
];

/** Paths relative to Vite's public root that are never redistributable. */
export const FORBIDDEN_PUBLIC_ASSET_PREFIXES = [
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
  ...LEGACY_NON_REDISTRIBUTABLE_FIGHTER_IDS.flatMap((fighter) => [
    `assets/characters/${fighter}/`,
    `assets/ui/fighters/${fighter}/`,
  ]),
];

/** Workspace-only material that the Vite development server must not expose. */
export const SENSITIVE_DEVELOPMENT_PREFIXES = [
  "$PWD/",
  ".generated/",
  ".git/",
  ".idea/",
  ".local-private/",
  ".tools/",
  ".vscode/",
  "assets-source/",
  "coverage/",
  "dist/",
  "validation/",
  "GOAL_SPEC.md",
];

const LOCAL_ONLY_TOOLING_PREFIXES = [
  "scripts/ssbu_pipeline/",
  "scripts/stage_pipeline/",
];

const LOCAL_ONLY_TOOLING_PATHS = [
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

const SENSITIVE_DEVELOPMENT_FILE_PATTERNS = [
  /(^|\/)\.DS_Store$/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)\.npmrc$/i,
  /\.(?:key|log|p12|pem|pfx)$/i,
];

const LEGACY_FIGHTER_LITERAL = new RegExp(
  `["'](?:${LEGACY_NON_REDISTRIBUTABLE_FIGHTER_IDS.filter((fighter) => fighter !== "link").join("|")})["']`,
  "i",
);
// `link` is also an HTML element name used by Vite's module-preload runtime.
// Only treat it as a fighter identifier when the surrounding source gives it
// an explicit fighter/content meaning.
const LEGACY_LINK_FIGHTER_CONTEXT = /(?:\b(?:character|fighter|fighterId|id)\b\s*[:=]\s*["']link["']|assets\/(?:characters|ui\/fighters)\/link\/)/i;
const LEGACY_FIGHTER_STYLING = new RegExp(
  `(?:cc-portrait|fighter)[-_a-z]*--(?:${LEGACY_NON_REDISTRIBUTABLE_FIGHTER_IDS.join("|")})\\b`,
  "i",
);
const LEGACY_ITEM_LABEL = /\b(?:Maxim Tomato|Heart Container|Super Mushroom|Bunny Hood|Metal Box|Beam Sword|Home-Run Bat|Ray Gun|Fire Flower|Bob-omb|Green Shell|Banana Peel|Deku Nut|Franklin Badge)\b/i;
const FORBIDDEN_SOURCE_MARKERS = [
  { label: "private build flag", pattern: /\b(?:PRIVATE_CONTENT_MODE|PUBLIC_CONTENT_ONLY)\b|__(?:PRIVATE_|PUBLIC_CONTENT_ONLY__)/i },
  { label: "private package command", pattern: /\b(?:dev|build|test|preview):private\b/i },
  { label: "removed private module", pattern: /\b(?:exactAnimationMetadata|exactSpecialAnimationMetadata|meleeRoster|privateStages|privateContent|ultimateEffectAssets)\b/i },
  { label: "private roster contract", pattern: /\b(?:MELEE_FIGHTER(?:_ID)?_CATALOG|MELEE_FIGHTER_IDS|MeleeFighterId)\b/ },
  { label: "private move builder", pattern: /\b(?:buildUltimateAttacks|UltimateMoveProfile)\b/ },
  { label: "SSBU extraction marker", pattern: /\b(?:SSBU|NUANMB)\b|smash-ultimate-models-exported/i },
  { label: "proprietary asset root", pattern: /ultimate-sheets|assets\/effects\/ultimate|\.local-private\/tooling\/scripts\/ssbu_pipeline/i },
  { label: "proprietary game identity", pattern: /Super Smash Bros|Smash Ultimate/i },
  { label: "legacy fighter identifier", pattern: LEGACY_FIGHTER_LITERAL },
  { label: "legacy fighter identifier", pattern: LEGACY_LINK_FIGHTER_CONTEXT },
  { label: "legacy fighter-specific styling", pattern: LEGACY_FIGHTER_STYLING },
  { label: "legacy item presentation", pattern: LEGACY_ITEM_LABEL },
  { label: "legacy stage presentation", pattern: /\b(?:Pok[eé]mon Stadium|Hyrule Castle)\b|smash-battlefield/i },
  { label: "legacy reflector cue", pattern: /franklin-reflect/i },
];
const NINTENDO_CONTROLLER_SOURCE_PATHS = new Set([
  "src/game/gamepad.ts",
  "src/game/gamepad.test.ts",
  "src/ui/gamepadNavigation.ts",
  "src/ui/gamepadNavigation.test.ts",
  "src/ui/gamepadUi.ts",
  "src/ui/gamepadUi.test.ts",
]);
const FORBIDDEN_RUNTIME_MARKERS = [
  ...FORBIDDEN_SOURCE_MARKERS,
  { label: "former project identity", pattern: /Super[ _-]?Open[ _-]?Bros|LibreLedge|Cousins[ _-]?Clash/i },
  { label: "private content claim", pattern: /Nintendo(?:-authored| content| mode| item| stage| fighter| asset)/i },
];

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

export const isForbiddenPublicAssetPath = (value) => {
  const path = normalizePublicPath(value).toLowerCase();
  return FORBIDDEN_PUBLIC_ASSET_PREFIXES.some((prefix) =>
    path.startsWith(prefix.toLowerCase())
  );
};

export const isSensitiveDevelopmentRequestPath = (value) => {
  const requestPath = normalizeRequestPath(value).toLowerCase();
  if (requestPath === "@fs" || requestPath.startsWith("@fs/")) return true;
  const path = normalizePublicPath(value).toLowerCase();
  if (SENSITIVE_DEVELOPMENT_FILE_PATTERNS.some((pattern) => pattern.test(path))) return true;
  return SENSITIVE_DEVELOPMENT_PREFIXES.some((prefix) =>
    path === prefix.toLowerCase().replace(/\/$/, "") || path.startsWith(prefix.toLowerCase())
  );
};

export const isBlockedPublicRuntimeRequestPath = (value) =>
  isForbiddenPublicAssetPath(value) || isSensitiveDevelopmentRequestPath(value);

export const isForbiddenPublicRepositoryPath = (value) => {
  const path = normalizeRequestPath(value).toLowerCase();
  if (path.startsWith("public/") && isForbiddenPublicAssetPath(path.slice("public/".length))) {
    return true;
  }
  if (
    path.startsWith("public/assets/audio/") &&
    path !== "public/assets/audio/licenses.md" &&
    path !== "public/assets/audio/open" &&
    !path.startsWith("public/assets/audio/open/")
  ) return true;
  if (
    path.startsWith("public/assets/characters/") &&
    path !== "public/assets/characters/licenses.md" &&
    path !== "public/assets/characters/open" &&
    !path.startsWith("public/assets/characters/open/")
  ) return true;
  if (LOCAL_ONLY_TOOLING_PATHS.some((candidate) => path === candidate.toLowerCase())) return true;
  if (LOCAL_ONLY_TOOLING_PREFIXES.some((prefix) => path.startsWith(prefix.toLowerCase()))) return true;
  return [".local-private/", ".tools/", "assets-source/", "validation/"]
    .some((prefix) => path.startsWith(prefix));
};

export const findForbiddenSourceMarkers = (path, contents) => {
  const normalizedPath = normalizeRequestPath(path);
  const markers = FORBIDDEN_SOURCE_MARKERS
    .filter(({ pattern }) => pattern.test(contents))
    .map(({ label }) => label);
  if (/\bNintendo\b/i.test(contents) && !NINTENDO_CONTROLLER_SOURCE_PATHS.has(normalizedPath)) {
    markers.push("Nintendo content marker");
  }
  return [...new Set(markers)];
};

export const findForbiddenRuntimeMarkers = (contents) => [
  ...new Set(
    FORBIDDEN_RUNTIME_MARKERS
      .filter(({ pattern }) => pattern.test(contents))
      .map(({ label }) => label),
  ),
];

const filesBelow = (root, directory = root) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(root, absolute) : [
      relative(root, absolute).split(sep).join("/"),
    ];
  });
};

export const findForbiddenAssetsInDirectory = (directory) =>
  filesBelow(resolve(directory)).filter(isForbiddenPublicAssetPath).sort();
