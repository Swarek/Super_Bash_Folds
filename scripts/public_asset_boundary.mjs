import { existsSync, readdirSync } from "node:fs";
import { posix, relative, resolve, sep } from "node:path";

/** Paths relative to Vite's public root that are never redistributable. */
export const FORBIDDEN_PUBLIC_ASSET_PREFIXES = [
  "assets/stages/",
  "assets/audio/sfx/",
  "assets/audio/music/",
  "assets/audio/announcer/",
  "assets/audio/fighters/",
  "assets/items/",
  "assets/effects/private/",
  "assets/ui/cursor/private-",
  "assets/characters/private/",
  "assets/ui/fighters/private/",
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

const LOCAL_ONLY_TOOLING_PREFIXES = ["scripts/local_content_pipeline/"];

const LOCAL_ONLY_TOOLING_PATHS = ["scripts/generate_local_content.mjs"];

const SENSITIVE_DEVELOPMENT_FILE_PATTERNS = [
  /(^|\/)\.DS_Store$/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)\.npmrc$/i,
  /\.(?:key|log|p12|pem|pfx)$/i,
];

const FORBIDDEN_SOURCE_MARKERS = [
  { label: "private build flag", pattern: /\b(?:PRIVATE_CONTENT_MODE|PUBLIC_CONTENT_ONLY)\b|__(?:PRIVATE_|PUBLIC_CONTENT_ONLY__)/i },
  { label: "private package command", pattern: /\b(?:dev|build|test|preview):private\b/i },
  { label: "removed private module", pattern: /\b(?:localPrivateContent|privateContent|proprietaryContent|privateStages)\b/i },
  { label: "proprietary asset root", pattern: /assets\/(?:characters|effects|ui\/fighters)\/private\//i },
];
const FORBIDDEN_RUNTIME_MARKERS = [...FORBIDDEN_SOURCE_MARKERS];

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
  void path;
  return [...new Set(FORBIDDEN_SOURCE_MARKERS
    .filter(({ pattern }) => pattern.test(contents))
    .map(({ label }) => label))];
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
