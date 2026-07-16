import { describe, expect, it } from "vitest";
import {
  FIGHTER_IDS,
  MELEE_FIGHTER_ID_CATALOG,
  MELEE_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
} from "./contracts";
import { isFighterVisualReady } from "./fighterVisuals";

describe.runIf(__PUBLIC_CONTENT_ONLY__)("public-content-only build", () => {
  it("publishes only distributable fighters even when private assets exist locally", () => {
    expect(__PRIVATE_CONTENT_MODE__).toBe(false);
    expect(MELEE_FIGHTER_IDS).toEqual([]);
    expect(FIGHTER_IDS).toEqual(OPEN_FIGHTER_IDS);
    expect(MELEE_FIGHTER_ID_CATALOG.every((fighter) => !isFighterVisualReady(fighter))).toBe(true);
  });
});
