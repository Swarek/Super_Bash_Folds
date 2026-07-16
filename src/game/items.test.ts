import { describe, expect, it } from "vitest";
import {
  OPEN_STAGE_IDS,
  type ActionName,
  type FighterId,
  type InputFrame,
  type MatchConfig,
} from "./contracts";
import { createEmptyInput, createGame } from "./engine";
import { ITEM_DEFINITIONS, ITEM_KINDS, isAutomaticItem, type ItemKind } from "./items";

const config = (items = false): MatchConfig => ({
  players: [
    { fighter: "george", skin: "00", name: "J1", slot: 0, cpu: false, cpuLevel: 1 },
    { fighter: "wolf", skin: "00", name: "J2", slot: 1, cpu: false, cpuLevel: 1 },
  ],
  stocks: 3,
  items,
  itemFrequency: "high",
  // Item behavior is stage-agnostic. Keep this wide fixture explicit so the
  // x=-700 setup remains onstage as new open arenas are added.
  stage: OPEN_STAGE_IDS[0],
});

const pressed = (...actions: ActionName[]): InputFrame => ({
  held: new Set(actions),
  pressed: new Set(actions),
  released: new Set(),
  direction: {
    x: actions.includes("right") ? 1 : actions.includes("left") ? -1 : 0,
    y: actions.includes("up") ? 1 : actions.includes("down") ? -1 : 0,
  },
});

const idlePair = (): [InputFrame, InputFrame] => [createEmptyInput(), createEmptyInput()];

const readyGame = (
  positions: [{ x: number; y: number }, { x: number; y: number }] = [{ x: -700, y: 52 }, { x: 500, y: 52 }],
  target: FighterId = "wolf",
) => {
  const match = config();
  match.players[1].fighter = target;
  const game = createGame(match, {
    countdownFrames: 0,
    seed: 19,
    spawnPositions: positions,
  });
  for (let frame = 0; frame < 90; frame += 1) game.step(idlePair());
  return game;
};

const equipAndUse = (
  kind: ItemKind,
  positions: [{ x: number; y: number }, { x: number; y: number }],
  target: FighterId = "wolf",
) => {
  const game = readyGame(positions, target);
  game.spawnItem(kind, game.getSnapshot().fighters[0].position);
  game.step([pressed("grab"), createEmptyInput()]);
  for (let frame = 0; frame < 8; frame += 1) game.step(idlePair());
  const events = [...game.step([pressed("attack", "right"), createEmptyInput()]).events];
  return { game, events };
};

const exercise = (kind: ItemKind) => {
  const game = readyGame();
  const position = game.getSnapshot().fighters[0].position;
  game.spawnItem(kind, position);

  if (isAutomaticItem(kind)) {
    const snapshot = game.step(idlePair());
    return { game, snapshot };
  }

  game.step([pressed("grab"), createEmptyInput()]);
  expect(game.getSnapshot().fighters[0].heldItem?.kind).toBe(kind);
  for (let frame = 0; frame < 8; frame += 1) game.step(idlePair());
  const snapshot = game.step([pressed("attack", "right"), createEmptyInput()]);
  return { game, snapshot };
};

