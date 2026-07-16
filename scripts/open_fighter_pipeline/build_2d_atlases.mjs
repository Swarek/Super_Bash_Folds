import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(process.env.OPEN_2D_MANIFEST ?? join(projectRoot, "scripts/open_fighter_pipeline/2d_manifest.json"));
const renderRoot = resolve(process.env.OPEN_2D_RENDER_ROOT ?? join(projectRoot, ".generated/open-fighters-2d"));
const publicRoot = resolve(process.env.OPEN_2D_PUBLIC_ROOT ?? join(projectRoot, "public/assets/characters/open"));
const portraitRoot = resolve(process.env.OPEN_2D_PORTRAIT_ROOT ?? join(projectRoot, "public/assets/ui/fighters"));
const onlyFighters = new Set((process.env.OPEN_2D_FIGHTERS ?? "").split(",").filter(Boolean));

const SLOTS = [
  "idle", "crouch", "walk", "turn", "dash", "run", "jump_squat", "jump", "double_jump", "fall",
  "fast_fall", "jab", "dash_attack", "forward_tilt", "up_tilt", "down_tilt", "forward_smash", "up_smash", "down_smash", "neutral_air",
  "forward_air", "back_air", "up_air", "down_air", "neutral_special", "side_special", "up_special", "down_special", "spot_dodge", "roll_forward",
  "roll_back", "air_dodge", "shield", "item_hold", "item_pickup", "item_attack", "grab", "grab_hold", "grabbed", "forward_throw",
  "back_throw", "up_throw", "down_throw", "hurt", "knockback", "downed", "ledge", "entrance", "taunt", "victory",
];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}):\n${result.stderr ?? ""}`);
  }
  return result.stdout ?? "";
};

const inspectImage = (path) => {
  const data = JSON.parse(run("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", path,
  ]));
  const stream = data.streams?.[0];
  if (!stream?.width || !stream?.height) throw new Error(`Dimensions not found: ${path}`);
  return { width: stream.width, height: stream.height };
};

const inspectAlphaBounds = (path, rect) => {
  const decoded = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", path,
    "-vf", `crop=${rect.width}:${rect.height}:${rect.x}:${rect.y},alphaextract`,
    "-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1",
  ], { maxBuffer: rect.width * rect.height + 1024 * 1024 });
  if (decoded.status !== 0) {
    throw new Error(`Could not read alpha channel for ${path}:\n${decoded.stderr?.toString() ?? ""}`);
  }
  const alpha = decoded.stdout;
  if (alpha.length !== rect.width * rect.height) {
    throw new Error(`${path}: incomplete alpha plane (${alpha.length} bytes)`);
  }
  let left = rect.width;
  let top = rect.height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] === 0) continue;
    const x = index % rect.width;
    const y = Math.floor(index / rect.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error(`${path}: fully transparent frame`);
  return { left, top, right: right + 1, bottom: bottom + 1 };
};

const trimFramesToContent = (frames) => {
  const width = frames[0].rect.width;
  const height = frames[0].rect.height;
  if (frames.some((frame) => frame.rect.width !== width || frame.rect.height !== height)) {
    throw new Error(`${frames[0].sourceLabel}: cells to be trimmed are not uniformly sized`);
  }
  const bounds = frames.map((frame) => inspectAlphaBounds(frame.source, frame.rect));
  const union = bounds.reduce((result, bound) => ({
    left: Math.min(result.left, bound.left),
    top: Math.min(result.top, bound.top),
    right: Math.max(result.right, bound.right),
    bottom: Math.max(result.bottom, bound.bottom),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  const localRect = {
    width: union.right - union.left,
    height: union.bottom - union.top,
  };
  return frames.map((frame) => ({
    ...frame,
    rect: {
      x: frame.rect.x + union.left,
      y: frame.rect.y + union.top,
      ...localRect,
    },
  }));
};

const parseRate = (rate) => {
  const [numerator, denominator] = String(rate).split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return undefined;
  return Number((numerator / denominator).toFixed(6));
};

const inspectAnimatedImage = (path) => {
  const data = JSON.parse(run("ffprobe", [
    "-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=nb_read_frames,avg_frame_rate", "-of", "json", path,
  ]));
  const stream = data.streams?.[0];
  const frameCount = Number(stream?.nb_read_frames);
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error(`Frame count not found: ${path}`);
  return { frameCount, fps: parseRate(stream.avg_frame_rate) };
};

const naturalSort = (left, right) => left.localeCompare(right, "en", { numeric: true });
const projectPath = (path) => resolve(projectRoot, path);

const parseUnityFrames = async (sheet) => {
  const source = projectPath(sheet);
  const meta = await readFile(`${source}.meta`, "utf8");
  const image = inspectImage(source);
  const blocks = meta.split(/^    - name: /m).slice(1);
  const frames = blocks.map((block) => {
    const name = block.slice(0, block.indexOf("\n")).trim();
    const rect = block.match(/rect:\n\s+serializedVersion: 2\n\s+x: ([\d.-]+)\n\s+y: ([\d.-]+)\n\s+width: ([\d.-]+)\n\s+height: ([\d.-]+)/);
    const pivot = block.match(/\n\s+pivot: \{x: ([\d.-]+), y: ([\d.-]+)\}/);
    if (!rect || !pivot) throw new Error(`${sheet}/${name}: missing Unity rect or pivot`);
    const width = Number(rect[3]);
    const height = Number(rect[4]);
    return {
      source,
      sourceLabel: `${sheet}#${name}`,
      rect: {
        x: Number(rect[1]),
        y: image.height - Number(rect[2]) - height,
        width,
        height,
      },
      pivot: {
        x: Number(pivot[1]) * width,
        y: (1 - Number(pivot[2])) * height,
      },
    };
  });
  if (frames.length === 0) throw new Error(`${sheet}: no Unity frames`);
  return frames;
};

