import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(process.env.OPEN_FIGHTER_MANIFEST ?? join(projectRoot, "scripts/open_fighter_pipeline/manifest.json"));
const renderRoot = resolve(process.env.OPEN_FIGHTER_RENDER_ROOT ?? join(projectRoot, ".generated/open-fighters"));
const publicRoot = resolve(process.env.OPEN_FIGHTER_PUBLIC_ROOT ?? join(projectRoot, "public/assets/characters/open"));
const generatedMetadata = resolve(process.env.OPEN_FIGHTER_METADATA_OUT ?? join(projectRoot, "src/game/openAnimationMetadata.ts"));
const onlyFighters = new Set((process.env.OPEN_FIGHTERS ?? "").split(",").filter(Boolean));

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const metadata = {};

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
};

const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

for (const [fighter, definition] of Object.entries(manifest.fighters)) {
  const shouldBuild = onlyFighters.size === 0 || onlyFighters.has(fighter);
  let index;
  try {
    index = JSON.parse(await readFile(join(renderRoot, fighter, "render-index.json"), "utf8"));
  } catch (error) {
    // A filtered build may share a manifest with candidates that have not been
    // rendered yet. The requested fighter must exist; unrelated missing
    // indexes are simply not part of the generated metadata yet.
    if (shouldBuild) throw error;
    continue;
  }
  metadata[fighter] = {};
  for (const [slot, mapping] of Object.entries(index.slots)) {
    const action = index.actions[mapping.action];
    if (!action) throw new Error(`${fighter}/${slot}: missing rendered action ${mapping.action}`);
    metadata[fighter][slot] = {
      frameCount: action.frameCount,
      fps: action.fps,
      columns: index.columns,
      cellSize: index.cellSize,
      sourceAction: mapping.action,
      coverage: mapping.coverage,
    };
  }

  const provenanceDestination = join(publicRoot, fighter, "PROVENANCE.json");
  await mkdir(dirname(provenanceDestination), { recursive: true });
  await writeFile(provenanceDestination, JSON.stringify({
    id: fighter,
    displayName: definition.displayName,
    author: definition.author,
    sourcePage: definition.sourcePage,
    license: definition.license,
    licenseUrl: definition.licenseUrl,
    additionalSources: definition.additionalSources ?? [],
    model: definition.model,
    animationSources: definition.animationSources ?? [],
    slots: index.slots,
  }, null, 2) + "\n");

  if (!shouldBuild) continue;
  const actionAtlases = new Map();
  for (const [slot, mapping] of Object.entries(index.slots)) {
    const action = index.actions[mapping.action];
    let atlas = actionAtlases.get(mapping.action);
    if (!atlas) {
      const actionDir = join(renderRoot, fighter, "actions", action.key);
      const rows = Math.ceil(action.frameCount / index.columns);
      const stagingDir = join(renderRoot, fighter, "atlases");
      await mkdir(stagingDir, { recursive: true });
      const png = join(stagingDir, `${action.key}.png`);
      atlas = join(stagingDir, `${action.key}.webp`);
      run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-framerate", String(action.fps),
        "-i", join(actionDir, "frame-%04d.png"),
        "-vf", `tile=${index.columns}x${rows}:nb_frames=${action.frameCount}:padding=0:margin=0,format=rgba,geq=r='if(lte(alpha(X,Y),20),0,r(X,Y))':g='if(lte(alpha(X,Y),20),0,g(X,Y))':b='if(lte(alpha(X,Y),20),0,b(X,Y))':a='if(lte(alpha(X,Y),20),0,alpha(X,Y))'`,
        "-frames:v", "1", png,
      ]);
      run("cwebp", ["-quiet", "-lossless", "-exact", "-q", "100", "-m", "6", "-metadata", "none", png, "-o", atlas]);
      run("node", [join(projectRoot, "scripts/assert_clean_webp.mjs"), atlas]);
      actionAtlases.set(mapping.action, atlas);
    }
    const destination = join(publicRoot, fighter, "00", `${slot}.webp`);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(atlas, destination);
  }

  const idleFrame = index.portrait?.path
    ? join(renderRoot, fighter, index.portrait.path)
    : join(renderRoot, fighter, "actions", index.actions[index.slots.idle.action].key, "frame-0000.png");
  const portrait = join(projectRoot, `public/assets/ui/fighters/${fighter}/select/00.png`);
  await mkdir(dirname(portrait), { recursive: true });
  // Blender stores the source .blend path in PNG metadata. Re-encode the
  // public portrait so release artifacts never expose a contributor's local
  // filesystem while preserving the rendered RGBA pixels.
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", idleFrame,
    "-map_metadata", "-1",
    "-map_metadata:s:v", "-1",
    "-fflags", "+bitexact",
    "-flags:v", "+bitexact",
    "-frames:v", "1",
    "-pix_fmt", "rgba",
    portrait,
  ]);

  const hashLines = [];
  for (const slot of Object.keys(index.slots)) {
    const relative = `00/${slot}.webp`;
    hashLines.push(`${await sha256(join(publicRoot, fighter, relative))}  ${relative}`);
  }
  hashLines.push(`${await sha256(portrait)}  ../../../ui/fighters/${fighter}/select/00.png`);
  await writeFile(join(publicRoot, fighter, "SHA256SUMS"), `${hashLines.join("\n")}\n`);
}

await mkdir(dirname(generatedMetadata), { recursive: true });
await writeFile(
  generatedMetadata,
  `/* Generated by scripts/open_fighter_pipeline/build_atlases.mjs. */\nexport const OPEN_ANIMATION_METADATA = ${JSON.stringify(metadata, null, 2)} as const;\n`,
);
console.log(`Open atlases generated in ${publicRoot}`);
