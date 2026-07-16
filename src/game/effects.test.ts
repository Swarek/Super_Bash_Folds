import { describe, expect, it } from "vitest";
import type { MatchConfig } from "./contracts";
import { createGame, type FighterSnapshot, type GameEvent, type GameSnapshot } from "./engine";
import {
  CombatEffects,
  MAX_EFFECT_PARTICLES,
  MAX_TRANSIENT_EFFECTS,
  impactStrength,
  impactTierForDamage,
  groundEffectOrigin,
  projectKoBeamOrigin,
  resolveAttackArcGeometry,
  resolveAttackEffectProfile,
  seededEffectUnit,
} from "./effects";
import { FIGHTER_IDS, getFighterDefinition, type MoveName } from "./roster";
import { DEFAULT_STAGE_ID } from "./stages";

const config: MatchConfig = {
  players: [
    { fighter: "kaykit-knight", skin: "00", name: "P1", slot: 0, cpu: false, cpuLevel: 1 },
    { fighter: "george", skin: "00", name: "P2", slot: 1, cpu: false, cpuLevel: 1 },
  ],
  stocks: 3,
  items: true,
  itemFrequency: "high",
  stage: DEFAULT_STAGE_ID,
};

const baseSnapshot = (): GameSnapshot => createGame(config, { countdownFrames: 0 }).getSnapshot();

const patchFighter = (
  snapshot: GameSnapshot,
  slot: 0 | 1,
  patch: Partial<FighterSnapshot>,
  frame: number,
): GameSnapshot => {
  const fighters: [FighterSnapshot, FighterSnapshot] = [
    slot === 0 ? { ...snapshot.fighters[0], ...patch } : snapshot.fighters[0],
    slot === 1 ? { ...snapshot.fighters[1], ...patch } : snapshot.fighters[1],
  ];
  return { ...snapshot, frame, fighters, events: [] };
};

