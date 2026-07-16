import { describe, expect, it } from "vitest";
import { FIGHTER_IDS, OPEN_FIGHTER_IDS } from "./contracts";
import { isFighterVisualReady } from "./fighterVisuals";

describe("public fighter roster", () => {
  it("publishes only registered redistributable fighters", () => {
    expect(FIGHTER_IDS).toEqual(OPEN_FIGHTER_IDS);
    expect(FIGHTER_IDS.length).toBeGreaterThan(0);
    expect(FIGHTER_IDS.some(isFighterVisualReady)).toBe(true);
  });
});
