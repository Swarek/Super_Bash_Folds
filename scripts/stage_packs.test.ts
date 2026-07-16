import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const cli = join(projectRoot, "scripts/stage_packs.mjs");
const fixture = join(projectRoot, "stages/verdant-grove");
const temporaryRoots: string[] = [];

const createWorkspace = (): { root: string; packs: string; registry: string } => {
  const root = mkdtempSync(join(tmpdir(), "super-bash-folds-stage-pack-"));
  temporaryRoots.push(root);
  const packs = join(root, "stages");
  mkdirSync(packs);
  copyFileSync(join(projectRoot, "stages/pipeline.config.json"), join(packs, "pipeline.config.json"));
  cpSync(fixture, join(packs, "verdant-grove"), { recursive: true });
  return {
    root,
    packs,
    registry: join(root, "generated/openStageRegistry.ts"),
  };
};

const runCli = (
  workspace: ReturnType<typeof createWorkspace>,
  ...args: string[]
): string => execFileSync(process.execPath, [cli, ...args], {
  cwd: projectRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    STAGE_PACKS_ROOT: workspace.packs,
    STAGE_REGISTRY_OUT: workspace.registry,
  },
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("stage pack CLI", () => {
  it("scaffolds a draft that stays out of the generated stage inventory", () => {
    const workspace = createWorkspace();
    expect(runCli(workspace, "new", "community-stage", "--kind", "2d")).toContain(
      "Draft stage pack created",
    );
    const draft = JSON.parse(
      readFileSync(join(workspace.packs, "community-stage/stage.json"), "utf8"),
    );
    expect(draft).toMatchObject({ id: "community-stage", status: "draft" });

    expect(runCli(workspace, "build")).toContain("1 draft(s) skipped");
    const registry = readFileSync(workspace.registry, "utf8");
    expect(registry).toContain('"verdant-grove"');
    expect(registry).not.toContain('"community-stage"');
  });

  it("registers a ready drop-in pack without editing application source", () => {
    const workspace = createWorkspace();
    const communityDirectory = join(workspace.packs, "community-grove");
    cpSync(fixture, communityDirectory, { recursive: true });
    const stagePath = join(communityDirectory, "stage.json");
    const stage = JSON.parse(readFileSync(stagePath, "utf8"));
    stage.id = "community-grove";
    stage.order = 20;
    stage.identity.displayName = "Community Grove";
    writeFileSync(stagePath, `${JSON.stringify(stage, null, 2)}\n`);

    runCli(workspace, "build");
    const registry = readFileSync(workspace.registry, "utf8");
    expect(registry).toContain('"community-grove"');
    expect(registry).toContain('"displayName": "Community Grove"');
    expect(registry).toContain("community-grove/assets/arena.webp?url");
  });

  it("rejects an asset path escaping its pack", () => {
    const workspace = createWorkspace();
    const stagePath = join(workspace.packs, "verdant-grove/stage.json");
    const stage = JSON.parse(readFileSync(stagePath, "utf8"));
    stage.render.preview = "../outside.png";
    writeFileSync(stagePath, `${JSON.stringify(stage, null, 2)}\n`);

    expect(() => runCli(workspace, "build")).toThrow(/escapes the stage pack/);
  });

  it("detects a stale generated registry", () => {
    const workspace = createWorkspace();
    runCli(workspace, "build");
    const stagePath = join(workspace.packs, "verdant-grove/stage.json");
    const stage = JSON.parse(readFileSync(stagePath, "utf8"));
    stage.identity.description = "Updated description";
    writeFileSync(stagePath, `${JSON.stringify(stage, null, 2)}\n`);

    expect(() => runCli(workspace, "check")).toThrow(/Outdated registry/);
  });
});