const resolveAction = async (definition) => {
  if (definition.type === "sequence") {
    const directory = projectPath(definition.directory);
    const pattern = new RegExp(definition.pattern);
    const names = (await readdir(directory)).filter((name) => pattern.test(name)).sort(naturalSort);
    if (names.length === 0) throw new Error(`${definition.directory}: empty sequence (${definition.pattern})`);
    return names.map((name) => {
      const source = join(directory, name);
      const dimensions = inspectImage(source);
      return { source, sourceLabel: `${definition.directory}/${name}`, rect: { x: 0, y: 0, ...dimensions } };
    });
  }
  if (definition.type === "files") {
    if (!definition.files?.length) throw new Error("Empty files action");
    return definition.files.map((path) => {
      const source = projectPath(path);
      const dimensions = inspectImage(source);
      return { source, sourceLabel: path, rect: { x: 0, y: 0, ...dimensions } };
    });
  }
  if (definition.type === "strip") {
    const source = projectPath(definition.sheet);
    const dimensions = inspectImage(source);
    if (dimensions.height !== definition.frameHeight || dimensions.width % definition.frameWidth !== 0) {
      throw new Error(`${definition.sheet}: ${dimensions.width}x${dimensions.height} strip incompatible with ${definition.frameWidth}x${definition.frameHeight}`);
    }
    return Array.from({ length: dimensions.width / definition.frameWidth }, (_, index) => ({
      source,
      sourceLabel: `${definition.sheet}#${index}`,
      rect: { x: index * definition.frameWidth, y: 0, width: definition.frameWidth, height: definition.frameHeight },
    }));
  }
  if (definition.type === "grid-sheet") {
    const source = projectPath(definition.sheet);
    const dimensions = inspectImage(source);
    if (dimensions.width % definition.frameWidth !== 0 || dimensions.height % definition.frameHeight !== 0) {
      throw new Error(`${definition.sheet}: grid incompatible with ${definition.frameWidth}x${definition.frameHeight}`);
    }
    const companion = definition.frameCountFrom
      ? inspectAnimatedImage(projectPath(definition.frameCountFrom))
      : { frameCount: definition.frameCount, fps: undefined };
    const frameCount = Number(companion.frameCount);
    const columns = dimensions.width / definition.frameWidth;
    const rows = dimensions.height / definition.frameHeight;
    if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > columns * rows) {
      throw new Error(`${definition.sheet}: frameCount ${frameCount} incompatible with ${columns}x${rows} grid`);
    }
    return Array.from({ length: frameCount }, (_, index) => ({
      source,
      sourceLabel: `${definition.sheet}#${index}`,
      sourceFps: companion.fps,
      rect: {
        x: (index % columns) * definition.frameWidth,
        y: Math.floor(index / columns) * definition.frameHeight,
        width: definition.frameWidth,
        height: definition.frameHeight,
      },
    }));
  }
  if (definition.type === "json-sheet") {
    const source = projectPath(definition.sheet);
    const dimensions = inspectImage(source);
    const metadata = JSON.parse(await readFile(projectPath(definition.json), "utf8"));
    if (!Array.isArray(metadata.frames) || metadata.frames.length === 0) {
      throw new Error(`${definition.json}: no frames`);
    }
    const sourceFps = Number(metadata.meta?.frameAnimations?.[0]?.fps) || undefined;
    return metadata.frames.map((entry, index) => {
      const frame = entry.frame;
      if (!frame || frame.x < 0 || frame.y < 0 || frame.w < 1 || frame.h < 1 ||
          frame.x + frame.w > dimensions.width || frame.y + frame.h > dimensions.height) {
        throw new Error(`${definition.json}#${index}: invalid rectangle`);
      }
      return {
        source,
        sourceLabel: `${definition.sheet}#${index}`,
        sourceFps,
        rect: { x: frame.x, y: frame.y, width: frame.w, height: frame.h },
      };
    });
  }
  if (definition.type === "unity-sheet") {
    const frames = await parseUnityFrames(definition.sheet);
    const step = definition.sampleStep ?? 1;
    const sampled = frames.filter((_, index) => index % step === 0);
    const finalFrame = frames.at(-1);
    if (finalFrame && sampled.at(-1) !== finalFrame) sampled.push(finalFrame);
    return sampled;
  }
  throw new Error(`Unknown 2D action type: ${definition.type}`);
};

