#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, PUBLIC_CONTENT_ONLY: "1" },
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(["scripts/check_public_assets.mjs"]);
run(["scripts/fighter_packs.mjs", "check"]);
run(["scripts/stage_packs.mjs", "check"]);
console.log("Public content verified: fighters, stages, audio, UI, and Git policy.");
