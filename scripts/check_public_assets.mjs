#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isForbiddenPublicRepositoryPath } from "./public_asset_boundary.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const open2DMetadata = JSON.parse(readFileSync(
  resolve(root, "public/assets/characters/open/2d-animation-metadata.json"),
  "utf8",
));
const open3DManifest = JSON.parse(readFileSync(
  resolve(root, "scripts/open_fighter_pipeline/manifest.json"),
  "utf8",
));
const openFighterIds = new Set([
  ...Object.keys(open2DMetadata.fighters ?? {}),
  ...Object.keys(open3DManifest.fighters ?? {}),
]);

const candidates = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
).toString("utf8").split("\0").filter(Boolean);

const errors = [];
const forbiddenBinaryExtensions = new Set([
  ".arc", ".bntx", ".eff", ".nro", ".nuanmb", ".numatb", ".numdlb",
  ".nus3audio", ".nus3bank", ".nutexb", ".prc", ".sli", ".ssbh",
]);
const sensitiveBasenames = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:id_rsa|id_ed25519)(?:\.|$)/i,
  /(^|\/)\.npmrc$/i,
  /\.(?:key|p12|pfx|pem)$/i,
];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
const localPathPatterns = [
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\Users\\[A-Za-z0-9._ -]+\\/,
];
const textExtensions = new Set([
  "", ".css", ".csv", ".html", ".js", ".json", ".jsx", ".md", ".mjs",
  ".py", ".sh", ".svg", ".ts", ".tsx", ".txt", ".yml", ".yaml",
]);

let totalBytes = 0;
for (const path of candidates) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) continue;
  const info = lstatSync(absolute);
  totalBytes += info.size;
  if (info.isSymbolicLink()) errors.push(`${path}: symbolic links are prohibited`);
  if (isForbiddenPublicRepositoryPath(path)) {
    errors.push(`${path}: local-only path is prohibited in the public repository`);
  }
  const portrait = path.match(/^public\/assets\/ui\/fighters\/([^/]+)\//);
  if (portrait && !openFighterIds.has(portrait[1])) {
    errors.push(`${path}: portrait does not belong to a registered open fighter`);
  }
  if (forbiddenBinaryExtensions.has(extname(path).toLowerCase())) {
    errors.push(`${path}: private binary format is prohibited`);
  }
  if (sensitiveBasenames.some((pattern) => pattern.test(path))) {
    errors.push(`${path}: sensitive filename is prohibited`);
  }
  if (info.isFile() && info.size <= 32 * 1024 * 1024) {
    const contents = readFileSync(absolute);
    const rawText = contents.toString("latin1");
    if (localPathPatterns.some((pattern) => pattern.test(rawText))) {
      errors.push(`${path}: absolute local machine path detected`);
    }
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    const text = contents.toString("utf8");
    if (secretPatterns.some((pattern) => pattern.test(text))) {
      errors.push(`${path}: secret pattern detected`);
    }
  }
}

const required = [
  "LICENSE",
  "ASSET_POLICY.md",
  "THIRD_PARTY_ASSETS.md",
  "public/assets/audio/open/SHA256SUMS",
  "public/assets/open/PROVENANCE.md",
  "public/assets/open/SHA256SUMS",
  "stages/verdant-grove/PROVENANCE.md",
  "stages/verdant-grove/SHA256SUMS",
  "website/public/PROVENANCE.md",
  "website/public/SHA256SUMS",
  "docs/media/PROVENANCE.md",
  "docs/media/SHA256SUMS",
];
for (const path of required) {
  if (!candidates.includes(path)) errors.push(`${path}: required public file is missing`);
}

const verifyChecksums = (directory, manifestPath, label) => {
  const checksumRoot = resolve(root, directory);
  const checksumLines = readFileSync(resolve(checksumRoot, "SHA256SUMS"), "utf8")
    .split(/\r?\n/).filter(Boolean);
  for (const [index, line] of checksumLines.entries()) {
    const match = line.match(/^([a-f0-9]{64})  ([^\s].*)$/);
    if (!match) {
      errors.push(`${manifestPath}:${index + 1}: invalid line`);
      continue;
    }
    const file = resolve(checksumRoot, match[2]);
    if (!file.startsWith(`${checksumRoot}/`) || !existsSync(file)) {
      errors.push(`${manifestPath}:${index + 1}: file is missing or outside the directory`);
      continue;
    }
    const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (actual !== match[1]) errors.push(`${match[2]}: incorrect ${label} hash`);
  }
};

verifyChecksums("public/assets/audio/open", "public/assets/audio/open/SHA256SUMS", "audio");
verifyChecksums("public/assets/open", "public/assets/open/SHA256SUMS", "original asset");
verifyChecksums("website/public", "website/public/SHA256SUMS", "website launch media");
verifyChecksums("docs/media", "docs/media/SHA256SUMS", "README launch media");

if (errors.length > 0) {
  console.error("Public asset policy check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `${candidates.length} public files verified (${(totalBytes / 1024 / 1024).toFixed(1)} MiB), no local-only paths or obvious secrets found.`,
  );
}
