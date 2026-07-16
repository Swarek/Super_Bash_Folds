#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, readdir, rename, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedFighters = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const fighterRoot = join(root, "public/assets/ui/fighters");
const stageRoot = join(root, "stages");

const commandCheck = spawnSync("cwebp", ["-version"], { stdio: "ignore" });
if (commandCheck.status !== 0) {
  console.error("cwebp is required to generate UI thumbnails.");
  process.exit(1);
}

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const buildThumbnail = async (source, destination, width, height) => {
  if (!(await exists(source))) throw new Error(`Thumbnail source is missing: ${source}`);
  if (await exists(destination)) {
    const [sourceStat, destinationStat] = await Promise.all([stat(source), stat(destination)]);
    if (destinationStat.mtimeMs >= sourceStat.mtimeMs) return false;
  }
  const temporary = `${destination}.tmp-${process.pid}.webp`;
  const result = spawnSync("cwebp", [
    "-quiet",
    "-q", "82",
    "-alpha_q", "100",
    "-m", "6",
    "-metadata", "none",
    "-resize", String(width), String(height),
    source,
    "-o", temporary,
  ], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`cwebp failed for ${source}`);
  await rename(temporary, destination);
  return true;
};

try {
  const fighters = requestedFighters.length > 0
    ? requestedFighters
    : (await readdir(fighterRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
  let generated = 0;
  for (const fighter of fighters) {
    generated += Number(await buildThumbnail(
      join(fighterRoot, fighter, "select/00.png"),
      join(fighterRoot, fighter, "select/00.thumb.webp"),
      256,
      256,
    ));
  }
  if (requestedFighters.length === 0) {
    for (const stage of await readdir(stageRoot, { withFileTypes: true })) {
      if (!stage.isDirectory()) continue;
      generated += Number(await buildThumbnail(
        join(stageRoot, stage.name, "assets/preview.png"),
        join(stageRoot, stage.name, "assets/preview.thumb.webp"),
        512,
        256,
      ));
    }
  }
  console.log(`${generated} thumbnail(s) generated, ${fighters.length} fighter(s) verified.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
