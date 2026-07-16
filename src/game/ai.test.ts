import { describe, expect, it } from "vitest";
import type { MatchConfig } from "./contracts";
import {
  AI_DIFFICULTIES,
  createCpuController,
  projectileSpecialDirectionForFighter,
} from "./ai";
import { createGame } from "./engine";
import { DEFAULT_STAGE_ID } from "./stages";

const config: MatchConfig = {
  players: [
    { fighter: "mario", skin: "00", name: "CPU", slot: 0, cpu: true, cpuLevel: 3 },
    { fighter: "link", skin: "00", name: "J2", slot: 1, cpu: false, cpuLevel: 1 },
  ],
  stocks: 3,
  items: false,
  itemFrequency: "medium",
  stage: DEFAULT_STAGE_ID,
};

describe("CpuController", () => {
  it("clearly differentiates the reaction times of all three levels", () => {
    expect(AI_DIFFICULTIES[3].reactionFrames[1]).toBeLessThan(
      AI_DIFFICULTIES[1].reactionFrames[0],
    );
    expect(AI_DIFFICULTIES[3].mistakeChance).toBeLessThan(AI_DIFFICULTIES[2].mistakeChance);
    expect(AI_DIFFICULTIES[3].defendChance).toBeGreaterThan(AI_DIFFICULTIES[1].defendChance);
  });

  it("uses up special to recover from very low offstage", () => {
    const game = createGame(config, {
      countdownFrames: 0,
      spawnPositions: [
        { x: 670, y: -250 },
        { x: 0, y: 100 },
      ],
    });
    const controller = createCpuController(0, 3, 42);
    const frame = controller.next(game.getSnapshot());
    expect(frame.pressed.has("special")).toBe(true);
    expect(frame.pressed.has("up")).toBe(true);
    expect(frame.direction.x).toBeLessThan(0);
    expect(frame.direction.y).toBeGreaterThan(0);
  });

  it("uses Jigglypuff's jumps instead of Sing to recover", () => {
    const puffConfig: MatchConfig = {
      ...config,
      players: [
        { fighter: "jigglypuff", skin: "00", name: "CPU", slot: 0, cpu: true, cpuLevel: 3 },
        config.players[1],
      ],
    };
    const game = createGame(puffConfig, {
      countdownFrames: 0,
      spawnPositions: [{ x: 570, y: -250 }, { x: 0, y: 100 }],
    });
    const controller = createCpuController(0, 3, 42);
    const frame = controller.next(game.getSnapshot());
    expect(frame.pressed.has("jump")).toBe(true);
    expect(frame.pressed.has("special")).toBe(false);
  });

  it("aims the special that actually carries each fighter's projectile", () => {
    expect(projectileSpecialDirectionForFighter("zelda", 1)).toEqual({ x: 1, y: 0 });
    expect(projectileSpecialDirectionForFighter("peach", 1)).toEqual({ x: 0, y: -1 });
    expect(projectileSpecialDirectionForFighter("yoshi", -1)).toEqual({ x: 0, y: 1 });
    expect(projectileSpecialDirectionForFighter("samus", -1)).toEqual({ x: 0, y: 0 });
    expect(projectileSpecialDirectionForFighter("captain-falcon", 1)).toBeNull();
  });

  it("produces an autonomous duel that closes distance and lands a hit", () => {
    const versusConfig: MatchConfig = {
      ...config,
      players: [
        { fighter: "mario", skin: "00", name: "CPU 1", slot: 0, cpu: true, cpuLevel: 3 },
        { fighter: "pikachu", skin: "00", name: "CPU 2", slot: 1, cpu: true, cpuLevel: 3 },
      ],
    };
    const game = createGame(versusConfig, { countdownFrames: 0, seed: 7 });
    const first = createCpuController(0, 3, 11);
    const second = createCpuController(1, 3, 29);
    let hitCount = 0;
    for (let frame = 0; frame < 1_800 && hitCount === 0; frame += 1) {
      const before = game.getSnapshot();
      const snapshot = game.step([first.next(before), second.next(before)]);
      hitCount += snapshot.events.filter((event) => event.type === "hit").length;
    }
    expect(hitCount).toBeGreaterThan(0);
  });
});
