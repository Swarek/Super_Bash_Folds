import { describe, expect, it } from "vitest";
import type {
  ActionName,
  FighterId,
  InputFrame,
  MatchConfig,
} from "./contracts";
import {
  ASDI_DISTANCE,
  LEDGE_MAX_HANG_FRAMES,
  SDI_DISTANCE,
  TECH_INPUT_LOCKOUT_FRAMES,
  TECH_INPUT_WINDOW_FRAMES,
  SAME_MOVE_LOCK_BREAK_LAUNCH_MULTIPLIER,
  STANDARD_PROJECTILE_LIFETIME_MULTIPLIER,
  calculateMeleeKnockback,
  comboStarterBaseKnockbackScale,
  competitiveHitboxesForMove,
  createEmptyInput,
  createGame,
  decayMeleeLaunchVelocity,
  defensiveMoveActiveAtFrame,
  effectiveJumpSquatFrames,
  effectiveProjectileLifetime,
  meleeClankOutcome,
  meleeHitstunFrames,
  meleeLaunchVelocity,
  type GameEvent,
  type GameSnapshot,
} from "./engine";
import {
  FIGHTER_IDS,
  getFighterDefinition,
  type AttackDefinition,
  type MoveName,
} from "./roster";
import { DEFAULT_STAGE_ID, stageSurfaceYAt } from "./stages";

const config: MatchConfig = {
  players: [
    { fighter: "kaykit-knight", skin: "00", name: "P1", slot: 0, cpu: false, cpuLevel: 1 },
    { fighter: "george", skin: "00", name: "P2", slot: 1, cpu: false, cpuLevel: 1 },
  ],
  stocks: 3,
  items: false,
  itemFrequency: "medium",
  stage: DEFAULT_STAGE_ID,
};

const matchConfig = (
  first: FighterId = "kaykit-knight",
  second: FighterId = "george",
): MatchConfig => ({
  ...config,
  players: [
    { fighter: first, skin: "00", name: "P1", slot: 0, cpu: false, cpuLevel: 1 },
    { fighter: second, skin: "00", name: "P2", slot: 1, cpu: false, cpuLevel: 1 },
  ],
});

const input = ({
  held = [],
  pressed = [],
  released = [],
  direction = { x: 0, y: 0 },
  analog = false,
}: {
  held?: ActionName[];
  pressed?: ActionName[];
  released?: ActionName[];
  direction?: { x: number; y: number };
  analog?: boolean;
} = {}): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(released),
  direction,
  analog,
});

const idlePair = (): [InputFrame, InputFrame] => [
  createEmptyInput(),
  createEmptyInput(),
];

const settle = (game: ReturnType<typeof createGame>, frames = 30): void => {
  for (let frame = 0; frame < frames; frame += 1) game.step(idlePair());
};

const approachLeftLedge = (
  game: ReturnType<typeof createGame>,
  fighterInput = createEmptyInput(),
): GameSnapshot => {
  const snapshot = game.getSnapshot();
  const ledge = snapshot.stage.ledges.find(({ side }) => side === "left");
  if (!ledge) throw new Error("The test stage needs a left ledge");
  const fighter = snapshot.fighters[0];
  const runtime = (game as unknown as {
    fighters: [{
      position: { x: number; y: number };
      previousPosition: { x: number; y: number };
      velocity: { x: number; y: number };
      grounded: boolean;
      supportPlatform: string | null;
      state: string;
      ledge: "left" | "right" | null;
      ledgeCooldownFrames: number;
      hitstunFrames: number;
    }, unknown];
  }).fighters[0];
  runtime.position = {
    x: ledge.position.x - fighter.size.width * 0.28 - 50,
    y: ledge.position.y - fighter.size.height / 2,
  };
  runtime.previousPosition = { ...runtime.position };
  runtime.velocity = { x: 0, y: -30 };
  runtime.grounded = false;
  runtime.supportPlatform = null;
  runtime.state = "fall";
  runtime.ledge = null;
  runtime.ledgeCooldownFrames = 0;
  runtime.hitstunFrames = 0;
  return game.step([fighterInput, createEmptyInput()]);
};

