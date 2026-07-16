#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packRoot = resolve(process.env.FIGHTER_PACKS_ROOT ?? join(projectRoot, "fighters"));
const registryOut = resolve(
  process.env.FIGHTER_REGISTRY_OUT ?? join(projectRoot, "src/game/generated/openFighterRegistry.ts"),
);
const manifest3DOut = resolve(
  process.env.OPEN_3D_MANIFEST_OUT ?? join(projectRoot, "scripts/open_fighter_pipeline/manifest.json"),
);
const manifest2DOut = resolve(
  process.env.OPEN_2D_MANIFEST_OUT ?? join(projectRoot, "scripts/open_fighter_pipeline/2d_manifest.json"),
);
const pipelineConfigPath = join(packRoot, "pipeline.config.json");
const command = process.argv[2] ?? "help";
const args = process.argv.slice(3);

const SPECIAL_NAMES = ["neutral-special", "side-special", "up-special", "down-special"];
const MOVE_NAMES = new Set([
  "jab", "dash-attack", "forward-tilt", "up-tilt", "down-tilt",
  "forward-smash", "up-smash", "down-smash", "neutral-air", "forward-air",
  "back-air", "up-air", "down-air", ...SPECIAL_NAMES,
]);
const MATERIALS = new Set([
  "physical", "blade", "heavy", "fire", "electric", "energy", "wind", "water",
]);
const TRAITS = new Set(["blade", "heavy", "electric"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const positiveInteger = (value) => Number.isInteger(value) && value > 0;
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const validUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const validateCommon = (pack, directoryName) => {
  assert(isObject(pack), `${directoryName}: fighter.json must contain an object`);
  assert(pack.schemaVersion === 1, `${directoryName}: schemaVersion must equal 1`);
  assert(pack.status === "draft" || pack.status === "ready", `${directoryName}: invalid status`);
  assert(nonEmpty(pack.id) && ID_PATTERN.test(pack.id), `${directoryName}: invalid id`);
  assert(pack.id === directoryName, `${directoryName}: id ${pack.id} does not match the directory`);
  assert(pack.kind === "2d" || pack.kind === "3d", `${pack.id}: kind must be 2d or 3d`);
  assert(positiveInteger(pack.order), `${pack.id}: order must be a positive integer`);
  assert(isObject(pack.identity), `${pack.id}: identity is missing`);
  for (const key of ["displayName", "archetype", "playstyle"]) {
    assert(nonEmpty(pack.identity[key]), `${pack.id}: identity.${key} is missing`);
  }
  assert(isObject(pack.identity.colors), `${pack.id}: identity.colors is missing`);
  for (const key of ["primary", "secondary", "accent"]) {
    assert(COLOR_PATTERN.test(pack.identity.colors[key] ?? ""), `${pack.id}: invalid ${key} color`);
  }
};

const validateReadyPack = (pack, render, config) => {
  const { id, gameplay, visual, effects } = pack;
  assert(isObject(gameplay), `${id}: gameplay is missing`);
  assert(isObject(gameplay.size), `${id}: gameplay.size is missing`);
  for (const key of ["width", "height"]) {
    assert(positive(gameplay.size[key]), `${id}: invalid gameplay.size.${key}`);
  }
  for (const key of [
    "spriteReferenceHeight", "weight", "dash", "run", "air", "gravity", "fall",
    "fastFall", "jump", "doubleJump", "shortHop",
  ]) {
    assert(positive(gameplay[key]), `${id}: invalid gameplay.${key}`);
  }
  for (const key of ["dashFrames", "jumpSquat"]) {
    assert(positiveInteger(gameplay[key]), `${id}: invalid gameplay.${key}`);
  }
  for (const key of ["power", "speed", "reach"]) {
    assert(gameplay[key] === undefined || positive(gameplay[key]), `${id}: invalid gameplay.${key}`);
  }
  assert(isObject(gameplay.specials), `${id}: gameplay.specials is missing`);
  for (const special of SPECIAL_NAMES) {
    const definition = gameplay.specials[special];
    assert(isObject(definition), `${id}: special ${special} is missing`);
    assert(nonEmpty(definition.label), `${id}: ${special} label is missing`);
    assert(typeof definition.damage === "number" && definition.damage >= 0, `${id}: invalid ${special} damage`);
  }

  assert(isObject(visual), `${id}: visual is missing`);
  assert(visual.sourceFacing === "left" || visual.sourceFacing === "right", `${id}: invalid sourceFacing`);
  assert(nonEmpty(visual.attribution), `${id}: attribution is missing`);
  assert(validUrl(visual.sourcePage), `${id}: invalid sourcePage`);
  assert(isObject(visual.license) && nonEmpty(visual.license.id), `${id}: license is missing`);
  assert(visual.license.url === undefined || validUrl(visual.license.url), `${id}: invalid license URL`);

  assert(isObject(effects), `${id}: effects is missing`);
  assert(isObject(effects.materials), `${id}: effects.materials is missing`);
  for (const [move, material] of Object.entries(effects.materials)) {
    assert(MOVE_NAMES.has(move), `${id}: unknown effect move ${move}`);
    assert(MATERIALS.has(material), `${id}: unknown material ${material}`);
  }
  assert(Array.isArray(effects.traits), `${id}: effects.traits must be an array`);
  assert(new Set(effects.traits).size === effects.traits.length, `${id}: duplicate effect trait`);
  for (const trait of effects.traits) assert(TRAITS.has(trait), `${id}: unknown trait ${trait}`);

  assert(isObject(render), `${id}: render.json must contain an object`);
  for (const key of ["displayName", "author", "sourcePage", "license", "licenseUrl"]) {
    assert(nonEmpty(render[key]), `${id}: render.${key} is missing`);
  }
  assert(render.sourcePage === visual.sourcePage, `${id}: sourcePage differs between fighter.json and render.json`);
  assert(render.license === visual.license.id, `${id}: license differs between fighter.json and render.json`);
  if (render.additionalSources !== undefined) {
    assert(Array.isArray(render.additionalSources), `${id}: additionalSources must be an array`);
    for (const [index, source] of render.additionalSources.entries()) {
      assert(isObject(source), `${id}: invalid additionalSources[${index}]`);
      for (const key of ["role", "name", "author", "license"]) {
        assert(nonEmpty(source[key]), `${id}: additionalSources[${index}].${key} is missing`);
      }
      assert(validUrl(source.sourcePage), `${id}: invalid additionalSources[${index}].sourcePage`);
      assert(validUrl(source.licenseUrl), `${id}: invalid additionalSources[${index}].licenseUrl`);
    }
  }

  if (pack.kind === "3d") {
    assert(nonEmpty(render.model), `${id}: 3D model is missing`);
    assert(nonEmpty(render.armature), `${id}: armature is missing`);
    assert(nonEmpty(render.slotProfile), `${id}: slotProfile is missing`);
    const profile = config.threeD.slotProfiles[render.slotProfile];
    assert(isObject(profile), `${id}: unknown slotProfile ${render.slotProfile}`);
    assert(isObject(render.actionAliases), `${id}: actionAliases is missing`);
    for (const alias of Object.values(profile)) {
      assert(nonEmpty(render.actionAliases[alias]), `${id}: missing animation alias ${alias}`);
    }
    const slotNames = new Set(Object.keys(profile));
    const direct = render.directSlots ?? [];
    const authorRequired = render.authorRequiredSlots ?? [];
    assert(Array.isArray(direct) && Array.isArray(authorRequired), `${id}: invalid 3D classifications`);
    for (const slot of [...direct, ...authorRequired]) {
      assert(slotNames.has(slot), `${id}: unknown 3D slot ${slot}`);
    }
    assert(new Set([...direct, ...authorRequired]).size === direct.length + authorRequired.length,
      `${id}: 3D slot classified more than once`);
  } else {
    assert(isObject(render.actions) && Object.keys(render.actions).length > 0, `${id}: 2D actions are missing`);
    assert(isObject(render.slots), `${id}: 2D slots are missing`);
    const expectedSlots = Object.keys(config.threeD.slotProfiles["platform-fighter"]);
    const classified = [];
    for (const grade of ["direct", "adapted", "author_required"]) {
      assert(isObject(render.slots[grade]), `${id}: slots.${grade} is missing`);
      for (const [slot, action] of Object.entries(render.slots[grade])) {
        assert(expectedSlots.includes(slot), `${id}: unknown 2D slot ${slot}`);
        assert(render.actions[action] !== undefined, `${id}: missing 2D action ${action}`);
        classified.push(slot);
      }
    }
    assert(classified.length === expectedSlots.length, `${id}: ${classified.length}/${expectedSlots.length} slots 2D`);
    assert(new Set(classified).size === classified.length, `${id}: 2D slot classified more than once`);
  }
};

const loadPacks = async () => {
  const config = await readJson(pipelineConfigPath);
  assert(config.version === 1, "fighters/pipeline.config.json: invalid version");
  assert(isObject(config.threeD?.slotProfiles?.["platform-fighter"]), "platform-fighter profile is missing");
  const directories = (await readdir(packRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  const loaded = [];
  for (const directoryName of directories) {
    const directory = join(packRoot, directoryName);
    const pack = await readJson(join(directory, "fighter.json"));
    const render = await readJson(join(directory, "render.json"));
    validateCommon(pack, directoryName);
    if (pack.status === "ready") validateReadyPack(pack, render, config);
    loaded.push({ pack, render, directory });
  }
  const ids = loaded.map(({ pack }) => pack.id);
  const orders = loaded.filter(({ pack }) => pack.status === "ready").map(({ pack }) => pack.order);
  assert(new Set(ids).size === ids.length, "Duplicate fighter pack IDs");
  assert(new Set(orders).size === orders.length, "Duplicate ready fighter pack order values");
  loaded.sort((left, right) => left.pack.order - right.pack.order || left.pack.id.localeCompare(right.pack.id));
  return { config, loaded };
};

const generatedOutputs = ({ config, loaded }) => {
  const ready = loaded.filter(({ pack }) => pack.status === "ready");
  const packs = ready.map(({ pack }) => pack);
  const ids3D = packs.filter(({ kind }) => kind === "3d").map(({ id }) => id);
  const ids2D = packs.filter(({ kind }) => kind === "2d").map(({ id }) => id);
  const registry = [
    "/* Generated by scripts/fighter_packs.mjs. Do not edit directly. */",
    `export const OPEN_3D_FIGHTER_IDS = ${JSON.stringify(ids3D, null, 2)} as const;`,
    `export const OPEN_2D_FIGHTER_IDS = ${JSON.stringify(ids2D, null, 2)} as const;`,
    `export const OPEN_FIGHTER_PACKS = ${JSON.stringify(packs, null, 2)} as const;`,
    "",
  ].join("\n");
  const manifest3D = {
    generatedBy: "scripts/fighter_packs.mjs",
    version: config.threeD.version,
    slotProfiles: config.threeD.slotProfiles,
    fighters: Object.fromEntries(
      ready.filter(({ pack }) => pack.kind === "3d").map(({ pack, render }) => [pack.id, render]),
    ),
  };
  const manifest2D = {
    generatedBy: "scripts/fighter_packs.mjs",
    version: config.twoD.version,
    cellSize: config.twoD.cellSize,
    columns: config.twoD.columns,
    excludedCandidates: config.twoD.excludedCandidates ?? {},
    fighters: Object.fromEntries(
      ready.filter(({ pack }) => pack.kind === "2d").map(({ pack, render }) => [pack.id, render]),
    ),
  };
  return new Map([
    [registryOut, registry],
    [manifest3DOut, json(manifest3D)],
    [manifest2DOut, json(manifest2D)],
  ]);
};

const writeAtomic = async (path, content) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, content);
  await rename(temporary, path);
};

const syncGenerated = async (state) => {
  const outputs = generatedOutputs(state);
  for (const [path, content] of outputs) await writeAtomic(path, content);
  return outputs;
};

const checkGenerated = async (state) => {
  for (const [path, expected] of generatedOutputs(state)) {
    let actual;
    try {
      actual = await readFile(path, "utf8");
    } catch {
      fail(`Generated output is missing: ${path}`);
    }
    assert(actual === expected, `Generated output is outdated: ${path}. Run npm run fighter:build`);
  }
};

const run = (executable, executableArgs, options = {}) => {
  const result = spawnSync(executable, executableArgs, {
    cwd: projectRoot,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
  if (result.status !== 0) fail(`${executable} failed with code ${result.status}`);
};

const scaffold = async () => {
  const id = args.find((argument) => !argument.startsWith("--"));
  const kindIndex = args.indexOf("--kind");
  const kind = kindIndex >= 0 ? args[kindIndex + 1] : undefined;
  assert(id && ID_PATTERN.test(id), "Usage: npm run fighter:new -- <id> --kind 2d|3d");
  assert(kind === "2d" || kind === "3d", "--kind must be 2d or 3d");
  const destination = join(packRoot, id);
  try {
    await access(destination);
    fail(`Fighter pack ${id} already exists`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) throw error;
  }
  const { loaded } = await loadPacks();
  const order = Math.max(0, ...loaded.map(({ pack }) => pack.order)) + 10;
  const displayName = id.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
  const fighter = {
    $schema: "../fighter.schema.json",
    schemaVersion: 1,
    status: "draft",
    id,
    kind,
    order,
    identity: {
      displayName,
      archetype: "Prototype",
      playstyle: "Define in the fighter pack",
      colors: { primary: "#4f7cff", secondary: "#222838", accent: "#ffe066" },
    },
    gameplay: {
      size: { width: 64, height: 92 },
      spriteReferenceHeight: 138,
      weight: 100,
      dash: 1.7,
      dashFrames: 8,
      run: 1.6,
      air: 1,
      gravity: 0.1,
      fall: 2.1,
      fastFall: 2.9,
      jump: 2.6,
      doubleJump: 2.35,
      jumpSquat: 4,
      shortHop: 0.63,
      specials: Object.fromEntries(SPECIAL_NAMES.map((name) => [name, {
        label: displayName,
        damage: 10,
      }])),
    },
    visual: {
      sourceFacing: "right",
      attribution: displayName,
      sourcePage: "https://example.invalid/replace-with-source",
      license: { id: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
    },
    effects: { materials: {}, traits: [] },
  };
  const render = kind === "3d"
    ? {
        displayName,
        author: "Replace with author",
        sourcePage: fighter.visual.sourcePage,
        license: fighter.visual.license.id,
        licenseUrl: fighter.visual.license.url,
        model: "fighters/replace-with-model.glb",
        armature: "Armature",
        cameraAxis: "-X",
        sourceFacing: "right",
        framingPadding: 1.15,
        slotProfile: "platform-fighter",
        actionAliases: {},
        directSlots: [],
        authorRequiredSlots: [],
      }
    : {
        displayName,
        author: "Replace with author",
        sourcePage: fighter.visual.sourcePage,
        license: fighter.visual.license.id,
        licenseUrl: fighter.visual.license.url,
        defaultFps: 12,
        preferredScale: 0.7,
        actions: {},
        slots: { direct: {}, adapted: {}, author_required: {} },
      };
  await mkdir(destination, { recursive: false });
  await writeFile(join(destination, "fighter.json"), json(fighter));
  await writeFile(join(destination, "render.json"), json(render));
  console.log(`Draft fighter pack created: ${destination}`);
  console.log("Complete fighter.json and render.json, then set status to ready.");
};

const build = async () => {
  const state = await loadPacks();
  await syncGenerated(state);
  const ready = state.loaded.filter(({ pack }) => pack.status === "ready");
  const drafts = state.loaded.length - ready.length;
  console.log(`${ready.length} fighter pack(s) synchronized${drafts ? `; ${drafts} draft(s) skipped` : ""}.`);
  const requestedId = args.find((argument) => !argument.startsWith("--"));
  if (!requestedId) return;
  const selected = ready.find(({ pack }) => pack.id === requestedId);
  assert(selected, `Ready fighter pack not found: ${requestedId}`);
  if (selected.pack.kind === "3d") {
    run("zsh", ["scripts/open_fighter_pipeline/render_all.sh"], {
      env: { OPEN_FIGHTERS: requestedId },
    });
  } else {
    run("zsh", ["scripts/open_fighter_pipeline/render_2d_all.sh"], {
      env: { OPEN_2D_FIGHTERS: requestedId },
    });
  }
  run("node", ["scripts/build_ui_thumbnails.mjs", requestedId]);
  run("node", ["scripts/validate_open_fighters.mjs"]);
};

const check = async () => {
  const state = await loadPacks();
  await checkGenerated(state);
  run("node", ["scripts/validate_open_fighters.mjs"], {
    env: args.includes("--deep") ? { OPEN_FIGHTER_DEEP: "1" } : {},
  });
  const ready = state.loaded.filter(({ pack }) => pack.status === "ready").length;
  console.log(`${ready} fighter pack(s) valid and synchronized.`);
};

const help = () => {
  console.log(`Fighter pack commands:
  npm run fighter:new -- <id> --kind 2d|3d
  npm run fighter:build
  npm run fighter:build -- <id>
  npm run fighter:check
  npm run fighter:check -- --deep`);
};

try {
  if (command === "new") await scaffold();
  else if (command === "build") await build();
  else if (command === "check") await check();
  else help();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
