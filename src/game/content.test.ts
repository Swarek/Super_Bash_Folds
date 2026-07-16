import { describe, expect, it } from "vitest";
import {
  CHARACTER_PORTRAITS,
  isFighterProductionReady,
  isFighterVisualReady,
} from "./characterAssets";
import { FIGHTER_SKINS, SKIN_IDS } from "./content";
import { FIGHTER_IDS, OPEN_2D_FIGHTER_IDS } from "./roster";

describe("fighter skins", () => {
  it("declares one redistributable rendered skin per fighter", () => {
    expect(SKIN_IDS).toEqual(["00", "01", "02", "03"]);
    for (const fighter of FIGHTER_IDS) {
      const skins = FIGHTER_SKINS[fighter];
      expect(skins.map(({ id }) => id)).toEqual(["00"]);
      expect(skins[0]?.portrait).toBe(`/assets/ui/fighters/${fighter}/select/00.png`);
      expect(skins[0]?.visualReady).toBe(isFighterVisualReady(fighter));
      expect(skins[0]?.productionReady).toBe(isFighterProductionReady(fighter));
      expect(CHARACTER_PORTRAITS[fighter]).toBe(skins[0]?.portrait);
    }
    expect(OPEN_2D_FIGHTER_IDS.every(isFighterVisualReady)).toBe(true);
  });

  it("keeps authored materials unfiltered", () => {
    for (const skins of Object.values(FIGHTER_SKINS)) {
      expect(skins.every(({ filter }) => filter === "none")).toBe(true);
    }
  });
});