describe("combat math", () => {
  it("scales launch and hitstun with percent", () => {
    const low = calculateMeleeKnockback({
      damage: 8,
      postHitPercent: 0,
      weight: 100,
      baseKnockback: 30,
      knockbackGrowth: 0.8,
    });
    const high = calculateMeleeKnockback({
      damage: 8,
      postHitPercent: 150,
      weight: 100,
      baseKnockback: 30,
      knockbackGrowth: 0.8,
    });
    expect(high).toBeGreaterThan(low);
    expect(meleeHitstunFrames(high)).toBeGreaterThan(meleeHitstunFrames(low));
  });

  it("creates and decays directional launch velocity", () => {
    const launch = meleeLaunchVelocity(100, 45);
    const decayed = decayMeleeLaunchVelocity(launch);
    expect(Math.hypot(decayed.x, decayed.y)).toBeLessThan(Math.hypot(launch.x, launch.y));
    expect(decayed.x).toBeGreaterThan(0);
    expect(decayed.y).toBeGreaterThan(0);
  });

  it("keeps same-move lock breaking stronger than normal launch", () => {
    expect(SAME_MOVE_LOCK_BREAK_LAUNCH_MULTIPLIER).toBeGreaterThan(1);
    expect(comboStarterBaseKnockbackScale("jab", 0)).toBeLessThan(1);
    expect(comboStarterBaseKnockbackScale("jab", 100)).toBe(1);
  });

  it("resolves clanks from the authored damage window", () => {
    expect(meleeClankOutcome(10, 10)).toBe("both");
    expect(meleeClankOutcome(20, 5)).toBe("second");
    expect(meleeClankOutcome(5, 20)).toBe("first");
  });
});

describe("authored move contracts", () => {
  it.each(FIGHTER_IDS)("builds finite hitboxes for %s", (fighter) => {
    const definition = getFighterDefinition(fighter);
    for (const [name, attack] of Object.entries(definition.attacks)) {
      const hitboxes = competitiveHitboxesForMove(name as keyof typeof definition.attacks, attack, 0);
      expect(hitboxes.length).toBeGreaterThan(0);
      expect(hitboxes.every(({ radius }) => Number.isFinite(radius) && radius > 0)).toBe(true);
    }
  });

  it("expands ordinary projectile lifetimes but preserves mechanically timed ones", () => {
    const ordinary = {
      kind: "blaster" as const,
      speed: 600,
      gravity: 0,
      lifetimeFrames: 60,
      radius: 12,
    };
    const timed = { ...ordinary, kind: "ground-wave" as const, restsOnGround: true };
    expect(effectiveProjectileLifetime(ordinary)).toBe(
      Math.round(ordinary.lifetimeFrames * STANDARD_PROJECTILE_LIFETIME_MULTIPLIER),
    );
    expect(effectiveProjectileLifetime(timed)).toBe(timed.lifetimeFrames);
  });

  it("widens defensive move timing around active frames", () => {
    const move = {
      startup: 8,
      active: 3,
      counters: false,
      absorbsProjectiles: false,
      reflectsProjectiles: true,
    };
    expect(defensiveMoveActiveAtFrame(4, move)).toBe(true);
    expect(defensiveMoveActiveAtFrame(16, move)).toBe(false);
  });

  it("caps authored jump squat for responsive input", () => {
    expect(effectiveJumpSquatFrames(2)).toBe(2);
    expect(effectiveJumpSquatFrames(8)).toBe(4);
  });
});

describe("open match runtime", () => {
  it("starts with only open fighter packs and finite positions", () => {
    const snapshot = createGame(config, { countdownFrames: 0 }).getSnapshot();
    expect(snapshot.phase).toBe("playing");
    expect(snapshot.fighters.map(({ fighter }) => fighter)).toEqual([
      "kaykit-knight",
      "george",
    ]);
    expect(snapshot.fighters.every(({ position }) =>
      Number.isFinite(position.x) && Number.isFinite(position.y)
    )).toBe(true);
  });

  it("accepts movement and jump input on the first playable frame", () => {
    const game = createGame(config, { countdownFrames: 0 });
    const start = game.getSnapshot().fighters[0];
    const move = createEmptyInput();
    move.held.add("right");
    move.pressed.add("right");
    move.direction.x = 1;
    let snapshot = game.step([move, createEmptyInput()]);
    for (let frame = 0; frame < 8; frame += 1) {
      const held = createEmptyInput();
      held.held.add("right");
      held.direction.x = 1;
      snapshot = game.step([held, createEmptyInput()]);
    }
    expect(snapshot.fighters[0].position.x).toBeGreaterThan(start.position.x);

    const jump = createEmptyInput();
    jump.held.add("jump");
    jump.pressed.add("jump");
    snapshot = game.step([jump, createEmptyInput()]);
    expect(snapshot.events.some(({ type }) => type === "jump") ||
      snapshot.fighters[0].state === "jump-squat").toBe(true);
  });
});