const frameLayout = (fighter, actionDefinition, frames, cellSize) => {
  const padding = 6;
  if (actionDefinition.type === "unity-sheet") {
    const bounds = frames.reduce((result, frame) => ({
      left: Math.max(result.left, frame.pivot.x),
      right: Math.max(result.right, frame.rect.width - frame.pivot.x),
      top: Math.max(result.top, frame.pivot.y),
      bottom: Math.max(result.bottom, frame.rect.height - frame.pivot.y),
    }), { left: 0, right: 0, top: 0, bottom: 0 });
    const scale = Math.min(
      fighter.preferredScale ?? 1,
      (cellSize - 2 * padding) / (bounds.left + bounds.right),
      (cellSize - 2 * padding) / (bounds.top + bounds.bottom),
    );
    return { mode: "pivot", scale, anchorX: padding + bounds.left * scale, anchorY: padding + bounds.top * scale };
  }
  if (actionDefinition.type === "strip") {
    const scale = Math.min(
      fighter.preferredScale ?? 1,
      (cellSize - 2 * padding) / actionDefinition.frameWidth,
      (cellSize - 2 * padding) / actionDefinition.frameHeight,
    );
    return { mode: "bottom", scale, bottom: padding };
  }
  if (fighter.trimTransparent) {
    const rect = frames[0].rect;
    const scale = Math.min(
      fighter.preferredScale ?? 1,
      (cellSize - 2 * padding) / rect.width,
      (cellSize - 2 * padding) / rect.height,
    );
    return { mode: "bottom", scale, bottom: padding };
  }
  return { mode: "canvas" };
};