describe("twenty-item combat system", () => {
  it("contains exactly twenty distinct local items and behaviors", () => {
    expect(ITEM_KINDS).toHaveLength(20);
    expect(new Set(ITEM_KINDS).size).toBe(20);
    expect(new Set(ITEM_KINDS.map((kind) => ITEM_DEFINITIONS[kind].effect)).size).toBe(20);
    for (const kind of ITEM_KINDS) {
      const definition = ITEM_DEFINITIONS[kind];
      expect(definition.label.length).toBeGreaterThan(2);
      expect(definition.charges).toBeGreaterThan(0);
    }
  });

  it("uses only original open item presentations", () => {
    for (const kind of ITEM_KINDS) {
      expect(ITEM_DEFINITIONS[kind].iconUrl).toBe(`/assets/open/items/${kind}.svg`);
    }
    expect(ITEM_DEFINITIONS["vitality-fruit"].label).toBe("Vitality Fruit");
    expect(ITEM_DEFINITIONS["time-dilator"].label).toBe("Time Dilator");
  });

  it.each(ITEM_KINDS)("exercises %s without a silent no-op", (kind) => {
    const { snapshot } = exercise(kind);
    const use = snapshot.events.find((event) => event.type === "item-use" && event.item === kind);
    expect(use).toBeDefined();
    expect(use?.sound).toBe(`item-${ITEM_DEFINITIONS[kind].effect}`);

    const definition = ITEM_DEFINITIONS[kind];
    if (definition.category === "auto") {
      expect(snapshot.items.some((item) => item.kind === kind)).toBe(false);
      expect(snapshot.fighters[0].heldItem).toBeNull();
    } else if (definition.category === "weapon") {
      expect(snapshot.fighters[0].heldItem).toEqual({
        kind,
        charges: definition.charges - 1,
      });
    } else {
      expect(snapshot.fighters[0].heldItem).toBeNull();
      const expectedMode = definition.category === "throwable" ? "thrown" : "trap";
      expect(snapshot.items.some((item) => item.kind === kind && item.mode === expectedMode)).toBe(true);
    }
  });

  it("requires grab for carried items and attack to use them", () => {
    const game = readyGame();
    const position = game.getSnapshot().fighters[0].position;
    game.spawnItem("plasma-blade", position);
    game.step(idlePair());
    expect(game.getSnapshot().fighters[0].heldItem).toBeNull();
    expect(game.getSnapshot().items.some((item) => item.kind === "plasma-blade")).toBe(true);

    game.step([pressed("grab"), createEmptyInput()]);
    expect(game.getSnapshot().fighters[0].heldItem).toEqual({ kind: "plasma-blade", charges: 6 });
    expect(game.getSnapshot().fighters[0].itemAction).toBe("pickup");
    for (let frame = 0; frame < 8; frame += 1) game.step(idlePair());
    game.step([pressed("attack"), createEmptyInput()]);
    expect(game.getSnapshot().fighters[0].heldItem).toEqual({ kind: "plasma-blade", charges: 5 });
    expect(game.getSnapshot().fighters[0].itemAction).toBe("attack");
  });

  it("applies persistent power-up state to the correct fighter", () => {
    const power = exercise("power-orb").snapshot;
    expect(power.fighters[0].activeEffects.damageMultiplier).toBeGreaterThan(1);

    const speed = exercise("wind-boots").snapshot;
    expect(speed.fighters[0].activeEffects.speedMultiplier).toBeGreaterThan(1);
    expect(speed.fighters[0].activeEffects.jumpMultiplier).toBeGreaterThan(1);

    const armor = exercise("iron-ward").snapshot;
    expect(armor.fighters[0].activeEffects.defenseMultiplier).toBeLessThan(1);

    const invincibility = exercise("nova-star").snapshot;
    expect(invincibility.fighters[0].invulnerableFrames).toBeGreaterThan(300);

    const reflector = exercise("reflector-charm").snapshot;
    expect(reflector.fighters[0].activeEffects.projectileShieldFrames).toBeGreaterThan(400);

    const slowTime = exercise("time-dilator").snapshot;
    expect(slowTime.fighters[1].activeEffects.speedMultiplier).toBeLessThan(1);
  });

  it.each(["plasma-blade", "power-bat"] as const)("makes %s connect as a melee weapon", (kind) => {
    const { game, events } = equipAndUse(kind, [{ x: -55, y: 52 }, { x: 55, y: 52 }]);
    expect(events.some((event) => event.type === "hit" && event.sound === kind)).toBe(true);
    expect(game.getSnapshot().fighters[1].percent).toBeGreaterThan(0);
  });

  it.each(["pulse-blaster", "flame-sprayer"] as const)("fires damaging projectiles from %s", (kind) => {
    const { game, events } = equipAndUse(kind, [{ x: -100, y: 52 }, { x: 100, y: 52 }], "platformer");
    for (let frame = 0; frame < 45; frame += 1) events.push(...game.step(idlePair()).events);
    expect(events.some((event) => event.type === "projectile" && event.slot === 0)).toBe(true);
    expect(game.getSnapshot().fighters[1].percent).toBeGreaterThan(0);
  });

  it.each([
    "blast-core",
    "ricochet-disc",
    "slick-gel",
    "proximity-mine",
    "rebound-pad",
    "snare-trap",
    "shock-seed",
    "smoke-bomb",
  ] as const)("lets the activated %s collide with the opponent", (kind) => {
    const { game, events } = equipAndUse(kind, [{ x: -90, y: 52 }, { x: 90, y: 52 }]);
    for (let frame = 0; frame < 120; frame += 1) events.push(...game.step(idlePair()).events);
    expect(events.some((event) => event.type === "hit" && event.item === kind && event.target === 1)).toBe(true);
  });

  it.each(["snare-trap", "shock-seed"] as const)(
    "restores one jump and Up-B when an airborne fighter is hit by %s",
    (kind) => {
      const game = readyGame();
      const internals = game as unknown as {
        fighters: [{ slot: 0 }, {
          grounded: boolean;
          supportPlatform: string | null;
          jumpsRemaining: number;
          airUpSpecialUsed: boolean;
        }];
        applyActivatedItem: (
          item: {
            id: number;
            kind: ItemKind;
            position: { x: number; y: number };
            velocity: { x: number; y: number };
            radius: number;
            mode: "thrown";
            owner: 0;
            age: number;
            grounded: boolean;
            supportPlatform: null;
          },
          target: {
            grounded: boolean;
            supportPlatform: string | null;
            jumpsRemaining: number;
            airUpSpecialUsed: boolean;
          },
          targetInput: InputFrame,
        ) => boolean;
      };
      const target = internals.fighters[1];
      target.grounded = false;
      target.supportPlatform = null;
      target.jumpsRemaining = 0;
      target.airUpSpecialUsed = true;

      internals.applyActivatedItem({
        id: 999,
        kind,
        position: { x: 0, y: 200 },
        velocity: { x: 0, y: 0 },
        radius: 24,
        mode: "thrown",
        owner: 0,
        age: 0,
        grounded: false,
        supportPlatform: null,
      }, target, createEmptyInput());

      expect(target.jumpsRemaining).toBe(1);
      expect(target.airUpSpecialUsed).toBe(false);
    },
  );

  it("honors the items-off rule and high-frequency spawning", () => {
    const disabled = createGame(config(false), { countdownFrames: 0, seed: 5 });
    for (let frame = 0; frame < 700; frame += 1) disabled.step(idlePair());
    expect(disabled.getSnapshot().items).toHaveLength(0);

    const enabled = createGame(config(true), { countdownFrames: 0, seed: 5 });
    for (let frame = 0; frame < 350; frame += 1) enabled.step(idlePair());
    expect(enabled.getSnapshot().items.length).toBeGreaterThan(0);
  });
});