describe("defense, grabs, and throws", () => {
  it("lets a shield absorb a strike without taking percent", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -40, y: 60 }, { x: 40, y: 60 }],
    });
    settle(game);
    const initialShield = game.getSnapshot().fighters[1].shield;
    const heldShield = input({ held: ["shield"] });
    game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      heldShield,
    ]);

    const events: GameEvent[] = [];
    for (let frame = 0; frame < 12; frame += 1) {
      events.push(...game.step([createEmptyInput(), heldShield]).events);
      if (events.some(({ type }) => type === "shield-hit")) break;
    }

    const snapshot = game.getSnapshot();
    expect(snapshot.fighters[1].percent).toBe(0);
    expect(snapshot.fighters[1].shield).toBeLessThan(initialShield);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "shield-hit", target: 1 }),
    ]));
  });

  it("grabs, holds, and resolves a directional throw", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -36, y: 60 }, { x: 36, y: 60 }],
    });
    settle(game);
    game.step([
      input({ held: ["grab"], pressed: ["grab"] }),
      createEmptyInput(),
    ]);
    expect(game.getSnapshot().fighters[0].grabTarget).toBe(1);
    expect(game.getSnapshot().fighters[1].grabbedBy).toBe(0);

    for (let frame = 0; frame < 4; frame += 1) game.step(idlePair());
    const snapshot = game.step([
      input({ held: ["down"], pressed: ["down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].throwAnimation).toBe("down");
    expect(snapshot.fighters[1].grabbedBy).toBeNull();
    expect(snapshot.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "throw", slot: 0, target: 1 }),
    ]));
  });

  it("places a back throw behind the grabber before launch", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -36, y: 60 }, { x: 36, y: 60 }],
    });
    settle(game);
    game.step([
      input({ held: ["grab"], pressed: ["grab"] }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 7; frame += 1) game.step(idlePair());
    const snapshot = game.step([
      input({ held: ["left"], pressed: ["left"], direction: { x: -1, y: 0 } }),
      createEmptyInput(),
    ]);
    const [grabber, target] = snapshot.fighters;
    expect(grabber.throwAnimation).toBe("back");
    expect(target.position.x).toBeLessThan(grabber.position.x);
    expect(target.velocity.x).toBeLessThan(0);
  });
});