const renderFrame = (fighter, frame, layout, destination, cellSize) => {
  let scale;
  let x;
  let y;
  if (layout.mode === "canvas") {
    scale = Math.min(cellSize / frame.rect.width, cellSize / frame.rect.height);
    x = Math.round((cellSize - frame.rect.width * scale) / 2);
    y = Math.round((cellSize - frame.rect.height * scale) / 2);
  } else if (layout.mode === "pivot") {
    scale = layout.scale;
    x = Math.round(layout.anchorX - frame.pivot.x * scale);
    y = Math.round(layout.anchorY - frame.pivot.y * scale);
  } else {
    scale = layout.scale;
    x = Math.round((cellSize - frame.rect.width * scale) / 2);
    y = Math.round(cellSize - layout.bottom - frame.rect.height * scale);
  }
  const width = Math.max(1, Math.round(frame.rect.width * scale));
  const height = Math.max(1, Math.round(frame.rect.height * scale));
  if (x < 0 || y < 0 || x + width > cellSize || y + height > cellSize) {
    throw new Error(`${frame.sourceLabel}: normalized frame outside cell (${x},${y},${width},${height})`);
  }
  const filter = [
    `crop=${frame.rect.width}:${frame.rect.height}:${frame.rect.x}:${frame.rect.y}`,
    `scale=${width}:${height}:flags=${fighter.scaleFilter ?? "lanczos"}`,
    "format=rgba",
    `pad=${cellSize}:${cellSize}:${x}:${y}:color=0x00000000`,
  ].join(",");
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", frame.source, "-vf", filter, "-frames:v", "1", destination]);
};

const flattenSlots = (definition) => {
  const slots = {};
  for (const coverage of ["direct", "adapted", "author_required"]) {
    for (const [slot, action] of Object.entries(definition.slots[coverage] ?? {})) {
      if (slots[slot]) throw new Error(`${definition.displayName}/${slot}: slot classified twice`);
      slots[slot] = { action, coverage };
    }
  }
  const missing = SLOTS.filter((slot) => !slots[slot]);
  const unexpected = Object.keys(slots).filter((slot) => !SLOTS.includes(slot));
  if (missing.length || unexpected.length) {
    throw new Error(`${definition.displayName}: missing slots=[${missing}] unexpected slots=[${unexpected}]`);
  }
  return slots;
};

