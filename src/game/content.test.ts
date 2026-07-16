import { describe, expect, it } from "vitest";
import {
  CHARACTER_PORTRAITS,
  isFighterProductionReady,
  isFighterVisualReady,
} from "./characterAssets";
import { FIGHTER_SKINS, SKIN_IDS } from "./content";
import {
  FIGHTER_IDS,
  MELEE_FIGHTER_IDS,
  OPEN_2D_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
} from "./roster";

describe("local fighter skins", () => {
  it("declares four private skins and only rendered open variants", () => {
    expect(FIGHTER_IDS).toHaveLength(MELEE_FIGHTER_IDS.length + OPEN_FIGHTER_IDS.length);
    expect(SKIN_IDS).toEqual(["00", "01", "02", "03"]);

    for (const fighter of MELEE_FIGHTER_IDS) {
      const skins = FIGHTER_SKINS[fighter];
      expect(skins).toHaveLength(4);
      expect(new Set(skins.map(({ id }) => id)).size).toBe(4);
      expect(
        skins.every(({ portrait }) =>
          portrait.startsWith(`/assets/ui/fighters/${fighter}/select/`),
        ),
      ).toBe(true);
      expect(CHARACTER_PORTRAITS[fighter]).toBe(skins[0]?.portrait);
      expect(skins.every(({ productionReady }) => !productionReady)).toBe(true);
      expect(isFighterProductionReady(fighter)).toBe(false);
    }

    for (const fighter of OPEN_FIGHTER_IDS) {
      const skins = FIGHTER_SKINS[fighter];
      expect(skins.map(({ id }) => id)).toEqual(["00"]);
      expect(skins[0]?.portrait).toBe(`/assets/ui/fighters/${fighter}/select/00.png`);
      expect(skins[0]?.visualReady).toBe(isFighterVisualReady(fighter));
      expect(skins[0]?.productionReady).toBe(isFighterProductionReady(fighter));
      expect(CHARACTER_PORTRAITS[fighter]).toBe(skins[0]?.portrait);
    }
    expect(OPEN_2D_FIGHTER_IDS.every(isFighterVisualReady)).toBe(true);
    expect(OPEN_2D_FIGHTER_IDS.some(isFighterProductionReady)).toBe(false);
  });

  it("never simulates native materials with a CSS colour filter", () => {
    for (const skins of Object.values(FIGHTER_SKINS)) {
      expect(skins.every(({ filter }) => filter === "none")).toBe(true);
    }
  });
});