describe("ledge options", () => {
  it("catches a nearby ledge and enforces the hang limit", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 60 }, { x: 300, y: 60 }],
    });
    settle(game);
    let snapshot = approachLeftLedge(game);
    expect(snapshot.fighters[0]).toMatchObject({ state: "ledge", ledge: "left" });

    for (let frame = 0; frame < LEDGE_MAX_HANG_FRAMES - 1; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].state).toBe("ledge");
    snapshot = game.step(idlePair());
    expect(snapshot.fighters[0]).toMatchObject({ state: "fall", ledge: null });
  });

  it("requires a held climb direction to be released and pressed again", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 60 }, { x: 300, y: 60 }],
    });
    settle(game);
    const climb = input({ held: ["right", "up"], direction: { x: 1, y: 1 } });
    let snapshot = approachLeftLedge(game, climb);
    expect(snapshot.fighters[0]).toMatchObject({ state: "ledge", ledge: "left" });
    snapshot = game.step([climb, createEmptyInput()]);
    expect(snapshot.fighters[0].state).toBe("ledge");
    snapshot = game.step(idlePair());
    expect(snapshot.fighters[0].state).toBe("ledge");
    snapshot = game.step([climb, createEmptyInput()]);
    expect(snapshot.fighters[0]).toMatchObject({ state: "idle", grounded: true, ledge: null });
  });

  it("restores one aerial jump when deliberately dropping from a ledge", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 60 }, { x: 300, y: 60 }],
    });
    settle(game);
    approachLeftLedge(game);
    const runtime = (game as unknown as {
      fighters: [{ jumpsRemaining: number }, unknown];
    }).fighters[0];
    runtime.jumpsRemaining = 0;

    let snapshot = game.step([
      input({ held: ["down"], pressed: ["down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0]).toMatchObject({
      state: "fall",
      ledge: null,
      jumpsRemaining: 1,
    });
    snapshot = game.step([
      input({ held: ["jump"], pressed: ["jump"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].velocity.y).toBeGreaterThan(0);
    expect(snapshot.fighters[0].jumpsRemaining).toBe(0);
  });

  it.each([
    {
      label: "jump",
      command: input({ held: ["jump"], pressed: ["jump"] }),
      expected: { state: "jump", ledge: null },
    },
    {
      label: "attack",
      command: input({ held: ["attack"], pressed: ["attack"] }),
      expected: { state: "attack", ledge: null, currentMove: "forward-tilt" },
    },
    {
      label: "roll",
      command: input({ held: ["shield"], pressed: ["shield"] }),
      expected: { state: "dodge", ledge: null, dodgeKind: "forward" },
    },
  ])("supports the $label ledge option", ({ command, expected }) => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 60 }, { x: 300, y: 60 }],
    });
    settle(game);
    approachLeftLedge(game);
    expect(game.step([command, createEmptyInput()]).fighters[0]).toMatchObject(expected);
  });
});

describe("landing and movement techniques", () => {
  it("turns a diagonal air dodge into a wavedash on landing", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 60 }, { x: 320, y: 60 }],
    });
    settle(game);
    let snapshot = game.step([
      input({ held: ["jump"], pressed: ["jump"] }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 8 && snapshot.fighters[0].grounded; frame += 1) {
      snapshot = game.step([input({ held: ["jump"] }), createEmptyInput()]);
    }
    snapshot = game.step([
      input({
        held: ["right", "down", "shield"],
        pressed: ["right", "down", "shield"],
        direction: { x: 0.95, y: -0.31 },
      }),
      createEmptyInput(),
    ]);
    expect(snapshot.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "land", slot: 0, wavedash: true }),
    ]));
    expect(snapshot.fighters[0]).toMatchObject({ grounded: true, state: "crouch" });
    expect(snapshot.fighters[0].velocity.x).toBeGreaterThan(300);
  });

  const landingLag = (lCancel: boolean): {
    lagFrames: number;
    landing: GameEvent | undefined;
  } => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -220, y: 135 }, { x: 320, y: 60 }],
    });
    game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    let snapshot = game.getSnapshot();
    if (lCancel) {
      for (let frame = 0; frame < 40; frame += 1) {
        const fighter = snapshot.fighters[0];
        if (fighter.velocity.y < 0 && fighter.position.y < 92) break;
        snapshot = game.step(idlePair());
      }
      game.step([
        input({ held: ["shield"], pressed: ["shield"] }),
        createEmptyInput(),
      ]);
    }
    let landing: GameEvent | undefined;
    for (let frame = 0; frame < 60 && !landing; frame += 1) {
      snapshot = game.step(idlePair());
      landing = snapshot.events.find(({ type, slot }) => type === "land" && slot === 0);
    }
    let lagFrames = 0;
    while (game.getSnapshot().fighters[0].state === "crouch" && lagFrames < 30) {
      game.step(idlePair());
      lagFrames += 1;
    }
    return { lagFrames, landing };
  };

  it("converts an aerial into bounded landing lag", () => {
    const result = landingLag(false);
    expect(result.landing?.impactSpeed).toBeGreaterThan(0);
    expect(result.landing?.lCancelled).toBe(false);
    expect(result.lagFrames).toBeGreaterThanOrEqual(6);
    expect(result.lagFrames).toBeLessThanOrEqual(16);
  });

  it("halves aerial landing lag when shield is timed before contact", () => {
    const normal = landingLag(false);
    const cancelled = landingLag(true);
    expect(cancelled.landing?.lCancelled).toBe(true);
    expect(cancelled.lagFrames).toBeLessThan(normal.lagFrames);
  });
});

