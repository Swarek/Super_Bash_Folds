#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findForbiddenSourceMarkers } from "./public_asset_boundary.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const removedRuntimeModules = [
  "src/game/exactAnimationMetadata.ts",
  "src/game/exactSpecialAnimationMetadata.ts",
  "src/game/meleeRoster.ts",
  "src/game/privateContent.test.ts",
  "src/game/privateStages.test.ts",
  "src/game/privateStages.ts",
  "src/game/ultimateEffectAssets.test.ts",
  "src/game/ultimateEffectAssets.ts",
];
const inspectedExtensions = new Set([
  ".css", ".html", ".js", ".json", ".jsx", ".mjs", ".ts", ".tsx",
]);
const policyImplementation = /^(?:scripts\/check_public_[^/]+\.mjs|scripts\/public_asset_boundary(?:\.d\.mts|\.mjs|\.test\.ts))$/;
const inSourceSurface = (path) =>
  path === "package.json" || path === "vite.config.ts" ||
  /^(?:fighters|scripts|src|stages)\//.test(path);

const candidates = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
).toString("utf8").split("\0").filter(Boolean);

const errors = [];
for (const path of removedRuntimeModules) {
  if (existsSync(resolve(root, path))) errors.push(`${path}: removed private runtime module still exists`);
}

let inspected = 0;
for (const path of candidates) {
  if (!inSourceSurface(path) || policyImplementation.test(path)) continue;
  if (!inspectedExtensions.has(extname(path).toLowerCase())) continue;
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) continue;
  const info = lstatSync(absolute);
  if (!info.isFile() || info.size > 8 * 1024 * 1024) continue;
  inspected += 1;
  const markers = findForbiddenSourceMarkers(path, readFileSync(absolute, "utf8"));
  for (const marker of markers) errors.push(`${path}: ${marker}`);
}

if (errors.length > 0) {
  console.error("Public source policy check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`${inspected} source files verified; no private runtime modules or proprietary content markers found.`);
}
