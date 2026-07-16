import { describe, expect, it } from "vitest";
import {
  FIGHTER_IDS,
  OPEN_2D_FIGHTER_IDS,
  OPEN_3D_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
  ROSTER,
  getFighterDefinition,
} from "./roster";
import { OPEN_FIGHTER_PACKS } from "./generated/openFighterRegistry";

describe("roster", () => {
  it("is generated entirely from open fighter packs", () => {
    const expected3D = OPEN_FIGHTER_PACKS.filter(({ kind }) => kind === "3d").map(({ id }) => id);
    const expected2D = OPEN_FIGHTER_PACKS.filter(({ kind }) => kind === "2d").map(({ id }) => id);
    expect(OPEN_3D_FIGHTER_IDS).toEqual(expected3D);
    expect(OPEN_2D_FIGHTER_IDS).toEqual(expected2D);
    expect(OPEN_FIGHTER_IDS).toEqual([...expected3D, ...expected2D]);
    expect(FIGHTER_IDS).toEqual(OPEN_FIGHTER_IDS);
    expect(new Set(FIGHTER_IDS).size).toBe(FIGHTER_IDS.length);
  });

  it.each(FIGHTER_IDS)("provides a complete competitive kit for %s", (id) => {
    const fighter = getFighterDefinition(id);
    expect(fighter).toBe(ROSTER[id]);
    expect(Object.keys(fighter.attacks)).toHaveLength(17);
    expect(fighter.attacks.jab.damage).toBeGreaterThan(0);
    expect(fighter.attacks["dash-attack"].movement?.x).toBeGreaterThan(0);
    expect(fighter.attacks["forward-tilt"].startup).toBeGreaterThan(0);
    expect(fighter.attacks["forward-smash"].chargeable).toBe(true);
    expect(fighter.attacks["neutral-air"].active).toBeGreaterThan(0);
    expect(fighter.fastFallSpeed).toBeGreaterThan(fighter.maxFallSpeed);
    expect(Object.keys(fighter.throws)).toEqual(["forward", "back", "up", "down"]);
  });

  it("keeps open archetypes mechanically distinct", () => {
    expect(ROSTER["rgs-stick"].runSpeed).toBeGreaterThan(ROSTER["dark-knight-2d"].runSpeed);
    expect(ROSTER["dark-knight-2d"].weight).toBeGreaterThan(ROSTER["knight-hero"].weight);
    expect(ROSTER["dark-knight-2d"].attacks["neutral-special"].projectile?.kind).toBe("energy-orb");
    expect(ROSTER["knight-hero"].attacks["neutral-special"].projectile).toMatchObject({
      kind: "ground-wave",
      restsOnGround: true,
    });
    expect(ROSTER["kenney-toon"].attacks["down-special"]).toMatchObject({
      statusEffect: "stun",
      statusFrames: 34,
    });
  });
});