describe("input buffering", () => {
  it("buffers a special and its direction during move recovery", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 60 }, { x: 300, y: 60 }],
    });
    settle(game);
    game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    const jab = getFighterDefinition("kaykit-knight").attacks.jab;
    const finalActionFrame = jab.startup + jab.active + jab.recovery - 1;
    let snapshot = game.getSnapshot();
    while (
      snapshot.fighters[0].currentMove === "jab" &&
      snapshot.fighters[0].moveFrame < finalActionFrame
    ) {
      snapshot = game.step(idlePair());
    }
    game.step([
      input({
        held: ["up", "special"],
        pressed: ["up", "special"],
        direction: { x: 0, y: 1 },
      }),
      createEmptyInput(),
    ]);

    const events: GameEvent[] = [];
    snapshot = game.getSnapshot();
    for (let frame = 0; frame < 12 && snapshot.fighters[0].currentMove !== "up-special"; frame += 1) {
      snapshot = game.step(idlePair());
      events.push(...snapshot.events);
    }
    expect(snapshot.fighters[0].currentMove).toBe("up-special");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "attack", slot: 0, move: "up-special" }),
    ]));
  });

  it("expires a buffered action that arrives too early", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 60 }, { x: 300, y: 60 }],
    });
    settle(game);
    game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    game.step([
      input({ held: ["special"], pressed: ["special"] }),
      createEmptyInput(),
    ]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 24; frame += 1) events.push(...game.step(idlePair()).events);
    expect(events.some(({ type, move }) =>
      type === "attack" && move === "neutral-special"
    )).toBe(false);
    expect(game.getSnapshot().fighters[0].currentMove).toBeNull();
  });
});

type LaunchProbe = {
  position: { x: number; y: number };
  previousPosition: { x: number; y: number };
  velocity: { x: number; y: number };
  launchVelocity: { x: number; y: number };
  grounded: boolean;
  supportPlatform: string | null;
  hitstopFrames: number;
  hitstunFrames: number;
  techable: boolean;
  state: string;
  definition: { size: { width: number; height: number } };
};

type LaunchInternals = {
  fighters: [LaunchProbe, LaunchProbe];
  applyLaunch: (
    target: LaunchProbe,
    attacker: LaunchProbe,
    damage: number,
    angle: number,
    baseKnockback: number,
    growth: number,
    hitstun: number,
    targetInput: InputFrame,
  ) => void;
};

const launchScenario = (): {
  game: ReturnType<typeof createGame>;
  internals: LaunchInternals;
} => {
  const game = createGame(matchConfig(), {
    countdownFrames: 0,
    spawnPositions: [{ x: -80, y: 60 }, { x: 80, y: 420 }],
  });
  return { game, internals: game as unknown as LaunchInternals };
};

