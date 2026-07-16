#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findForbiddenAssetsInDirectory,
  findForbiddenRuntimeMarkers,
} from "./public_asset_boundary.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = resolve(root, "dist");
const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".svg", ".txt"]);

const filesBelow = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });

if (!existsSync(dist)) {
  console.error("Public build is missing. Run npm run build:public before this check.");
  process.exitCode = 1;
} else {
  const errors = [];
  for (const path of findForbiddenAssetsInDirectory(dist)) {
    errors.push(`${path}: forbidden non-redistributable asset path`);
  }
  for (const path of filesBelow(dist)) {
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    if (statSync(path).size > 16 * 1024 * 1024) continue;
    const markers = findForbiddenRuntimeMarkers(readFileSync(path, "utf8"));
    for (const marker of markers) {
      errors.push(`${relative(dist, path)}: ${marker}`);
    }
  }

  if (errors.length > 0) {
    console.error("Public build policy check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Public build verified: no non-redistributable assets, private markers, or former identity found in dist/.");
  }
}