describe("attack effect profiles", () => {
  it("resolves a complete, finite profile for every fighter move", () => {
    for (const fighter of FIGHTER_IDS) {
      const moves = Object.keys(getFighterDefinition(fighter).attacks) as MoveName[];
      expect(moves).toHaveLength(17);
      for (const move of moves) {
        const profile = resolveAttackEffectProfile(fighter, move);
        expect(profile.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(profile.coreColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(profile.width).toBeGreaterThan(0);
        expect(profile.reach).toBeGreaterThan(0);
      }
    }
  });

  it("uses authored materials and traits from open fighter packs", () => {
    expect(resolveAttackEffectProfile("kaykit-knight", "neutral-special").material).toBe("energy");
    expect(resolveAttackEffectProfile("kaykit-knight", "forward-smash").material).toBe("blade");
    expect(resolveAttackEffectProfile("dark-knight-2d", "forward-smash").material).toBe("blade");
  });

  it("mirrors short attack arcs without taking the long Canvas path", () => {
    const canvasSpan = (geometry: ReturnType<typeof resolveAttackArcGeometry>): number => {
      const raw = geometry.counterclockwise
        ? geometry.start - geometry.end
        : geometry.end - geometry.start;
      return ((raw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    };

    for (const shape of ["thrust", "sweep", "upper", "lower"] as const) {
      const right = resolveAttackArcGeometry(shape, 1, 0.5);
      const left = resolveAttackArcGeometry(shape, -1, 0.5);
      expect(left.counterclockwise).toBe(true);
      expect(canvasSpan(left)).toBeCloseTo(canvasSpan(right), 8);
      expect(canvasSpan(left)).toBeLessThan(Math.PI);
    }
  });

  it("places upper and lower arcs in the Canvas screen quadrants", () => {
    const upper = resolveAttackArcGeometry("upper", 1, 0.5);
    const lower = resolveAttackArcGeometry("lower", 1, 0.5);
    expect(Math.sin((upper.start + upper.end) / 2)).toBeLessThan(0);
    expect(Math.sin((lower.start + lower.end) / 2)).toBeGreaterThan(0);
  });
});

describe("effect origins", () => {
  it("converts grounded jump and landing events from body centre to feet", () => {
    const snapshot = baseSnapshot();
    const fighter = snapshot.fighters[0];
    const event = {
      type: "land",
      frame: 4,
      slot: 0,
      position: { x: 125, y: 240 },
    } as GameEvent;
    expect(groundEffectOrigin(event, snapshot)).toEqual({
      x: 125,
      y: 240 - fighter.size.height / 2 + 2,
    });
  });

  it("projects off-screen KO origins back to the visible border", () => {
    expect(projectKoBeamOrigin({ x: 1300, y: 300 }, { x: 1, y: 0 }, 1000, 600)).toEqual({
      x: 994,
      y: 300,
    });
    expect(projectKoBeamOrigin({ x: 400, y: -200 }, { x: 0, y: -1 }, 1000, 600)).toEqual({
      x: 400,
      y: 6,
    });
    expect(projectKoBeamOrigin({ x: 500, y: 300 }, { x: 1, y: 0 }, 1000, 600)).toEqual({
      x: 500,
      y: 300,
    });
  });
});

describe("impact planning", () => {
  it("classifies light, medium and heavy damage monotonically", () => {
    expect(impactTierForDamage(3)).toBe("light");
    expect(impactTierForDamage(8)).toBe("medium");
    expect(impactTierForDamage(15)).toBe("heavy");
    expect(impactStrength(3)).toBeLessThan(impactStrength(9));
    expect(impactStrength(9)).toBeLessThan(impactStrength(18));
    expect(impactStrength(999)).toBeLessThanOrEqual(1.45);
  });

  it("uses deterministic event noise", () => {
    const first = Array.from({ length: 20 }, (_, index) => seededEffectUnit(12345, index));
    const second = Array.from({ length: 20 }, (_, index) => seededEffectUnit(12345, index));
    const different = Array.from({ length: 20 }, (_, index) => seededEffectUnit(12346, index));
    expect(first).toEqual(second);
    expect(first).not.toEqual(different);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe("bounded combat effects runtime", () => {
  it("emits run dust by travelled distance and remains quiet while idle", () => {
    const effects = new CombatEffects();
    const initial = baseSnapshot();
    effects.update(patchFighter(initial, 0, {
      state: "idle",
      grounded: true,
      velocity: { x: 0, y: 0 },
    }, 1), 1 / 60);
    effects.update(patchFighter(initial, 0, {
      position: { x: initial.fighters[0].position.x, y: initial.fighters[0].position.y },
      state: "idle",
      grounded: true,
      velocity: { x: 0, y: 0 },
    }, 2), 1 / 60);
    expect(effects.debugStats().particles).toBe(0);

    effects.update(patchFighter(initial, 0, {
      position: { x: initial.fighters[0].position.x + 42, y: initial.fighters[0].position.y },
      state: "run",
      grounded: true,
      velocity: { x: 320, y: 0 },
    }, 3), 1 / 60);
    expect(effects.debugStats().particles).toBeGreaterThan(0);
  });

  it("emits a skid burst once on a grounded reversal", () => {
    const effects = new CombatEffects();
    const initial = baseSnapshot();
    effects.update(patchFighter(initial, 0, {
      state: "run",
      facing: 1,
      grounded: true,
      velocity: { x: 300, y: 0 },
    }, 1), 1 / 60);
    effects.update(patchFighter(initial, 0, {
      state: "turn",
      facing: -1,
      grounded: true,
      velocity: { x: -160, y: 0 },
    }, 2), 1 / 60);
    const afterTurn = effects.debugStats().particles;
    expect(afterTurn).toBeGreaterThanOrEqual(11);

    effects.update(patchFighter(initial, 0, {
      state: "turn",
      facing: -1,
      grounded: true,
      velocity: { x: -100, y: 0 },
    }, 3), 0);
    expect(effects.debugStats().particles).toBe(afterTurn);
  });

  it("supports future factual event fields without requiring them", () => {
    const effects = new CombatEffects();
    const snapshot = baseSnapshot();
    const hit = {
      type: "hit",
      frame: 1,
      slot: 0,
      target: 1,
      position: { x: 0, y: 100 },
      damage: 18,
      velocity: { x: 500, y: 250 },
      source: "projectile",
      projectileKind: "energy-orb",
    } as GameEvent;
    const feedback = effects.consume([hit], snapshot);
    expect(feedback.shake).toBeGreaterThan(20);
    expect(feedback.flash).toBeGreaterThan(0.4);
    expect(effects.debugStats().particles).toBeGreaterThan(0);
    expect(effects.debugStats().transients).toBe(1);
  });

  it("keeps an attack arc alive when simulation catch-up skips its active snapshot", () => {
    const effects = new CombatEffects();
    const snapshot = baseSnapshot();
    effects.consume([{
      type: "attack-active",
      frame: 4,
      slot: 0,
      move: "jab",
      position: { x: -120, y: 86 },
    }], snapshot);
    expect(effects.debugStats().transients).toBe(1);
    effects.update({ ...snapshot, frame: 5, events: [] }, 1 / 60);
    expect(effects.debugStats().transients).toBe(1);
  });

  it("tags fighter feedback for the procedural renderer", () => {
    const effects = new CombatEffects();
    const openConfig: MatchConfig = {
      ...config,
      players: [
        { ...config.players[0], fighter: "george", name: "George" },
        config.players[1],
      ],
    };
    const snapshot = createGame(openConfig, { countdownFrames: 0 }).getSnapshot();
    effects.consume([
      {
        type: "attack",
        frame: 2,
        slot: 0,
        move: "neutral-special",
        position: snapshot.fighters[0].position,
      },
      {
        type: "attack-active",
        frame: 3,
        slot: 0,
        move: "neutral-special",
        position: snapshot.fighters[0].position,
      },
    ], snapshot);

    expect(effects.debugStats().openParticles).toBeGreaterThan(0);
    expect(effects.debugStats().openTransients).toBeGreaterThan(0);
  });

  it("keeps unowned events on the procedural renderer", () => {
    const effects = new CombatEffects();
    const snapshot = baseSnapshot();
    effects.consume([
      {
        type: "item-spawn",
        frame: 4,
        position: { x: 0, y: 120 },
      } as GameEvent,
      {
        type: "respawn",
        frame: 5,
        position: { x: 0, y: 180 },
      } as GameEvent,
    ], snapshot);

    expect(effects.debugStats().openTransients).toBe(2);
    expect(effects.debugStats().openParticles).toBeGreaterThan(0);
  });

  it("already renders a future projectile-impact event", () => {
    const effects = new CombatEffects();
    const snapshot = baseSnapshot();
    const event = {
      type: "projectile-impact",
      frame: 4,
      slot: 0,
      position: { x: 80, y: 110 },
      projectileKind: "bomb",
      damage: 16,
      velocity: { x: 300, y: 120 },
    } as unknown as GameEvent;
    const feedback = effects.consume([event], snapshot);
    expect(feedback.shake).toBe(12);
    expect(effects.debugStats().particles).toBe(18);
    expect(effects.debugStats().transients).toBe(1);
  });

  it("caps particles and structured effects under repeated heavy KOs", () => {
    const effects = new CombatEffects();
    const snapshot = baseSnapshot();
    const events: GameEvent[] = Array.from({ length: 96 }, (_, index) => ({
      type: "ko",
      frame: index + 1,
      slot: index % 2 as 0 | 1,
      position: { x: index * 3, y: 300 },
      sound: "ko",
    }));
    effects.consume(events, snapshot);
    const stats = effects.debugStats();
    expect(stats.particles).toBeLessThanOrEqual(MAX_EFFECT_PARTICLES);
    expect(stats.transients).toBeLessThanOrEqual(MAX_TRANSIENT_EFFECTS);
    expect(stats.droppedParticles).toBeGreaterThan(0);
    expect(stats.droppedTransients).toBeGreaterThan(0);
  });

  it("compacts expired pools in place", () => {
    const effects = new CombatEffects();
    const snapshot = baseSnapshot();
    effects.consume([
      { type: "jump", frame: 1, slot: 0, position: { x: 0, y: 80 }, sound: "double-jump" },
      { type: "respawn", frame: 1, slot: 1, position: { x: 120, y: 390 }, sound: "respawn" },
    ], snapshot);
    expect(effects.debugStats().particles).toBeGreaterThan(0);
    expect(effects.debugStats().transients).toBeGreaterThan(0);

    for (let frame = 2; frame < 90; frame += 1) {
      effects.update({ ...snapshot, frame, events: [] }, 1 / 60);
    }
    expect(effects.debugStats().particles).toBe(0);
    expect(effects.debugStats().transients).toBe(0);
  });

  it("does not age particles or transients while render time is paused", () => {
    const effects = new CombatEffects();
    const snapshot = baseSnapshot();
    effects.consume([
      { type: "respawn", frame: 1, slot: 1, position: { x: 120, y: 390 }, sound: "respawn" },
    ], snapshot);
    const beforePause = effects.debugStats();
    for (let frame = 0; frame < 600; frame += 1) {
      effects.update(snapshot, 0);
    }
    expect(effects.debugStats()).toEqual(beforePause);
  });
});