describe("directional influence and teching", () => {
  it("rotates launch with DI chosen during hitstop without changing speed", () => {
    const { game, internals } = launchScenario();
    const [attacker, target] = internals.fighters;
    internals.applyLaunch(target, attacker, 6, 0, 45, 0.8, 8, createEmptyInput());
    const speed = Math.hypot(target.launchVelocity.x, target.launchVelocity.y);
    target.hitstopFrames = 2;
    const heldUp = input({ held: ["up"], direction: { x: 0, y: 1 } });
    game.step([createEmptyInput(), heldUp]);
    game.step([createEmptyInput(), heldUp]);

    expect(Math.hypot(target.launchVelocity.x, target.launchVelocity.y)).toBeCloseTo(speed, 6);
    expect(target.launchVelocity.y).toBeGreaterThan(speed * 0.3);
    expect(target.launchVelocity.x).toBeGreaterThan(0);
  });

  it("applies one SDI pulse on a direction edge without repeating a held input", () => {
    const { game, internals } = launchScenario();
    const [attacker, target] = internals.fighters;
    internals.applyLaunch(target, attacker, 6, 0, 45, 0.8, 8, createEmptyInput());
    target.position = { x: 80, y: 420 };
    target.previousPosition = { ...target.position };
    target.velocity = { x: 0, y: 0 };
    target.launchVelocity = { x: 0, y: 0 };
    target.grounded = false;
    target.supportPlatform = null;
    target.hitstopFrames = 4;

    game.step(idlePair());
    const beforePulse = target.position.x;
    game.step([
      createEmptyInput(),
      input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
    ]);
    expect(target.position.x - beforePulse).toBeCloseTo(SDI_DISTANCE, 6);
    const afterPulse = target.position.x;
    game.step([
      createEmptyInput(),
      input({ held: ["right"], direction: { x: 1, y: 0 } }),
    ]);
    expect(target.position.x).toBeCloseTo(afterPulse, 6);
  });

  it("applies held ASDI once as hitstop ends", () => {
    const { game, internals } = launchScenario();
    const [attacker, target] = internals.fighters;
    internals.applyLaunch(target, attacker, 6, 0, 45, 0.8, 8, createEmptyInput());
    target.position = { x: 80, y: 420 };
    target.previousPosition = { ...target.position };
    target.velocity = { x: 0, y: 0 };
    target.launchVelocity = { x: 0, y: 0 };
    target.grounded = false;
    target.supportPlatform = null;
    target.hitstopFrames = 2;
    const heldRight = input({ held: ["right"], direction: { x: 1, y: 0 } });

    const startX = target.position.x;
    game.step([createEmptyInput(), heldRight]);
    expect(target.position.x).toBeCloseTo(startX, 6);
    game.step([createEmptyInput(), heldRight]);
    expect(target.position.x - startX).toBeCloseTo(ASDI_DISTANCE, 6);
    const afterAsdi = target.position.x;
    game.step(idlePair());
    expect(target.position.x).toBeCloseTo(afterAsdi, 6);
  });

  it.each([-1, 0, 1] as const)(
    "ground-techs with horizontal intent %s and exits hitstun",
    (directionX) => {
      expect(TECH_INPUT_WINDOW_FRAMES).toBe(20);
      expect(TECH_INPUT_LOCKOUT_FRAMES).toBe(40);
      const game = createGame(matchConfig(), {
        countdownFrames: 0,
        spawnPositions: [{ x: -300, y: 60 }, { x: 0, y: 240 }],
      });
      const internals = game as unknown as { fighters: [LaunchProbe, LaunchProbe] };
      const target = internals.fighters[1];
      const main = game.getSnapshot().stage.platforms.find(({ id }) => id === "main");
      if (!main) throw new Error("The test stage needs a main platform");
      target.position = {
        x: 0,
        y: stageSurfaceYAt(main, 0) + target.definition.size.height / 2 + 5,
      };
      target.previousPosition = { ...target.position };
      target.velocity = { x: 0, y: -600 };
      target.grounded = false;
      target.supportPlatform = null;
      target.hitstopFrames = 0;
      target.hitstunFrames = 30;
      target.techable = true;
      target.state = "hitstun";
      const directionAction = directionX < 0 ? "left" : "right";
      const actions: ActionName[] = directionX === 0
        ? ["shield"]
        : ["shield", directionAction];

      const fighter = game.step([
        createEmptyInput(),
        input({
          held: actions,
          pressed: actions,
          direction: { x: directionX, y: 0 },
        }),
      ]).fighters[1];

      expect(fighter).toMatchObject({
        grounded: true,
        state: "dodge",
        hitstunFrames: 0,
      });
      expect(fighter.invulnerableFrames).toBeGreaterThan(0);
      if (directionX === 0) expect(fighter.dodgeKind).toBe("spot");
      else expect(["forward", "back"]).toContain(fighter.dodgeKind);
    },
  );

  it("wall-techs a horizontal impact and rebounds from the solid edge", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 300, y: 60 }, { x: 0, y: 240 }],
    });
    const internals = game as unknown as { fighters: [LaunchProbe, LaunchProbe] };
    const target = internals.fighters[1];
    const main = game.getSnapshot().stage.platforms.find(({ id }) => id === "main");
    if (!main) throw new Error("The test stage needs a main platform");
    const halfWidth = target.definition.size.width * 0.28;
    const leftEdge = main.position.x - main.width / 2;
    target.position = { x: leftEdge - halfWidth - 2, y: main.position.y };
    target.previousPosition = { ...target.position };
    target.velocity = { x: 360, y: 0 };
    target.grounded = false;
    target.supportPlatform = null;
    target.hitstopFrames = 0;
    target.hitstunFrames = 30;
    target.techable = true;
    target.state = "hitstun";

    const fighter = game.step([
      createEmptyInput(),
      input({ held: ["shield"], pressed: ["shield"] }),
    ]).fighters[1];
    expect(fighter.hitstunFrames).toBe(0);
    expect(fighter.invulnerableFrames).toBeGreaterThan(0);
    expect(fighter.velocity.x).toBeLessThan(0);
  });
});

