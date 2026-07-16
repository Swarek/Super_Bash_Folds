import { describe, expect, it } from "vitest";
import {
  FIGHTER_IDS,
  MELEE_FIGHTER_ID_CATALOG,
  MELEE_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
} from "./contracts";

describe.runIf(__PRIVATE_CONTENT_MODE__)("explicit private content overlay", () => {
  it("enables the complete local fighter catalog without changing open packs", () => {
    expect(__PUBLIC_CONTENT_ONLY__).toBe(false);
    expect(MELEE_FIGHTER_IDS).toEqual(MELEE_FIGHTER_ID_CATALOG);
    expect(FIGHTER_IDS).toEqual([...MELEE_FIGHTER_ID_CATALOG, ...OPEN_FIGHTER_IDS]);
  });
});