const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const unknownFighters = [...onlyFighters].filter((fighterId) => !manifest.fighters[fighterId]);
if (unknownFighters.length) throw new Error(`Unknown 2D fighters: ${unknownFighters.join(", ")}`);
const metadataPath = join(publicRoot, "2d-animation-metadata.json");
let consolidated = { version: manifest.version, cellSize: manifest.cellSize, columns: manifest.columns, fighters: {} };
if (onlyFighters.size) {
  try {
    const existing = JSON.parse(await readFile(metadataPath, "utf8"));
    if (existing.version === manifest.version && existing.cellSize === manifest.cellSize && existing.columns === manifest.columns) {
      consolidated = { ...existing, fighters: { ...existing.fighters } };
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

for (const [fighterId, fighter] of Object.entries(manifest.fighters)) {
  if (onlyFighters.size && !onlyFighters.has(fighterId)) continue;
  const slots = flattenSlots(fighter);
  const fighterRenderRoot = join(renderRoot, fighterId);
  await rm(fighterRenderRoot, { recursive: true, force: true });
  await mkdir(fighterRenderRoot, { recursive: true });

  const actions = {};
  for (const [actionName, actionDefinition] of Object.entries(fighter.actions)) {
    let sourceFrames = await resolveAction(actionDefinition);
    if (fighter.trimTransparent) sourceFrames = trimFramesToContent(sourceFrames);
    const actionFps = actionDefinition.fps ?? sourceFrames[0].sourceFps ?? fighter.defaultFps;
    const actionRoot = join(fighterRenderRoot, "actions", actionName);
    await mkdir(actionRoot, { recursive: true });
    const layout = frameLayout(fighter, actionDefinition, sourceFrames, manifest.cellSize);
    for (const [index, frame] of sourceFrames.entries()) {
      renderFrame(fighter, frame, layout, join(actionRoot, `frame-${String(index).padStart(4, "0")}.png`), manifest.cellSize);
    }
    const rows = Math.ceil(sourceFrames.length / manifest.columns);
    const atlasPng = join(fighterRenderRoot, `${actionName}.png`);
    const atlasWebp = join(fighterRenderRoot, `${actionName}.webp`);
    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-framerate", String(actionFps),
      "-i", join(actionRoot, "frame-%04d.png"),
      "-vf", `tile=${manifest.columns}x${rows}:nb_frames=${sourceFrames.length}:padding=0:margin=0,format=rgba,geq=r='if(lte(alpha(X,Y),20),0,r(X,Y))':g='if(lte(alpha(X,Y),20),0,g(X,Y))':b='if(lte(alpha(X,Y),20),0,b(X,Y))':a='if(lte(alpha(X,Y),20),0,alpha(X,Y))'`,
      "-frames:v", "1", atlasPng,
    ]);
    run("cwebp", ["-quiet", "-lossless", "-exact", "-q", "100", "-m", "6", "-metadata", "none", atlasPng, "-o", atlasWebp]);
    run("node", [join(projectRoot, "scripts/assert_clean_webp.mjs"), atlasWebp]);
    actions[actionName] = {
      atlasWebp,
      firstFrame: join(actionRoot, "frame-0000.png"),
      frameCount: sourceFrames.length,
      sourceFrameCount: actionDefinition.type === "unity-sheet"
        ? (await parseUnityFrames(actionDefinition.sheet)).length
        : sourceFrames.length,
      sampleStep: actionDefinition.sampleStep ?? 1,
      fps: actionFps,
      sources: [...new Set([
        ...sourceFrames.map((frame) => frame.sourceLabel.split("#")[0]),
        actionDefinition.json,
        actionDefinition.frameCountFrom,
      ].filter(Boolean))],
    };
  }

  const publicFighterRoot = join(publicRoot, fighterId);
  const atlasRoot = join(publicFighterRoot, "00");
  await rm(atlasRoot, { recursive: true, force: true });
  await mkdir(atlasRoot, { recursive: true });
  const slotMetadata = {};
  for (const slot of SLOTS) {
    const mapping = slots[slot];
    const action = actions[mapping.action];
    if (!action) throw new Error(`${fighterId}/${slot}: missing action ${mapping.action}`);
    const destination = join(atlasRoot, `${slot}.webp`);
    await copyFile(action.atlasWebp, destination);
    slotMetadata[slot] = {
      frameCount: action.frameCount,
      fps: action.fps,
      columns: manifest.columns,
      cellSize: manifest.cellSize,
      sourceAction: mapping.action,
      coverage: mapping.coverage,
      productionReady: mapping.coverage === "direct",
    };
  }

  const portrait = join(portraitRoot, fighterId, "select", "00.png");
  await mkdir(dirname(portrait), { recursive: true });
  await copyFile(actions[slots.idle.action].firstFrame, portrait);

  const counts = { direct: 0, adapted: 0, author_required: 0 };
  for (const mapping of Object.values(slots)) counts[mapping.coverage] += 1;
  const provenance = {
    id: fighterId,
    displayName: fighter.displayName,
    author: fighter.author,
    sourcePage: fighter.sourcePage,
    license: fighter.license,
    licenseUrl: fighter.licenseUrl,
    sourceProvenance: fighter.sourceProvenance,
    sourceSha256Manifest: fighter.sourceSha256Manifest,
    transformation: "Only upstream raster frames were cropped, uniformly scaled, padded, optionally sampled, tiled and losslessly WebP-encoded. Upstream JSON or GIF companions were used only to read frame rectangles, counts and rates. No frame or motion was synthesized.",
    coverageCounts: counts,
    actions: Object.fromEntries(Object.entries(actions).map(([name, action]) => [name, {
      frameCount: action.frameCount,
      sourceFrameCount: action.sourceFrameCount,
      sampleStep: action.sampleStep,
      fps: action.fps,
      sources: action.sources,
    }])),
    slots,
  };
  await writeFile(join(publicFighterRoot, "PROVENANCE.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  consolidated.fighters[fighterId] = slotMetadata;

  const hashLines = [];
  for (const slot of SLOTS) {
    const relative = `00/${slot}.webp`;
    hashLines.push(`${await sha256(join(publicFighterRoot, relative))}  ${relative}`);
  }
  hashLines.push(`${await sha256(portrait)}  ../../../ui/fighters/${fighterId}/select/00.png`);
  await writeFile(join(publicFighterRoot, "SHA256SUMS"), `${hashLines.join("\n")}\n`);
  console.log(`${fighterId}: ${counts.direct} direct, ${counts.adapted} adapted, ${counts.author_required} author_required`);
}

await writeFile(metadataPath, `${JSON.stringify(consolidated, null, 2)}\n`);
console.log(`Open 2D atlases generated in ${publicRoot}`);