describe("projectiles and reflection", () => {
  it("spawns an authored projectile and launches in its travel direction", () => {
    const game = createGame(matchConfig("george", "kaykit-knight"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -170, y: 60 }, { x: 170, y: 60 }],
    });
    settle(game);
    game.step([
      input({ held: ["special"], pressed: ["special"] }),
      createEmptyInput(),
    ]);

    const events: GameEvent[] = [];
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 100; frame += 1) {
      snapshot = game.step(idlePair());
      events.push(...snapshot.events);
      if (events.some(({ type, source, target }) =>
        type === "hit" && source === "projectile" && target === 1
      )) break;
    }

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "projectile", slot: 0, projectileKind: "blaster" }),
      expect.objectContaining({ type: "hit", source: "projectile", target: 1 }),
    ]));
    expect(snapshot.fighters[1].velocity.x).toBeGreaterThan(0);
  });

  it("reflects an incoming projectile and transfers ownership", () => {
    const game = createGame(matchConfig("george", "kaykit-knight"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -170, y: 60 }, { x: 170, y: 60 }],
    });
    settle(game);
    const internals = game as unknown as {
      fighters: [unknown, { projectileShieldFrames: number }];
    };
    internals.fighters[1].projectileShieldFrames = 120;
    game.step([
      input({ held: ["special"], pressed: ["special"] }),
      createEmptyInput(),
    ]);

    const events: GameEvent[] = [];
    let reflected: GameSnapshot["projectiles"][number] | undefined;
    for (let frame = 0; frame < 100 && !reflected; frame += 1) {
      const snapshot = game.step(idlePair());
      events.push(...snapshot.events);
      reflected = snapshot.projectiles.find(({ owner }) => owner === 1);
    }

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "shield-hit",
        slot: 1,
        target: 0,
        sound: "projectile-reflect",
      }),
    ]));
    expect(reflected?.owner).toBe(1);
    expect(reflected?.velocity.x).toBeLessThan(0);
  });
});

