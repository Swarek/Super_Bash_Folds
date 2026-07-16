#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findPrivateAssetsInDirectory } from "./public_asset_boundary.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = resolve(root, "dist");

const filesBelow = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });

if (!existsSync(dist)) {
  console.error("Public build is missing. Run npm run build:public before this check.");
  process.exitCode = 1;
} else {
  const forbidden = findPrivateAssetsInDirectory(dist);
  if (forbidden.length > 0) {
    console.error("The public build still contains files from the private overlay:");
    for (const path of forbidden) console.error(`- ${path}`);
    process.exitCode = 1;
  } else {
    const staleBrandFiles = filesBelow(dist).filter((path) => {
      if (statSync(path).size > 16 * 1024 * 1024) return false;
      return /Super Open Bros|superopenbros:|LibreLedge(?!\.(?:settings|gamepads))/i.test(
        readFileSync(path, "latin1"),
      );
    });
    if (staleBrandFiles.length > 0) {
      console.error("The public build still contains the project's former identity:");
      for (const path of staleBrandFiles) console.error(`- ${path.slice(dist.length + 1)}`);
      process.exitCode = 1;
    } else {
      console.log("Public build verified: no private assets or former project identity found in dist/.");
    }
  }
}
