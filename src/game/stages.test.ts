import { describe, expect, it } from "vitest";
import {
  OPEN_STAGE_IDS,
  type InputFrame,
  type MatchConfig,
  type StageId,
} from "./contracts";
import { createEmptyInput, createGame } from "./engine";
import { FIGHTER_IDS, getFighterDefinition } from "./roster";
import {
  DEFAULT_STAGE_ID,
  STAGE_DEFINITIONS,
  STAGE_IDS,
  getStageDefinition,
  stagePixelToWorld,
  stageSurfaceYAt,
  stageWorldToPixel,
} from "./stages";

const configFor = (stage: StageId): MatchConfig => ({
  players: [
    { fighter: "kaykit-knight", skin: "00", name: "J1", slot: 0, cpu: false, cpuLevel: 1 },
    { fighter: "rgs-stick", skin: "00", name: "J2", slot: 1, cpu: false, cpuLevel: 1 },
  ],
  stocks: 3,
  items: false,
  itemFrequency: "medium",
  stage,
});

describe("open stage inventory", () => {
  it("is generated from ready packs and exposes a stable default", () => {
    expect(DEFAULT_STAGE_ID).toBe(STAGE_IDS[0]);
    expect(new Set(STAGE_IDS).size).toBe(STAGE_IDS.length);
  });

  it.runIf(!__PRIVATE_CONTENT_MODE__)("exposes no local-only stages in public mode", () => {
    expect(STAGE_IDS).toEqual(["verdant-grove"]);
    expect(Object.keys(STAGE_DEFINITIONS)).toEqual(["verdant-grove"]);
  });

  it.each(OPEN_STAGE_IDS)("contains a complete distributable definition for %s", (id) => {
    const stage = STAGE_DEFINITIONS[id];
    expect(stage.id).toBe(id);
    expect(stage.previewUrl).toContain("stages/verdant-grove/assets/preview.png");
    expect(stage.thumbnailUrl).toContain("stages/verdant-grove/assets/preview.thumb.webp");
    expect(stage.renderUrl).toContain("stages/verdant-grove/assets/arena.webp");
    expect(stage.backdropUrl).toContain("stages/verdant-grove/assets/backdrop.webp");
    expect(stage.scene).toBeUndefined();
    expect(stage.license).toMatchObject({ id: "CC0-1.0" });
    expect(stage.license.sourcePage).toMatch(/^https:\/\//);
    expect(stage.platforms.filter(({ id: platformId, kind }) =>
      platformId === "main" && kind === "ground"
    )).toHaveLength(1);
    expect(stage.spawns).toHaveLength(2);
    for (const ledge of stage.ledges) {
      expect(stage.platforms.find(({ id: platformId }) => platformId === ledge.platformId)?.kind)
        .toBe("ground");
    }
  });

  it.each(OPEN_STAGE_IDS)("round-trips calibrated art coordinates for %s", (stage) => {
    const source = { x: 137.25, y: 181.75 };
    const world = stagePixelToWorld(stage, source);
    const restored = stageWorldToPixel(stage, world);
    expect(restored.x).toBeCloseTo(source.x, 6);
    expect(restored.y).toBeCloseTo(source.y, 6);
  });

  it("aligns the grove collision surfaces with the visible grass lines", () => {
    const grove = OPEN_STAGE_IDS[0];
    const definition = getStageDefinition(grove);
    const visibleSurfaces = {
      main: { x: 960, y: 760 },
      left: { x: 638, y: 584 },
      right: { x: 1_282, y: 584 },
      top: { x: 960, y: 406 },
    } as const;
    for (const [platformId, pixel] of Object.entries(visibleSurfaces)) {
      const platform = definition.platforms.find(({ id }) => id === platformId)!;
      const visibleSurface = stagePixelToWorld(grove, pixel);
      expect(platform.x, platform.id).toBeCloseTo(visibleSurface.x, 0);
      expect(stageSurfaceYAt(platform, platform.x), platform.id).toBeCloseTo(
        visibleSurface.y,
        0,
      );
    }
    expect(stagePixelToWorld(grove, visibleSurfaces.main)).toEqual({ x: 0, y: 0 });
  });

  it("keeps every platform and spawn inside its blast zone", () => {
    for (const id of STAGE_IDS) {
      const stage = getStageDefinition(id);
      for (const spawn of stage.spawns) {
        expect(spawn.x).toBeGreaterThan(stage.blastZone.left);
        expect(spawn.x).toBeLessThan(stage.blastZone.right);
        expect(spawn.y).toBeGreaterThan(stage.blastZone.bottom);
        expect(spawn.y).toBeLessThan(stage.blastZone.top);
      }
      for (const platform of stage.platforms) {
        expect(platform.x - platform.width / 2).toBeGreaterThan(stage.blastZone.left);
        expect(platform.x + platform.width / 2).toBeLessThan(stage.blastZone.right);
        expect(stageSurfaceYAt(platform, platform.x)).toBeLessThan(stage.blastZone.top);
      }
    }
  });
});

describe("open stage gameplay", () => {
  it.each(STAGE_IDS)("lands both fighters on %s", (stage) => {
    const game = createGame(configFor(stage), { countdownFrames: 0 });
    for (let frame = 0; frame < 180; frame += 1) {
      game.step([createEmptyInput(), createEmptyInput()]);
    }
    const snapshot = game.getSnapshot();
    expect(snapshot.fighters[0].grounded).toBe(true);
    expect(snapshot.fighters[1].grounded).toBe(true);
    expect(snapshot.fighters.every(({ stocks }) => stocks === 3)).toBe(true);
  });

  it("exposes only the two true outer grove ledges", () => {
    const snapshot = createGame(configFor(OPEN_STAGE_IDS[0]), {
      countdownFrames: 0,
    }).getSnapshot();
    expect(snapshot.stage.ledges.map(({ platformId, side }) => ({ platformId, side }))).toEqual([
      { platformId: "main", side: "left" },
      { platformId: "main", side: "right" },
    ]);
    const ground = snapshot.stage.platforms.filter(({ kind }) => kind === "ground");
    expect(snapshot.stage.ledges[0]?.position.x).toBeCloseTo(
      Math.min(...ground.map(({ position, width }) => position.x - width / 2)),
      6,
    );
    expect(snapshot.stage.ledges[1]?.position.x).toBeCloseTo(
      Math.max(...ground.map(({ position, width }) => position.x + width / 2)),
      6,
    );
  });

  it("blocks the underside of solid ground", () => {
    const definition = getStageDefinition(DEFAULT_STAGE_ID);
    const main = definition.platforms.find(({ id }) => id === "main")!;
    const fighter = getFighterDefinition("kaykit-knight");
    const halfHeight = fighter.size.height / 2;
    const mainBottom = stageSurfaceYAt(main, main.x) - main.height;
    const jump: InputFrame = {
      held: new Set(["jump"]),
      pressed: new Set(["jump"]),
      released: new Set(),
      direction: { x: 0, y: 0 },
    };
    const groundGame = createGame(configFor(DEFAULT_STAGE_ID), {
      countdownFrames: 0,
      spawnPositions: [
        { x: main.x, y: mainBottom - halfHeight - 2 },
        { x: 500, y: 600 },
      ],
    });
    const blocked = groundGame.step([jump, createEmptyInput()]).fighters[0];
    expect(blocked.position.y).toBeLessThanOrEqual(mainBottom - halfHeight);
    expect(blocked.velocity.y).toBeLessThanOrEqual(0);
  });

  it("keeps the highest double-jump apex below the top blast zone", () => {
    const definition = getStageDefinition(DEFAULT_STAGE_ID);
    const highestSurface = Math.max(
      ...definition.platforms.map((platform) => stageSurfaceYAt(platform, platform.x)),
    );
    const discreteRise = (velocity: number, gravity: number): number => {
      let rise = 0;
      let speed = velocity;
      while (speed > 0) {
        speed -= gravity / 60;
        rise += Math.max(0, speed) / 60;
      }
      return rise;
    };
    for (const fighterId of FIGHTER_IDS) {
      const fighter = getFighterDefinition(fighterId);
      const apex = highestSurface + fighter.size.height / 2 +
        discreteRise(fighter.jumpSpeed, fighter.gravity) +
        discreteRise(fighter.doubleJumpSpeed, fighter.gravity);
      expect(definition.blastZone.top - apex, fighterId).toBeGreaterThan(80);
    }
  });
});