describe("hit integration, recovery, and knockouts", () => {
  const jabHitAt = (percent: number): {
    event: GameEvent;
    snapshot: GameSnapshot;
  } => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -40, y: 60 }, { x: 40, y: 60 }],
    });
    settle(game);
    const internals = game as unknown as {
      fighters: [unknown, { percent: number }];
    };
    internals.fighters[1].percent = percent;
    game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 16; frame += 1) {
      const snapshot = game.step(idlePair());
      const event = snapshot.events.find(({ type, target, move }) =>
        type === "hit" && target === 1 && move === "jab"
      );
      if (event) return { event, snapshot };
    }
    throw new Error("The calibration strike did not connect");
  };

  it("applies damage, hitstop, hitstun, and directional launch on contact", () => {
    const { event, snapshot } = jabHitAt(0);
    expect(event.damage).toBeGreaterThan(0);
    expect(Math.hypot(event.velocity?.x ?? 0, event.velocity?.y ?? 0)).toBeGreaterThan(0);
    expect(snapshot.fighters[1].percent).toBeGreaterThan(0);
    expect(snapshot.fighters[1].velocity.x).toBeGreaterThan(0);
    expect(snapshot.fighters.some(({ hitstunFrames }) => hitstunFrames > 0)).toBe(true);
  });

  it("makes the same normal attack launch farther at high percent", () => {
    const fresh = jabHitAt(0).event;
    const critical = jabHitAt(150).event;
    const freshSpeed = Math.hypot(fresh.velocity?.x ?? 0, fresh.velocity?.y ?? 0);
    const criticalSpeed = Math.hypot(critical.velocity?.x ?? 0, critical.velocity?.y ?? 0);
    expect(criticalSpeed).toBeGreaterThan(freshSpeed * 1.4);
  });

  it("keeps launch decay independent after hitstun ends", () => {
    const { game, internals } = launchScenario();
    const [attacker, target] = internals.fighters;
    internals.applyLaunch(target, attacker, 6, 20, 45, 0.8, 8, createEmptyInput());
    const initialHitstun = target.hitstunFrames;
    const initialSpeed = Math.hypot(target.launchVelocity.x, target.launchVelocity.y);
    game.step(idlePair());
    expect(Math.hypot(target.launchVelocity.x, target.launchVelocity.y)).toBeLessThan(initialSpeed);
    for (let frame = 1; frame < initialHitstun; frame += 1) game.step(idlePair());
    expect(target.hitstunFrames).toBe(0);
    const residual = Math.hypot(target.launchVelocity.x, target.launchVelocity.y);
    expect(residual).toBeGreaterThan(0);
    game.step(idlePair());
    expect(Math.hypot(target.launchVelocity.x, target.launchVelocity.y)).toBeLessThan(residual);
  });

  it("removes a stock and emits a knockout beyond the blast zone", () => {
    const game = createGame(matchConfig(), { countdownFrames: 0 });
    const internals = game as unknown as {
      fighters: [{ position: { x: number; y: number } }, unknown];
    };
    internals.fighters[0].position.x = game.getSnapshot().stage.blastZone.right + 1;
    const snapshot = game.step(idlePair());
    expect(snapshot.fighters[0]).toMatchObject({ stocks: 2, state: "ko" });
    expect(snapshot.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "ko", slot: 0 }),
    ]));
  });

  it("limits an aerial up special until landing", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 520 }, { x: 400, y: 60 }],
    });
    const upSpecial = input({
      held: ["up", "special"],
      pressed: ["up", "special"],
      direction: { x: 0, y: 1 },
    });
    let snapshot = game.step([upSpecial, createEmptyInput()]);
    expect(snapshot.fighters[0].currentMove).toBe("up-special");
    for (let frame = 0; frame < 90 && snapshot.fighters[0].currentMove; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].grounded).toBe(false);
    snapshot = game.step([upSpecial, createEmptyInput()]);
    expect(snapshot.fighters[0].currentMove).toBeNull();
    expect(snapshot.events.some(({ type }) => type === "attack")).toBe(false);

    for (let frame = 0; frame < 240 && !snapshot.fighters[0].grounded; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].grounded).toBe(true);
    snapshot = game.step([upSpecial, createEmptyInput()]);
    expect(snapshot.fighters[0].currentMove).toBe("up-special");
  });

  it("blocks attacks after an aerial up special until an incoming hit restores recovery", () => {
    const game = createGame(matchConfig(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -400, y: 600 }, { x: 400, y: 60 }],
    });
    type RecoveryProbe = LaunchProbe & {
      jumpsRemaining: number;
      airUpSpecialUsed: boolean;
      action: unknown;
    };
    type RecoveryInternals = {
      fighters: [RecoveryProbe, RecoveryProbe];
      resolveAttackHit: (
        attacker: RecoveryProbe,
        target: RecoveryProbe,
        move: AttackDefinition,
        moveName: MoveName,
        targetInput: InputFrame,
      ) => void;
    };
    const internals = game as unknown as RecoveryInternals;
    const recovering = internals.fighters[0];
    recovering.position = { x: -400, y: 600 };
    recovering.previousPosition = { ...recovering.position };
    recovering.velocity = { x: 0, y: 0 };
    recovering.launchVelocity = { x: 0, y: 0 };
    recovering.grounded = false;
    recovering.supportPlatform = null;
    recovering.state = "fall";

    let snapshot = game.step([
      input({
        held: ["up", "special"],
        pressed: ["up", "special"],
        direction: { x: 0, y: 1 },
      }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 90 && snapshot.fighters[0].currentMove; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(recovering.airUpSpecialUsed).toBe(true);
    snapshot = game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBeNull();

    recovering.jumpsRemaining = 0;
    internals.resolveAttackHit(
      internals.fighters[1],
      recovering,
      getFighterDefinition("george").attacks.jab,
      "jab",
      createEmptyInput(),
    );
    expect(recovering.jumpsRemaining).toBe(1);
    expect(recovering.airUpSpecialUsed).toBe(false);
    recovering.hitstopFrames = 0;
    recovering.hitstunFrames = 0;
    recovering.action = null;
    recovering.state = "fall";
    snapshot = game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toMatch(/-air$/);
  });
});
