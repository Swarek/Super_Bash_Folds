#!/usr/bin/env node

import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = join(root, "dist");
const uiRoot = join(root, "public/assets/ui/fighters");
const stageRoot = join(root, "stages");
const limits = {
  entryBytes: 320 * 1024,
  entryGzipBytes: 90 * 1024,
  fighterThumbnailBytes: 1024 * 1024,
  stageThumbnailBytes: 200 * 1024,
};

const fail = (message) => { throw new Error(message); };
const sumSizes = async (paths) => {
  const sizes = await Promise.all(paths.map(async (path) => (await stat(path)).size));
  return sizes.reduce((total, size) => total + size, 0);
};

try {
  const html = await readFile(join(distRoot, "index.html"), "utf8");
  const entryMatch = html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/);
  if (!entryMatch?.[1]) fail("JavaScript entry not found in dist/index.html");
  const entry = await readFile(join(distRoot, "assets", entryMatch[1]));
  const entryGzipBytes = gzipSync(entry, { level: 9 }).byteLength;

  const fighterDirectories = (await readdir(uiRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  const fighterThumbnails = fighterDirectories.map((entry) =>
    join(uiRoot, entry.name, "select/00.thumb.webp")
  );
  const stageDirectories = (await readdir(stageRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  const stageThumbnails = stageDirectories.map((entry) =>
    join(stageRoot, entry.name, "assets/preview.thumb.webp")
  );
  const fighterThumbnailBytes = await sumSizes(fighterThumbnails);
  const stageThumbnailBytes = await sumSizes(stageThumbnails);

  for (const [label, actual, maximum] of [
    ["JS entry", entry.byteLength, limits.entryBytes],
    ["gzipped JS entry", entryGzipBytes, limits.entryGzipBytes],
    ["fighter thumbnails", fighterThumbnailBytes, limits.fighterThumbnailBytes],
    ["stage thumbnails", stageThumbnailBytes, limits.stageThumbnailBytes],
  ]) {
    if (actual > maximum) fail(`${label}: ${actual} bytes exceed the budget of ${maximum}`);
  }

  console.table({
    "JS entry": { bytes: entry.byteLength, budget: limits.entryBytes },
    "gzipped JS entry": { bytes: entryGzipBytes, budget: limits.entryGzipBytes },
    "fighter thumbnails": { bytes: fighterThumbnailBytes, budget: limits.fighterThumbnailBytes },
    "stage thumbnails": { bytes: stageThumbnailBytes, budget: limits.stageThumbnailBytes },
  });
  console.log("Performance budgets met.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
