#!/usr/bin/env node

import { access, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCleanWebp } from "./assert_clean_webp.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = join(root, "public/assets/characters/open");
const deep = process.env.OPEN_FIGHTER_DEEP === "1";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sorted = (values) => [...values].sort();
const sameValues = (left, right) =>
  JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

const extractStringArray = (source, name) => {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`));
  if (!match) throw new Error(`Array ${name} not found`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
};

const parseGenerated3DMetadata = async () => {
  const source = await readFile(join(root, "src/game/openAnimationMetadata.ts"), "utf8");
  const match = source.match(/export const OPEN_ANIMATION_METADATA = ([\s\S]*?) as const;\s*$/);
  if (!match) throw new Error("Generated 3D metadata is unreadable");
  return JSON.parse(match[1]);
};

const generatedRegistry = await readFile(
  join(root, "src/game/generated/openFighterRegistry.ts"),
  "utf8",
);
const characterAssets = await readFile(join(root, "src/game/characterAssets.ts"), "utf8");
const runtime3D = extractStringArray(generatedRegistry, "OPEN_3D_FIGHTER_IDS");
const runtime2D = extractStringArray(generatedRegistry, "OPEN_2D_FIGHTER_IDS");
const slots = extractStringArray(characterAssets, "REMOTE_ANIMATION_SLOTS");
const manifest3D = await readJson(join(root, "scripts/open_fighter_pipeline/manifest.json"));
const manifest2D = await readJson(join(root, "scripts/open_fighter_pipeline/2d_manifest.json"));
const metadata3D = await parseGenerated3DMetadata();
const metadata2DDocument = await readJson(join(publicRoot, "2d-animation-metadata.json"));
const metadata2D = metadata2DDocument.fighters;

const issues = [];
const compareInventory = (label, runtime, manifest, metadata) => {
  for (const [source, ids] of [
    ["manifest", Object.keys(manifest)],
    ["metadata", Object.keys(metadata)],
  ]) {
    if (!sameValues(runtime, ids)) {
      issues.push(`${label}: runtime [${runtime.join(", ")}] != ${source} [${ids.join(", ")}]`);
    }
  }
};

compareInventory("3D", runtime3D, manifest3D.fighters, metadata3D);
compareInventory("2D", runtime2D, manifest2D.fighters, metadata2D);

const coverageRows = [];
for (const [kind, fighters, metadata] of [
  ["3D", runtime3D, metadata3D],
  ["2D", runtime2D, metadata2D],
]) {
  for (const fighter of fighters) {
    const fighterMetadata = metadata[fighter];
    if (!fighterMetadata) continue;
    const metadataSlots = Object.keys(fighterMetadata);
    if (!sameValues(slots, metadataSlots)) {
      issues.push(`${fighter}: ${metadataSlots.length}/${slots.length} slots declared`);
    }

    const directory = join(publicRoot, fighter, "00");
    let atlasNames = [];
    try {
      atlasNames = (await readdir(directory)).filter((name) => name.endsWith(".webp"));
    } catch {
      issues.push(`${fighter}: atlas directory is missing`);
    }
    const expectedNames = slots.map((slot) => `${slot}.webp`);
    if (!sameValues(atlasNames, expectedNames)) {
      issues.push(`${fighter}: WebP inventory ${atlasNames.length}/${expectedNames.length}`);
    }

    const requiredFiles = [
      join(publicRoot, fighter, "PROVENANCE.json"),
      join(root, `public/assets/ui/fighters/${fighter}/select/00.png`),
      join(root, `public/assets/ui/fighters/${fighter}/select/00.thumb.webp`),
    ];
    for (const path of requiredFiles) {
      try {
        await access(path);
        if ((await stat(path)).size === 0) issues.push(`${fighter}: empty file ${path}`);
      } catch {
        issues.push(`${fighter}: missing file ${path}`);
      }
    }

    const checksumPath = join(publicRoot, fighter, "SHA256SUMS");
    const expectedChecksumPaths = [
      ...expectedNames.map((name) => `00/${name}`),
      `../../../ui/fighters/${fighter}/select/00.png`,
    ];
    try {
      const checksumSource = await readFile(checksumPath, "utf8");
      const checksums = new Map();
      for (const [lineIndex, line] of checksumSource.split(/\r?\n/).entries()) {
        if (!line) continue;
        const match = line.match(/^([0-9a-f]{64})  (.+)$/);
        if (!match) {
          issues.push(`${fighter}: invalid SHA256SUMS line ${lineIndex + 1}`);
          continue;
        }
        const [, expectedHash, relativePath] = match;
        if (checksums.has(relativePath)) {
          issues.push(`${fighter}: duplicate SHA256SUMS entry ${relativePath}`);
          continue;
        }
        checksums.set(relativePath, expectedHash);
      }
      if (!sameValues([...checksums.keys()], expectedChecksumPaths)) {
        issues.push(`${fighter}: SHA256SUMS inventory ${checksums.size}/${expectedChecksumPaths.length}`);
      }
      for (const relativePath of expectedChecksumPaths) {
        const expectedHash = checksums.get(relativePath);
        if (!expectedHash) continue;
        try {
          const actualHash = await sha256(resolve(publicRoot, fighter, relativePath));
          if (actualHash !== expectedHash) {
            issues.push(`${fighter}: invalid SHA-256 ${relativePath}`);
          }
        } catch {
          issues.push(`${fighter}: missing SHA256SUMS target ${relativePath}`);
        }
      }
    } catch {
      issues.push(`${fighter}: missing file ${checksumPath}`);
    }

    const coverage = { direct: 0, adapted: 0, author_required: 0 };
    for (const slot of Object.values(fighterMetadata)) {
      if (!(slot.coverage in coverage)) {
        issues.push(`${fighter}: unknown coverage ${slot.coverage}`);
        continue;
      }
      coverage[slot.coverage] += 1;
    }
    coverageRows.push({
      fighter,
      kind,
      ...coverage,
      production_ready: coverage.adapted === 0 && coverage.author_required === 0,
    });

    const filesToInspect = deep ? expectedNames : expectedNames.slice(0, 1);
    for (const name of filesToInspect) {
      const path = join(directory, name);
      try {
        const inspection = assertCleanWebp(path);
        if (inspection.width % 192 !== 0 || inspection.height % 192 !== 0) {
          issues.push(`${fighter}/${name}: dimensions ${inspection.width}x${inspection.height}`);
        }
      } catch (error) {
        issues.push(`${fighter}/${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

console.table(coverageRows);
if (issues.length > 0) {
  console.error(`Open roster validation failed (${issues.length} issue(s)):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`${runtime3D.length + runtime2D.length} open fighters validated, ${slots.length} slots each.`);
  const productionReady = coverageRows.filter((row) => row.production_ready).length;
  console.log(
    `${productionReady}/${coverageRows.length} have 50 direct animations; ` +
    `the others remain playable prototypes with adapted or fallback clips.`,
  );
}
