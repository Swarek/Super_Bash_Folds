import { describe, expect, it } from "vitest";
import {
  FIGHTER_IDS,
  MELEE_FIGHTER_ID_CATALOG,
  MELEE_FIGHTER_IDS,
  MELEE_HORIZONTAL_WORLD_SCALE,
  MELEE_VERTICAL_WORLD_SCALE,
  OPEN_2D_FIGHTER_IDS,
  OPEN_3D_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
  ROSTER,
  getFighterDefinition,
} from "./roster";
import { OPEN_FIGHTER_PACKS } from "./generated/openFighterRegistry";

const discreteRise = (velocity: number, gravity: number): number => {
  let rise = 0;
  let speed = velocity;
  while (speed > 0) {
    speed -= gravity / 60;
    rise += Math.max(0, speed) / 60;
  }
  return rise;
};

describe("roster", () => {
  it("separates private fighters from open fighter packs without gameplay gaps", () => {
    const expected3D = OPEN_FIGHTER_PACKS.filter(({ kind }) => kind === "3d").map(({ id }) => id);
    const expected2D = OPEN_FIGHTER_PACKS.filter(({ kind }) => kind === "2d").map(({ id }) => id);
    const expectedOpen = [...expected3D, ...expected2D];

    expect(MELEE_FIGHTER_ID_CATALOG).toHaveLength(26);
    expect(MELEE_FIGHTER_IDS).toEqual(
      MELEE_FIGHTER_ID_CATALOG.filter((fighter) =>
        (__PRIVATE_FIGHTER_IDS__ as readonly unknown[]).includes(fighter)
      ),
    );
    expect(OPEN_3D_FIGHTER_IDS).toEqual(expected3D);
    expect(OPEN_2D_FIGHTER_IDS).toEqual(expected2D);
    expect(OPEN_FIGHTER_IDS).toEqual(expectedOpen);
    expect(FIGHTER_IDS).toHaveLength(MELEE_FIGHTER_IDS.length + expectedOpen.length);
    expect(new Set(FIGHTER_IDS).size).toBe(FIGHTER_IDS.length);
    for (const id of FIGHTER_IDS) {
      const fighter = getFighterDefinition(id);
      expect(Object.keys(fighter.attacks)).toHaveLength(17);
      expect(fighter.attacks.jab.damage).toBeGreaterThan(0);
      expect(fighter.attacks["dash-attack"].movement?.x).toBeGreaterThan(0);
      expect(fighter.attacks["forward-tilt"].startup).toBeGreaterThan(0);
      expect(fighter.attacks["forward-smash"].chargeable).toBe(true);
      expect(fighter.attacks["neutral-air"].active).toBeGreaterThan(0);
      expect(Object.keys(fighter.throws)).toEqual(["forward", "back", "up", "down"]);
    }
  });

  it("gives archetypes genuinely distinct stats and special moves", () => {
    expect(ROSTER.pikachu.runSpeed).toBeGreaterThan(ROSTER["donkey-kong"].runSpeed);
    expect(ROSTER["donkey-kong"].weight).toBeGreaterThan(ROSTER.pikachu.weight);
    expect(ROSTER.mario.attacks["neutral-special"].projectile?.kind).toBe("fireball");
    expect(ROSTER.link.attacks["neutral-special"].projectile?.kind).toBe("arrow");
    expect(ROSTER.samus.attacks["neutral-special"].projectile?.kind).toBe("charge-shot");
    expect(ROSTER.pikachu.attacks["neutral-special"].projectile?.kind).toBe("thunder-jolt");
    expect(ROSTER["donkey-kong"].attacks["neutral-special"].projectile).toBeUndefined();
    expect(ROSTER["donkey-kong"].attacks["neutral-special"].damage).toBeGreaterThan(
      ROSTER.mario.attacks["neutral-special"].damage,
    );
    expect(ROSTER.mario.attacks["side-special"].reversesFacing).toBe(true);
    expect(ROSTER["dr-mario"].attacks["side-special"].reversesFacing).toBe(true);
    expect(ROSTER.peach.attacks["neutral-special"].counters).toBe(true);
    expect(ROSTER.yoshi.attacks["up-special"].specialMovement).toMatchObject({
      kind: "steered-rise",
      riseSpeed: 360,
    });
    expect(ROSTER["mr-game-and-watch"].attacks["down-special"]).toMatchObject({
      absorbsProjectiles: true,
      reflectsProjectiles: true,
    });
    expect(ROSTER["rgs-stick"].runSpeed).toBeGreaterThan(ROSTER["dark-knight-2d"].runSpeed);
    expect(ROSTER["dark-knight-2d"].weight).toBeGreaterThan(ROSTER["knight-hero"].weight);
    expect(ROSTER["dark-knight-2d"].attacks["neutral-special"].projectile?.kind).toBe(
      "shadow-ball",
    );
    expect(ROSTER["knight-hero"].attacks["neutral-special"].projectile).toMatchObject({
      kind: "ground-wave",
      restsOnGround: true,
    });
    expect(ROSTER["kenney-toon"].attacks["down-special"]).toMatchObject({
      statusEffect: "stun",
      statusFrames: 34,
    });
    expect(ROSTER["rgs-character-prototype"].attacks["side-special"].specialMovement).toEqual({
      kind: "ground-steered",
      speed: 555,
    });
    expect(ROSTER["hormelz-melee"].attacks["neutral-special"].projectile?.kind).toBe(
      "fireball",
    );
    expect(ROSTER["hormelz-knight"].attacks["down-special"]).toMatchObject({
      chargeable: true,
      maxChargeFrames: 58,
    });
    expect(ROSTER["quaternius-hero"].attacks["neutral-special"].projectile?.kind).toBe(
      "arrow",
    );
  });

  it("preserves the movement reference speed ratios", () => {
    expect(MELEE_HORIZONTAL_WORLD_SCALE).toBeCloseTo(7.7991409242, 8);
    expect(["mario", "link", "samus", "pikachu", "donkey-kong"].map(
      (id) => ROSTER[id as keyof typeof ROSTER].runSpeed,
    )).toEqual([702, 608, 655, 842, 749]);
    expect(["mario", "link", "samus", "pikachu", "donkey-kong"].map(
      (id) => ROSTER[id as keyof typeof ROSTER].initialDashSpeed,
    )).toEqual([702, 608, 870, 842, 749]);
    expect(["mario", "link", "samus", "pikachu", "donkey-kong"].map(
      (id) => ROSTER[id as keyof typeof ROSTER].gravity,
    )).toEqual([2_321, 2_687, 1_612, 2_687, 2_443]);
    expect(ROSTER.pikachu.runSpeed / ROSTER.mario.runSpeed).toBeCloseTo(1.8 / 1.5, 2);
    expect(ROSTER.link.runSpeed / ROSTER.mario.runSpeed).toBeCloseTo(1.3 / 1.5, 2);
    expect(ROSTER.samus.initialDashSpeed / ROSTER.mario.initialDashSpeed).toBeCloseTo(1.86 / 1.5, 2);

    const originalIds = ["mario", "link", "samus", "pikachu", "donkey-kong"] as const;
    expect(originalIds.map((id) => ROSTER[id].initialDashFrames)).toEqual([10, 12, 8, 13, 15]);
    expect(originalIds.map((id) => ROSTER[id].jumpSquatFrames)).toEqual([4, 6, 3, 3, 5]);
    expect(originalIds.map((id) => ROSTER[id].shortHopSpeedMultiplier)).toEqual([
      0.6242,
      0.6169,
      0.8153,
      0.6679,
      0.5395,
    ]);
  });

  it("preserves the movement reference jump heights", () => {
    expect(MELEE_VERTICAL_WORLD_SCALE).toBeCloseTo(6.7860696517, 8);
    const fullHopHeights = {
      mario: 29,
      link: 29.67,
      samus: 34.464,
      pikachu: 32.04,
      "donkey-kong": 37.8,
    } as const;
    const shortHopHeights = {
      mario: 11.025,
      link: 10.99,
      samus: 22.75,
      pikachu: 14,
      "donkey-kong": 10.66,
    } as const;
    const doubleJumpHeights = {
      mario: 26.7,
      link: 20.9,
      samus: 26.124,
      pikachu: 29.44,
      "donkey-kong": 28.968,
    } as const;

    const measuredDoubleJumps = {} as Record<keyof typeof fullHopHeights, number>;
    const measuredFullHops = {} as Record<keyof typeof fullHopHeights, number>;
    for (const id of Object.keys(fullHopHeights) as Array<keyof typeof fullHopHeights>) {
      const fighter = ROSTER[id];
      measuredFullHops[id] = discreteRise(fighter.jumpSpeed, fighter.gravity);
      expect(measuredFullHops[id], `${id} full hop`).toBeCloseTo(
        fullHopHeights[id] * MELEE_VERTICAL_WORLD_SCALE,
        0,
      );
      expect(
        discreteRise(
          fighter.jumpSpeed * fighter.shortHopSpeedMultiplier,
          fighter.gravity,
        ),
        `${id} short hop`,
      ).toBeCloseTo(shortHopHeights[id] * MELEE_VERTICAL_WORLD_SCALE, 0);
      measuredDoubleJumps[id] = discreteRise(fighter.doubleJumpSpeed, fighter.gravity);
      expect(measuredDoubleJumps[id], `${id} double jump`).toBeCloseTo(
        doubleJumpHeights[id] * MELEE_VERTICAL_WORLD_SCALE,
        0,
      );
      expect(fighter.jumpSpeed).toBeGreaterThan(750);
    }

  });

  it("reproduces Melee's aerial ordering and fall speeds", () => {
    const originalIds = ["mario", "link", "samus", "pikachu", "donkey-kong"] as const;
    expect(originalIds.map((id) => ROSTER[id].airSpeed)).toEqual([402, 468, 416, 398, 468]);
    expect(ROSTER.link.airSpeed).toBe(ROSTER["donkey-kong"].airSpeed);
    expect(ROSTER.link.airSpeed).toBeGreaterThan(ROSTER.samus.airSpeed);
    expect(ROSTER.samus.airSpeed).toBeGreaterThan(ROSTER.pikachu.airSpeed);
    expect(ROSTER.mario.airSpeed).toBeGreaterThan(ROSTER.pikachu.airSpeed);
    expect(originalIds.map((id) => ROSTER[id].maxFallSpeed)).toEqual([692, 867, 570, 774, 977]);
    expect(originalIds.map((id) => ROSTER[id].fastFallSpeed)).toEqual([936, 1221, 936, 1099, 1205]);
    for (const id of FIGHTER_IDS) {
      expect(ROSTER[id].fastFallSpeed).toBeGreaterThan(ROSTER[id].maxFallSpeed);
    }
  });
});
