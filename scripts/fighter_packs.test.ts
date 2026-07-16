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
const cli = join(projectRoot, "scripts/fighter_packs.mjs");
const temporaryRoots: string[] = [];

const createWorkspace = (): {
  root: string;
  packs: string;
  registry: string;
  manifest3D: string;
  manifest2D: string;
} => {
  const root = mkdtempSync(join(tmpdir(), "super-bash-folds-fighter-pack-"));
  temporaryRoots.push(root);
  const packs = join(root, "fighters");
  mkdirSync(packs);
  copyFileSync(join(projectRoot, "fighters/pipeline.config.json"), join(packs, "pipeline.config.json"));
  return {
    root,
    packs,
    registry: join(root, "generated/openFighterRegistry.ts"),
    manifest3D: join(root, "generated/manifest.json"),
    manifest2D: join(root, "generated/2d_manifest.json"),
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
    FIGHTER_PACKS_ROOT: workspace.packs,
    FIGHTER_REGISTRY_OUT: workspace.registry,
    OPEN_3D_MANIFEST_OUT: workspace.manifest3D,
    OPEN_2D_MANIFEST_OUT: workspace.manifest2D,
  },
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("fighter pack CLI", () => {
  it("scaffolds a draft that stays out of the generated roster", () => {
    const workspace = createWorkspace();

    expect(runCli(workspace, "new", "example-fighter", "--kind", "2d")).toContain(
      "Draft fighter pack created",
    );
    const draft = JSON.parse(
      readFileSync(join(workspace.packs, "example-fighter/fighter.json"), "utf8"),
    );
    expect(draft).toMatchObject({ id: "example-fighter", kind: "2d", status: "draft" });

    expect(runCli(workspace, "build")).toContain("1 draft(s) skipped");
    expect(readFileSync(workspace.registry, "utf8")).toContain(
      "export const OPEN_FIGHTER_PACKS = [] as const",
    );
  });

  it("registers a ready drop-in pack without editing src", () => {
    const workspace = createWorkspace();
    const fighterDirectory = join(workspace.packs, "community-fighter");
    cpSync(join(projectRoot, "fighters/rgs-stick"), fighterDirectory, { recursive: true });

    const fighterPath = join(fighterDirectory, "fighter.json");
    const fighter = JSON.parse(readFileSync(fighterPath, "utf8"));
    fighter.id = "community-fighter";
    fighter.order = 10;
    fighter.identity.displayName = "Community Fighter";
    writeFileSync(fighterPath, `${JSON.stringify(fighter, null, 2)}\n`);

    runCli(workspace, "build");

    const registry = readFileSync(workspace.registry, "utf8");
    const manifest2D = JSON.parse(readFileSync(workspace.manifest2D, "utf8"));
    expect(registry).toContain('"community-fighter"');
    expect(registry).toContain('"displayName": "Community Fighter"');
    expect(Object.keys(manifest2D.fighters)).toEqual(["community-fighter"]);
    expect(JSON.parse(readFileSync(workspace.manifest3D, "utf8")).fighters).toEqual({});
  });
});
