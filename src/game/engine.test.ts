import { describe, expect, it } from "vitest";
import type { ActionName, FighterId, InputFrame, MatchConfig } from "./contracts";
import {
  AIR_DODGE_VELOCITY_RETENTION,
  ASDI_DISTANCE,
  ATTACK_MOBILITY_RECOVERY_FRAMES,
  calculateMeleeKnockback,
  comboStarterBaseKnockbackScale,
  competitiveHitboxesForMove,
  createEmptyInput,
  createGame,
  decayMeleeLaunchVelocity,
  defensiveMoveActiveAtFrame,
  effectiveProjectileLifetime,
  DIGITAL_DASH_IMPULSE_MULTIPLIER,
  DIRECTIONAL_LAUNCH_SUSTAIN_FRAMES,
  fighterHurtboxProfile,
  GROUND_ATTACK_BRAKE_MULTIPLIER,
  GROUND_RELEASE_BRAKE_MULTIPLIER,
  GROUND_REVERSAL_ACCELERATION_MULTIPLIER,
  GROUND_RUN_SPEED_MULTIPLIER,
  jumpSpeedForMinimumRise,
  JUMP_INPUT_BUFFER_FRAMES,
  LEDGE_MAX_HANG_FRAMES,
  MAX_RESPONSIVE_JUMP_SQUAT_FRAMES,
  MIN_DOUBLE_JUMP_RISE,
  MIN_FULL_HOP_RISE,
  MELEE_HITSTUN_PER_KNOCKBACK,
  MELEE_LAUNCH_SPEED_DECAY_PER_FRAME,
  MELEE_LAUNCH_SPEED_MULTIPLIER,
  meleeHitstunFrames,
  meleeClankOutcome,
  meleeClankReboundFrames,
  meleeLaunchVelocity,
  meleeLaunchVelocityToWorld,
  SAME_MOVE_LOCK_BREAK_HIT,
  SAME_MOVE_LOCK_BREAK_LAUNCH_MULTIPLIER,
  SHORT_HOP_RELEASE_GRACE_FRAMES,
  SHIELD_INPUT_BUFFER_FRAMES,
  SDI_DISTANCE,
  SMASH_CHORD_GRACE_FRAMES,
  TECH_INPUT_LOCKOUT_FRAMES,
  TECH_INPUT_WINDOW_FRAMES,
  type GameEvent,
  type GameSnapshot,
} from "./engine";
import { FIGHTER_IDS, getFighterDefinition, type AttackDefinition, type MoveName } from "./roster";
import { DEFAULT_STAGE_ID, getStageDefinition, stageSurfaceYAt } from "./stages";

const config = (first: FighterId = "mario", second: FighterId = "link"): MatchConfig => ({
  players: [
    { fighter: first, skin: "00", name: "J1", slot: 0, cpu: false, cpuLevel: 1 },
    { fighter: second, skin: "00", name: "J2", slot: 1, cpu: false, cpuLevel: 1 },
  ],
  stocks: 3,
  items: false,
  itemFrequency: "medium",
  stage: DEFAULT_STAGE_ID,
});

const input = ({
  held = [],
  pressed = [],
  direction = { x: 0, y: 0 },
  analog = false,
}: {
  held?: ActionName[];
  pressed?: ActionName[];
  direction?: { x: number; y: number };
  analog?: boolean;
} = {}): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
  direction,
  analog,
});

const idlePair = (): [InputFrame, InputFrame] => [createEmptyInput(), createEmptyInput()];

const settle = (game: ReturnType<typeof createGame>, frames = 30): void => {
  for (let frame = 0; frame < frames; frame += 1) game.step(idlePair());
};

const approachLeftLedge = (
  game: ReturnType<typeof createGame>,
  extraReach = 50,
  fighterInput = createEmptyInput(),
): GameSnapshot => {
  const snapshot = game.getSnapshot();
  const ledge = snapshot.stage.ledges.find(({ side }) => side === "left")!;
  const fighter = snapshot.fighters[0];
  const halfWidth = fighter.size.width * 0.28;
  const halfHeight = fighter.size.height / 2;
  const runtime = (game as unknown as {
    fighters: [
      {
        position: { x: number; y: number };
        previousPosition: { x: number; y: number };
        velocity: { x: number; y: number };
        grounded: boolean;
        supportPlatform: string | null;
        state: string;
        ledge: "left" | "right" | null;
        ledgeCooldownFrames: number;
        hitstunFrames: number;
      },
      unknown,
    ];
  }).fighters[0];
  runtime.position = {
    x: ledge.position.x - halfWidth - extraReach,
    y: ledge.position.y - halfHeight,
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

describe("CombatGame", () => {
  it("extends standard projectiles without changing mechanically timed projectiles", () => {
    const fireball = getFighterDefinition("mario").attacks["neutral-special"].projectile!;
    const thunder = getFighterDefinition("pikachu").attacks["down-special"].projectile!;
    const groundWave = getFighterDefinition("donkey-kong").attacks["down-special"].projectile!;
    expect(effectiveProjectileLifetime(fireball)).toBe(Math.round(fireball.lifetimeFrames * 1.25));
    expect(effectiveProjectileLifetime(thunder)).toBe(thunder.lifetimeFrames);
    expect(effectiveProjectileLifetime(groundWave)).toBe(groundWave.lifetimeFrames);
  });

  it("places fighters on the stage during the countdown", () => {
    const game = createGame(config(), { countdownFrames: 120 });
    const initial = game.getSnapshot();
    expect(initial.phase).toBe("countdown");
    expect(initial.fighters.every(({ grounded, state }) => grounded && state === "entrance")).toBe(true);
    const initialY = initial.fighters.map(({ position }) => position.y);

    const next = game.step(idlePair());
    expect(next.fighters.map(({ position }) => position.y)).toEqual(initialY);
    expect(next.fighters.every(({ grounded }) => grounded)).toBe(true);
  });

  it("starts sudden death at 999% when the timer expires with equal stocks", () => {
    const game = createGame({ ...config(), timeLimitSeconds: 1 }, { countdownFrames: 0 });
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 60; frame += 1) snapshot = game.step(idlePair());

    expect(snapshot.phase).toBe("playing");
    expect(snapshot.remainingTimeMs).toBeNull();
    expect(snapshot.suddenDeath).toBe(true);
    expect(snapshot.fighters.map(({ stocks }) => stocks)).toEqual([1, 1]);
    expect(snapshot.fighters.map(({ percent }) => percent)).toEqual([999, 999]);
    expect(snapshot.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "sudden-death", value: 999 }),
    ]));

    const internals = game as unknown as {
      fighters: [{ position: { x: number; y: number } }, { position: { x: number; y: number } }];
      stage: GameSnapshot["stage"];
    };
    internals.fighters[0].position.x = internals.stage.blastZone.left - 1;
    snapshot = game.step(idlePair());
    expect(snapshot.phase).toBe("finished");
    expect(snapshot.winner).toBe(1);
  });

  it("awards victory to the player with the most stocks when time expires", () => {
    const game = createGame({ ...config(), timeLimitSeconds: 1 }, { countdownFrames: 0 });
    const internals = game as unknown as { fighters: [{ stocks: number }, { stocks: number }] };
    internals.fighters[1].stocks = 2;

    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 60; frame += 1) snapshot = game.step(idlePair());

    expect(snapshot.phase).toBe("finished");
    expect(snapshot.winner).toBe(0);
    expect(snapshot.suddenDeath).toBe(false);
  });

  it("keeps the hurtbox capsule aligned with the feet when the fighter crouches", () => {
    const size = { width: 62, height: 82 };
    const standing = fighterHurtboxProfile(size, "idle");
    const crouching = fighterHurtboxProfile(size, "crouch");
    expect(crouching.centerOffsetY - crouching.halfHeight).toBeCloseTo(
      standing.centerOffsetY - standing.halfHeight,
    );
    expect(crouching.centerOffsetY + crouching.halfHeight).toBeLessThan(
      standing.centerOffsetY + standing.halfHeight,
    );
    expect(crouching.radius).toBeLessThanOrEqual(crouching.halfHeight);
  });

  it("propagates the selected skin to the rendered snapshot", () => {
    const skinned = config();
    skinned.players[0].skin = "03";
    const game = createGame(skinned, { countdownFrames: 0 });
    expect(game.getSnapshot().fighters[0].skin).toBe("03");
    expect(game.getSnapshot().fighters[1].skin).toBe("00");
  });

  it("transitions directly from a press to dash and then run in both directions", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [
        { x: -180, y: 52 },
        { x: 180, y: 52 },
      ],
    });
    settle(game);

    const rightHeld = input({ held: ["right"], direction: { x: 1, y: 0 } });
    game.step([
      input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    const rightStates: string[] = [game.getSnapshot().fighters[0].state];
    for (let frame = 0; frame < 12; frame += 1) {
      rightStates.push(game.step([rightHeld, createEmptyInput()]).fighters[0].state);
    }
    expect(rightStates).toContain("dash");
    expect(rightStates).toContain("run");
    expect(rightStates).not.toContain("walk");
    expect(game.getSnapshot().fighters[0].velocity.x).toBeGreaterThan(0);

    for (let frame = 0; frame < 18; frame += 1) game.step(idlePair());
    const leftHeld = input({ held: ["left"], direction: { x: -1, y: 0 } });
    game.step([
      input({ held: ["left"], pressed: ["left"], direction: { x: -1, y: 0 } }),
      createEmptyInput(),
    ]);
    const leftStates: string[] = [];
    // The return includes the 5 pivot frames before Mario's 10 dash frames,
    // then leaves one frame to observe the transition into a run.
    for (let frame = 0; frame < 16; frame += 1) {
      leftStates.push(game.step([leftHeld, createEmptyInput()]).fighters[0].state);
    }
    expect(leftStates).toContain("run");
    expect(leftStates).not.toContain("walk");
    expect(game.getSnapshot().fighters[0].facing).toBe(-1);
  });

  it("triggers the dash attack and its dedicated animation", () => {
    const game = createGame(config("fox", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -240, y: 52 }, { x: 240, y: 52 }],
    });
    settle(game);
    const runRight = input({ held: ["right"], direction: { x: 1, y: 0 } });
    game.step([
      input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 4; frame += 1) game.step([runRight, createEmptyInput()]);
    const snapshot = game.step([
      input({ held: ["right", "attack"], pressed: ["attack"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);

    expect(snapshot.fighters[0].currentMove).toBe("dash-attack");
    expect(snapshot.events.some(({ type, move }) => type === "attack" && move === "dash-attack")).toBe(true);
  });

  it("allows four frames between the direction and attack inputs for a smash", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 52 }, { x: 320, y: 52 }],
    });
    settle(game);

    game.step([
      input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 3; frame += 1) {
      game.step([
        input({ held: ["right"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
    }
    const snapshot = game.step([
      input({ held: ["right", "attack"], pressed: ["attack"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);

    expect(SMASH_CHORD_GRACE_FRAMES).toBe(4);
    expect(snapshot.fighters[0].currentMove).toBe("forward-smash");
  });

  it("also allows a direction received just after the attack button", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 52 }, { x: 320, y: 52 }],
    });
    settle(game);
    let snapshot = game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBe("jab");

    snapshot = game.step([
      input({
        held: ["right", "attack"],
        pressed: ["right"],
        direction: { x: 1, y: 0 },
      }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBe("forward-smash");
  });

  it("builds chains of small hitboxes with a sweet spot for smash attacks", () => {
    const mario = getFighterDefinition("mario");
    for (const moveName of ["forward-smash", "up-smash", "down-smash"] as const) {
      const move = mario.attacks[moveName];
      const hitboxes = competitiveHitboxesForMove(moveName, move, Math.floor(move.active / 2));
      expect(hitboxes.length).toBeGreaterThanOrEqual(3);
      expect(hitboxes.some(({ kind }) => kind === "sweet")).toBe(true);
      expect(Math.max(...hitboxes.map(({ radius }) => radius))).toBeLessThan(move.radius * 0.65);
    }
    const downSmash = mario.attacks["down-smash"];
    const downHitboxes = competitiveHitboxesForMove(
      "down-smash",
      downSmash,
      Math.floor((downSmash.active - 1) / 2),
    );
    expect(downHitboxes.some(({ offset }) => offset.x < 0)).toBe(true);
    expect(downHitboxes.some(({ offset }) => offset.x > 0)).toBe(true);
  });

  it("animates custom hitboxes and respects their active windows", () => {
    const custom = competitiveHitboxesForMove(
      "forward-tilt",
      {
        active: 5,
        radius: 30,
        offset: { x: 30, y: 0 },
        hitboxes: [{
          offset: { x: 10, y: 0 },
          endOffset: { x: 30, y: 10 },
          radius: 8,
          activeStart: 1,
          activeEnd: 3,
          damageMultiplier: 1.08,
          knockbackMultiplier: 1.1,
          kind: "sweet",
        }],
      },
      2,
    );
    expect(custom).toHaveLength(1);
    expect(custom[0]?.offset).toEqual({ x: 20, y: 5 });
    expect(custom[0]).toMatchObject({ radius: 8, kind: "sweet" });
    expect(competitiveHitboxesForMove(
      "forward-tilt",
      {
        active: 5,
        radius: 30,
        offset: { x: 30, y: 0 },
        hitboxes: [{
          offset: { x: 10, y: 0 },
          radius: 8,
          activeStart: 1,
          activeEnd: 3,
        }],
      },
      4,
    )).toEqual([]);
  });

  it("weakens late hitboxes on lingering aerials", () => {
    const move = getFighterDefinition("mario").attacks["neutral-air"];
    const early = competitiveHitboxesForMove("neutral-air", move, 0);
    const late = competitiveHitboxesForMove("neutral-air", move, move.active - 1);
    expect(Math.max(...early.map(({ damageMultiplier }) => damageMultiplier)))
      .toBeGreaterThan(Math.max(...late.map(({ damageMultiplier }) => damageMultiplier)));
    expect(Math.max(...early.map(({ knockbackMultiplier }) => knockbackMultiplier)))
      .toBeGreaterThan(Math.max(...late.map(({ knockbackMultiplier }) => knockbackMultiplier)));
  });

  it("bounds all normal hitboxes in the competitive roster", () => {
    const normals = [
      "jab",
      "dash-attack",
      "forward-tilt",
      "up-tilt",
      "down-tilt",
      "forward-smash",
      "up-smash",
      "down-smash",
      "neutral-air",
      "forward-air",
      "back-air",
      "up-air",
      "down-air",
    ] as const;
    for (const fighterId of FIGHTER_IDS) {
      const fighter = getFighterDefinition(fighterId);
      for (const moveName of normals) {
        const move = fighter.attacks[moveName];
        for (let frame = 0; frame < move.active; frame += 1) {
          const hitboxes = competitiveHitboxesForMove(moveName, move, frame);
          expect(hitboxes.length, `${fighterId}/${moveName}@${frame}`).toBeGreaterThan(0);
          expect(hitboxes.length, `${fighterId}/${moveName}@${frame}`).toBeLessThanOrEqual(6);
          for (const hitbox of hitboxes) {
            expect(hitbox.radius, `${fighterId}/${moveName}@${frame}`).toBeGreaterThanOrEqual(7);
            expect(hitbox.radius, `${fighterId}/${moveName}@${frame}`).toBeLessThan(move.radius * 0.66);
            expect(hitbox.damageMultiplier).toBeGreaterThanOrEqual(0.8);
            expect(hitbox.damageMultiplier).toBeLessThanOrEqual(1.08);
            expect(hitbox.knockbackMultiplier).toBeGreaterThanOrEqual(0.8);
            expect(hitbox.knockbackMultiplier).toBeLessThanOrEqual(1.1);
          }
        }
      }
    }
  });

  it("makes forward smash reliable at visual range without hitting excessively far away", () => {
    const hitsAtDistance = (distance: number): boolean => {
      const game = createGame(config("mario", "mario"), {
        countdownFrames: 0,
        spawnPositions: [{ x: -50, y: 52 }, { x: -50 + distance, y: 52 }],
      });
      settle(game);
      game.step([
        input({
          held: ["right", "attack"],
          pressed: ["right", "attack"],
          direction: { x: 1, y: 0 },
        }),
        createEmptyInput(),
      ]);
      for (let frame = 0; frame < 24; frame += 1) {
        if (game.step(idlePair()).events.some(
          ({ type, target, move }) =>
            type === "hit" && target === 1 && move === "forward-smash",
        )) return true;
      }
      return false;
    };

    expect(hitsAtDistance(98)).toBe(true);
    expect(hitsAtDistance(145)).toBe(false);
  });

  it("makes two similarly powered grounded attacks clank", () => {
    const game = createGame(config("mario", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -30, y: 52 }, { x: 30, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      input({ held: ["attack"], pressed: ["attack"] }),
    ]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 8; frame += 1) events.push(...game.step(idlePair()).events);
    const snapshot = game.getSnapshot();
    expect(events.some(({ type }) => type === "clank")).toBe(true);
    expect(snapshot.fighters[0].percent).toBe(0);
    expect(snapshot.fighters[1].percent).toBe(0);
    expect(snapshot.fighters[0].currentMove).toBeNull();
    expect(snapshot.fighters[1].currentMove).toBeNull();
  });

  it("applies Melee's exact priority window and rebound", () => {
    expect(meleeClankOutcome(10, 19)).toBe("both");
    expect(meleeClankOutcome(10, 19.01)).toBe("first");
    expect(meleeClankOutcome(20, 10)).toBe("second");
    expect(meleeClankReboundFrames(15)).toBe(Math.ceil(0.559 * 25));
  });

  it("allows simultaneous aerial trades without hidden player-one priority", () => {
    const game = createGame(config("mario", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -22, y: 360 }, { x: 22, y: 360 }],
    });
    game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      input({ held: ["attack"], pressed: ["attack"] }),
    ]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 8; frame += 1) events.push(...game.step(idlePair()).events);
    const snapshot = game.getSnapshot();
    expect(events.some(({ type }) => type === "clank")).toBe(false);
    expect(snapshot.fighters[0].percent).toBeGreaterThan(0);
    expect(snapshot.fighters[1].percent).toBeGreaterThan(0);
  });

  it("slightly slows running without erasing character-specific speeds", () => {
    const runVelocity = (fighter: FighterId): number => {
      const game = createGame(config(fighter, "link"), {
        countdownFrames: 0,
        spawnPositions: [{ x: -420, y: 52 }, { x: 420, y: 52 }],
      });
      settle(game);
      game.step([
        input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
      let snapshot = game.getSnapshot();
      for (let frame = 0; frame < 28; frame += 1) {
        snapshot = game.step([
          input({ held: ["right"], direction: { x: 1, y: 0 } }),
          createEmptyInput(),
        ]);
      }
      expect(snapshot.fighters[0].state).toBe("run");
      return snapshot.fighters[0].velocity.x;
    };

    const mario = runVelocity("mario");
    const falcon = runVelocity("captain-falcon");
    expect(GROUND_RUN_SPEED_MULTIPLIER).toBe(0.92);
    expect(mario).toBeCloseTo(
      getFighterDefinition("mario").runSpeed * GROUND_RUN_SPEED_MULTIPLIER,
      0,
    );
    expect(falcon).toBeCloseTo(
      getFighterDefinition("captain-falcon").runSpeed * GROUND_RUN_SPEED_MULTIPLIER,
      0,
    );
    expect(falcon).toBeGreaterThan(mario * 1.4);
  });

  it("strongly brakes a hitstun slide and breaks its momentum offstage", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 400, y: 52 }],
    });
    settle(game);
    const internals = game as unknown as {
      fighters: [
        {
          position: { x: number; y: number };
          velocity: { x: number; y: number };
          hitstunFrames: number;
          grounded: boolean;
          supportPlatform: string | null;
          state: string;
        },
        unknown,
      ];
    };
    const fighter = internals.fighters[0];
    const startX = fighter.position.x;
    fighter.velocity.x = 900;
    fighter.hitstunFrames = 20;
    fighter.state = "hitstun";
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 15; frame += 1) snapshot = game.step(idlePair());
    expect(Math.abs(snapshot.fighters[0].velocity.x)).toBeLessThan(1);
    expect(snapshot.fighters[0].position.x - startX).toBeLessThan(100);

    const main = snapshot.stage.platforms.find(({ id }) => id === "main")!;
    fighter.position.x =
      main.position.x + main.width / 2 + snapshot.fighters[0].size.width;
    fighter.velocity.x = 900;
    fighter.hitstunFrames = 20;
    fighter.grounded = true;
    fighter.supportPlatform = main.id;
    fighter.state = "hitstun";
    snapshot = game.step(idlePair());
    expect(snapshot.fighters[0].grounded).toBe(false);
    expect(snapshot.fighters[0].velocity.x).toBeLessThan(400);
  });

  it.each(FIGHTER_IDS)(
    "%s reverses a run within nine frames outside a dash dance",
    (fighterId) => {
      const game = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [{ x: -420, y: 120 }, { x: 520, y: 120 }],
      });
      settle(game);
      game.step([
        input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
      for (let frame = 0; frame < 30; frame += 1) {
        game.step([
          input({ held: ["right"], direction: { x: 1, y: 0 } }),
          createEmptyInput(),
        ]);
      }
      expect(game.getSnapshot().fighters[0].velocity.x).toBeGreaterThan(0);

      let reverseFrames = 0;
      let snapshot: GameSnapshot = game.step([
        input({ held: ["left"], pressed: ["left"], direction: { x: -1, y: 0 } }),
        createEmptyInput(),
      ]);
      reverseFrames += 1;
      while (snapshot.fighters[0].velocity.x >= 0 && reverseFrames < 12) {
        snapshot = game.step([
          input({ held: ["left"], direction: { x: -1, y: 0 } }),
          createEmptyInput(),
        ]);
        reverseFrames += 1;
      }

      expect(GROUND_REVERSAL_ACCELERATION_MULTIPLIER).toBe(2.25);
      expect(snapshot.fighters[0].velocity.x).toBeLessThan(0);
      expect(reverseFrames).toBeLessThanOrEqual(9);
    },
  );

  it.each(FIGHTER_IDS)(
    "%s brakes its run speed during a grounded jab",
    (fighterId) => {
      const game = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [{ x: -300, y: 120 }, { x: 520, y: 120 }],
      });
      settle(game);
      const internals = game as unknown as {
        fighters: [{ velocity: { x: number; y: number }; state: string }, unknown];
      };
      internals.fighters[0].velocity.x =
        getFighterDefinition(fighterId).runSpeed * GROUND_RUN_SPEED_MULTIPLIER;
      internals.fighters[0].state = "idle";
      const startX = game.getSnapshot().fighters[0].position.x;
      let snapshot = game.step([
        input({ held: ["attack"], pressed: ["attack"] }),
        createEmptyInput(),
      ]);
      for (let frame = 0; frame < 80 && snapshot.fighters[0].currentMove; frame += 1) {
        snapshot = game.step(idlePair());
      }

      expect(GROUND_ATTACK_BRAKE_MULTIPLIER).toBe(3);
      expect(snapshot.fighters[0].position.x - startX).toBeLessThan(100);
      expect(Math.abs(snapshot.fighters[0].velocity.x)).toBeLessThan(100);
    },
  );

  it("restores movement after a jab before allowing another attack", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 120 }, { x: 500, y: 120 }],
    });
    settle(game);
    const jab = getFighterDefinition("mario").attacks.jab;
    const mobilityFrame =
      jab.startup + jab.active + Math.min(jab.recovery, ATTACK_MOBILITY_RECOVERY_FRAMES);
    let snapshot = game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    for (let frame = 1; frame < mobilityFrame; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].currentMove).toBe("jab");

    snapshot = game.step([
      input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    expect(ATTACK_MOBILITY_RECOVERY_FRAMES).toBe(3);
    expect(snapshot.fighters[0].currentMove).toBeNull();
    expect(["dash", "run"]).toContain(snapshot.fighters[0].state);
    expect(snapshot.fighters[0].velocity.x).toBeGreaterThan(0);

    const remainingAttackLock = jab.startup + jab.active + jab.recovery - mobilityFrame;
    for (let frame = 1; frame < remainingAttackLock; frame += 1) {
      snapshot = game.step([
        input({ held: ["attack"], pressed: ["attack"] }),
        createEmptyInput(),
      ]);
      expect(snapshot.fighters[0].currentMove).toBeNull();
    }
    snapshot = game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBe("jab");
  });

  it("also allows jumping during endlag without clearing the attack lock", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 120 }, { x: 500, y: 120 }],
    });
    settle(game);
    const jab = getFighterDefinition("mario").attacks.jab;
    const mobilityFrame =
      jab.startup + jab.active + Math.min(jab.recovery, ATTACK_MOBILITY_RECOVERY_FRAMES);
    game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    for (let frame = 1; frame < mobilityFrame; frame += 1) game.step(idlePair());

    const snapshot = game.step([
      input({ held: ["jump"], pressed: ["jump"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBeNull();
    expect(snapshot.fighters[0].state).toBe("jump-squat");
  });

  it.each(FIGHTER_IDS)(
    "bounds a brief %s keyboard press to less than one twelfth of Battlefield",
    (fighterId) => {
      const game = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [{ x: -300, y: 120 }, { x: 400, y: 120 }],
      });
      settle(game);
      const startingX = game.getSnapshot().fighters[0].position.x;
      const heldRight = input({ held: ["right"], direction: { x: 1, y: 0 } });

      let snapshot = game.step([
        input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
      // Six frames represent a deliberate but brief 100 ms keyboard tap.
      for (let frame = 1; frame < 6; frame += 1) {
        snapshot = game.step([heldRight, createEmptyInput()]);
      }
      for (let frame = 0; frame < 60 && Math.abs(snapshot.fighters[0].velocity.x) > 0; frame += 1) {
        snapshot = game.step(idlePair());
      }

      const main = getStageDefinition(DEFAULT_STAGE_ID).platforms.find(({ id }) => id === "main");
      expect(main).toBeDefined();
      expect(DIGITAL_DASH_IMPULSE_MULTIPLIER).toBe(0.42);
      expect(GROUND_RELEASE_BRAKE_MULTIPLIER).toBe(4);
      expect(snapshot.fighters[0].velocity.x).toBe(0);
      expect((snapshot.fighters[0].position.x - startingX) / main!.width).toBeLessThan(1 / 12);
    },
  );

  it("dash-dances by pivoting instantly within the Melee window", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 52 }, { x: 320, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    game.step([input({ held: ["right"], direction: { x: 1, y: 0 } }), createEmptyInput()]);
    const pivot = game.step([
      input({ held: ["left"], pressed: ["left"], direction: { x: -1, y: 0 } }),
      createEmptyInput(),
    ]);
    expect(pivot.fighters[0].state).toBe("dash");
    expect(pivot.fighters[0].velocity.x).toBeLessThan(0);
    expect(pivot.fighters[0].facing).toBe(-1);
  });

  it("walks with a slight analog tilt, then runs when the stick is pushed", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -180, y: 52 }, { x: 180, y: 52 }],
    });
    settle(game);

    const slow = input({
      held: ["right"],
      pressed: ["right"],
      direction: { x: 0.35, y: 0 },
      analog: true,
    });
    let snapshot = game.step([slow, createEmptyInput()]);
    for (let frame = 0; frame < 10; frame += 1) {
      snapshot = game.step([
        input({ held: ["right"], direction: { x: 0.35, y: 0 }, analog: true }),
        createEmptyInput(),
      ]);
    }
    expect(snapshot.fighters[0].state).toBe("walk");
    const walkingSpeed = snapshot.fighters[0].velocity.x;

    snapshot = game.step([
      input({ held: ["right"], direction: { x: 0.82, y: 0 }, analog: true }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].state).toBe("run");
    expect(snapshot.fighters[0].velocity.x).toBeGreaterThan(walkingSpeed);

    snapshot = game.step([
      input({ held: ["right"], direction: { x: 0.65, y: 0 }, analog: true }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].state).toBe("run");
    snapshot = game.step([
      input({ held: ["right"], direction: { x: 0.55, y: 0 }, analog: true }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].state).toBe("walk");

    snapshot = game.step([
      input({ held: ["right", "up"], direction: { x: Math.SQRT1_2, y: Math.SQRT1_2 }, analog: true }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].state).toBe("run");

    const reverseStates: string[] = [];
    for (let frame = 0; frame < 7; frame += 1) {
      snapshot = game.step([
        input({ held: ["left"], direction: { x: -0.65, y: 0 }, analog: true }),
        createEmptyInput(),
      ]);
      reverseStates.push(snapshot.fighters[0].state);
    }
    expect(reverseStates).not.toContain("walk");
    expect(reverseStates).toContain("run");
  });

  it("crouches on the ground and drops through a small platform with down alone", () => {
    const groundGame = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 300, y: 52 }],
    });
    settle(groundGame);
    let snapshot = groundGame.step([
      input({ held: ["down"], pressed: ["down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].state).toBe("crouch");
    expect(groundGame.step(idlePair()).fighters[0].state).toBe("idle");

    const platform = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 260 }, { x: 300, y: 52 }],
    });
    settle(platform, 45);
    expect(platform.getSnapshot().fighters[0].grounded).toBe(true);
    snapshot = platform.step([
      input({ held: ["down"], pressed: ["down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0]).toMatchObject({ grounded: false, state: "fall" });
    expect(snapshot.events.some(({ type }) => type === "jump")).toBe(false);
  });

  it("also drops through a platform from shield without triggering a dodge", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 260 }, { x: 300, y: 52 }],
    });
    settle(game, 45);
    expect(game.getSnapshot().fighters[0].grounded).toBe(true);

    let snapshot = game.step([
      input({ held: ["shield"], pressed: ["shield"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].state).toBe("shield");

    snapshot = game.step([
      input({
        held: ["shield", "down"],
        pressed: ["down"],
        direction: { x: 0, y: -1 },
      }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0]).toMatchObject({ grounded: false, state: "fall" });
    expect(snapshot.fighters[0].dodgeKind).toBeNull();
  });

  it("passes through a platform by holding down before reaching it in the air", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 300, y: 52 }],
    });
    settle(game);
    const snapshotBefore = game.getSnapshot();
    const platform = snapshotBefore.stage.platforms.find(
      ({ kind }) => kind === "platform",
    )!;
    const fighterBefore = snapshotBefore.fighters[0];
    const top = stageSurfaceYAt(platform, platform.position.x);
    const runtime = (game as unknown as {
      fighters: [
        {
          position: { x: number; y: number };
          previousPosition: { x: number; y: number };
          velocity: { x: number; y: number };
          grounded: boolean;
          supportPlatform: string | null;
          state: string;
          dropThroughFrames: number;
        },
        unknown,
      ];
    }).fighters[0];
    runtime.position = {
      x: platform.position.x,
      y: top + fighterBefore.size.height / 2 + 2,
    };
    runtime.previousPosition = { ...runtime.position };
    runtime.velocity = { x: 0, y: -300 };
    runtime.grounded = false;
    runtime.supportPlatform = null;
    runtime.state = "fall";
    runtime.dropThroughFrames = 0;

    const snapshot = game.step([
      input({ held: ["down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].grounded).toBe(false);
    expect(snapshot.fighters[0].position.y - fighterBefore.size.height / 2).toBeLessThan(top);
  });

  it("consumes a ground jump and then the double jump", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [
        { x: -180, y: 52 },
        { x: 180, y: 52 },
      ],
    });
    settle(game);
    expect(game.getSnapshot().fighters[0].grounded).toBe(true);

    let snapshot = game.step([input({ held: ["jump"], pressed: ["jump"] }), createEmptyInput()]);
    expect(snapshot.fighters[0].state).toBe("jump-squat");
    expect(snapshot.fighters[0].velocity.y).toBe(0);
    for (let frame = 0; frame < 7 && snapshot.fighters[0].grounded; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].velocity.y).toBeGreaterThan(0);
    expect(snapshot.fighters[0].jumpsRemaining).toBe(1);
    expect(snapshot.events.some((event) => event.type === "jump" && event.slot === 0)).toBe(true);

    game.step(idlePair());
    snapshot = game.step([input({ held: ["jump"], pressed: ["jump"] }), createEmptyInput()]);
    expect(snapshot.fighters[0].jumpsRemaining).toBe(0);
    expect(snapshot.fighters[0].velocity.y).toBeGreaterThan(0);
    for (let frame = 0; frame < 50 && snapshot.fighters[0].velocity.y >= 0; frame += 1) {
      snapshot = game.step(idlePair());
    }
    snapshot = game.step([
      input({ held: ["down"], pressed: ["down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].fastFalling).toBe(true);
    expect(snapshot.fighters[0].velocity.y).toBeLessThan(-600);
  });

  it("gets even the slowest character airborne within four frames", () => {
    const game = createGame(config("bowser", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -220, y: 52 }, { x: 280, y: 52 }],
    });
    settle(game);
    let snapshot = game.step([
      input({ held: ["jump"], pressed: ["jump"] }),
      createEmptyInput(),
    ]);
    let squatFrames = 0;
    while (snapshot.fighters[0].grounded && squatFrames < 10) {
      snapshot = game.step(idlePair());
      squatFrames += 1;
    }

    expect(MAX_RESPONSIVE_JUMP_SQUAT_FRAMES).toBe(4);
    expect(getFighterDefinition("bowser").jumpSquatFrames).toBeGreaterThan(4);
    expect(squatFrames).toBeLessThanOrEqual(MAX_RESPONSIVE_JUMP_SQUAT_FRAMES);
    expect(snapshot.fighters[0].velocity.y).toBeGreaterThan(0);
  });

  it("buffers jump six frames before recovery ends", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -220, y: 52 }, { x: 280, y: 52 }],
    });
    settle(game);
    const internals = game as unknown as {
      fighters: [{ landingLagFrames: number }, { landingLagFrames: number }];
    };
    internals.fighters[0].landingLagFrames = 5;

    game.step([input({ held: ["jump"], pressed: ["jump"] }), createEmptyInput()]);
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 5; frame += 1) snapshot = game.step(idlePair());

    expect(JUMP_INPUT_BUFFER_FRAMES).toBe(6);
    expect(snapshot.fighters[0].state).toBe("jump-squat");
  });

  it("also buffers shield so it comes out as soon as a short recovery ends", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -220, y: 52 }, { x: 280, y: 52 }],
    });
    settle(game);
    const internals = game as unknown as {
      fighters: [{ landingLagFrames: number }, { landingLagFrames: number }];
    };
    internals.fighters[0].landingLagFrames = 4;

    game.step([input({ held: ["shield"], pressed: ["shield"] }), createEmptyInput()]);
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 4; frame += 1) snapshot = game.step(idlePair());

    expect(SHIELD_INPUT_BUFFER_FRAMES).toBe(5);
    expect(snapshot.fighters[0].state).toBe("shield");
  });

  it("maintains Peach's aerial float, then restores gravity on release", () => {
    const peach = createGame(config("peach", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -220, y: 320 }, { x: 420, y: 80 }],
    });
    const mario = createGame(config("mario", "link"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -220, y: 320 }, { x: 420, y: 80 }],
    });
    const floatInput = input({ held: ["jump"] });
    const peachStartY = peach.getSnapshot().fighters[0].position.y;
    const marioStartY = mario.getSnapshot().fighters[0].position.y;
    let peachSnapshot = peach.getSnapshot();
    let marioSnapshot = mario.getSnapshot();
    for (let frame = 0; frame < 60; frame += 1) {
      peachSnapshot = peach.step([floatInput, createEmptyInput()]);
      marioSnapshot = mario.step([floatInput, createEmptyInput()]);
    }
    expect(Math.abs(peachSnapshot.fighters[0].position.y - peachStartY)).toBeLessThan(3);
    expect(marioSnapshot.fighters[0].position.y).toBeLessThan(marioStartY - 100);

    for (let frame = 0; frame < 12; frame += 1) peachSnapshot = peach.step(idlePair());
    expect(peachSnapshot.fighters[0].position.y).toBeLessThan(peachStartY - 15);
    expect(peachSnapshot.fighters[0].velocity.y).toBeLessThan(0);
  });

  it("preserves run momentum during the fighter-specific jumpsquat", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 52 }, { x: 320, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 10; frame += 1) {
      game.step([input({ held: ["right"], direction: { x: 1, y: 0 } }), createEmptyInput()]);
    }
    const runSpeed = game.getSnapshot().fighters[0].velocity.x;
    game.step([
      input({ held: ["right", "jump"], pressed: ["jump"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 7 && snapshot.fighters[0].grounded; frame += 1) {
      snapshot = game.step([
        input({ held: ["right", "jump"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
    }
    expect(snapshot.fighters[0].grounded).toBe(false);
    expect(snapshot.fighters[0].velocity.x).toBeGreaterThanOrEqual(runSpeed * 0.78);
  });

  it("produces a Melee short hop when jump is released during jumpsquat", () => {
    const hopRise = (holdJump: boolean): number => {
      const game = createGame(config(), {
        countdownFrames: 0,
        spawnPositions: [{ x: -500, y: 52 }, { x: 500, y: 52 }],
      });
      settle(game);
      const startY = game.getSnapshot().fighters[0].position.y;
      let snapshot = game.step([
        input({ held: ["jump"], pressed: ["jump"] }),
        createEmptyInput(),
      ]);
      let apex = startY;
      for (let frame = 0; frame < 80; frame += 1) {
        snapshot = game.step([
          holdJump ? input({ held: ["jump"] }) : createEmptyInput(),
          createEmptyInput(),
        ]);
        apex = Math.max(apex, snapshot.fighters[0].position.y);
        if (!snapshot.fighters[0].grounded && snapshot.fighters[0].velocity.y <= 0) break;
      }
      return apex - startY;
    };

    const fullHop = hopRise(true);
    const shortHop = hopRise(false);
    expect(fullHop).toBeGreaterThan(140);
    expect(shortHop / fullHop).toBeCloseTo(0.38, 1);
  });

  it.each(FIGHTER_IDS)(
    "%s actually reaches a Battlefield side platform with a full hop",
    (fighterId) => {
      const definition = getStageDefinition(DEFAULT_STAGE_ID);
      const main = definition.platforms.find(({ id }) => id === "main")!;
      const side = definition.platforms.find(({ id }) => id === "left")!;
      const fighter = getFighterDefinition(fighterId);
      const mainY = stageSurfaceYAt(main, side.x);
      const sideY = stageSurfaceYAt(side, side.x);
      const game = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [
          { x: side.x, y: mainY + fighter.size.height / 2 + 2 },
          { x: 500, y: mainY + getFighterDefinition("link").size.height / 2 + 2 },
        ],
      });
      settle(game);
      let snapshot: GameSnapshot = game.step([
        input({ held: ["jump"], pressed: ["jump"] }),
        createEmptyInput(),
      ]);
      let becameAirborne = false;
      for (let frame = 0; frame < 180; frame += 1) {
        snapshot = game.step([
          frame < 8 ? input({ held: ["jump"] }) : createEmptyInput(),
          createEmptyInput(),
        ]);
        becameAirborne ||= !snapshot.fighters[0].grounded;
        if (becameAirborne && snapshot.fighters[0].grounded) break;
      }

      expect(MIN_FULL_HOP_RISE).toBe(185);
      expect(snapshot.fighters[0].grounded).toBe(true);
      expect(snapshot.fighters[0].position.y).toBeCloseTo(
        sideY + fighter.size.height / 2,
        4,
      );
    },
  );

  it.each(FIGHTER_IDS)(
    "%s actually reaches the top platform with a full hop and double jump",
    (fighterId) => {
      const definition = getStageDefinition(DEFAULT_STAGE_ID);
      const main = definition.platforms.find(({ id }) => id === "main")!;
      const top = definition.platforms.find(({ id }) => id === "top")!;
      const fighter = getFighterDefinition(fighterId);
      const mainY = stageSurfaceYAt(main, top.x);
      const topY = stageSurfaceYAt(top, top.x);
      const game = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [
          { x: top.x, y: mainY + fighter.size.height / 2 + 2 },
          { x: 500, y: mainY + getFighterDefinition("link").size.height / 2 + 2 },
        ],
      });
      settle(game);
      let snapshot: GameSnapshot = game.step([
        input({ held: ["jump"], pressed: ["jump"] }),
        createEmptyInput(),
      ]);
      let doubleJumped = false;
      let becameAirborne = false;
      for (let frame = 0; frame < 260; frame += 1) {
        const shouldDoubleJump: boolean =
          becameAirborne && !doubleJumped && snapshot.fighters[0].velocity.y <= 0;
        snapshot = game.step([
          shouldDoubleJump
            ? input({ held: ["jump"], pressed: ["jump"] })
            : frame < 8
              ? input({ held: ["jump"] })
              : createEmptyInput(),
          createEmptyInput(),
        ]);
        becameAirborne ||= !snapshot.fighters[0].grounded;
        doubleJumped ||= shouldDoubleJump;
        if (doubleJumped && snapshot.fighters[0].grounded) break;
      }

      expect(MIN_DOUBLE_JUMP_RISE).toBe(165);
      expect(doubleJumped).toBe(true);
      expect(snapshot.fighters[0].grounded).toBe(true);
      expect(snapshot.fighters[0].position.y).toBeCloseTo(
        topY + fighter.size.height / 2,
        4,
      );
    },
  );

  it("the accessibility floor preserves already sufficient large impulses", () => {
    const luigi = getFighterDefinition("luigi");
    const bowser = getFighterDefinition("bowser");
    expect(jumpSpeedForMinimumRise(
      luigi.jumpSpeed,
      luigi.gravity,
      MIN_FULL_HOP_RISE,
    )).toBe(luigi.jumpSpeed);
    expect(jumpSpeedForMinimumRise(
      bowser.jumpSpeed,
      bowser.gravity,
      MIN_FULL_HOP_RISE,
    )).toBeGreaterThan(bowser.jumpSpeed);
  });

  it("still accepts a jump tap released just after takeoff", () => {
    const hopRise = (releaseAfterAirborneFrames: number | null): number => {
      const game = createGame(config(), {
        countdownFrames: 0,
        spawnPositions: [{ x: -500, y: 52 }, { x: 500, y: 52 }],
      });
      settle(game);
      const startY = game.getSnapshot().fighters[0].position.y;
      let snapshot = game.step([
        input({ held: ["jump"], pressed: ["jump"] }),
        createEmptyInput(),
      ]);
      let airborneFrames = 0;
      let apex = startY;
      for (let frame = 0; frame < 80; frame += 1) {
        const keepHolding =
          releaseAfterAirborneFrames === null ||
          airborneFrames < releaseAfterAirborneFrames;
        snapshot = game.step([
          keepHolding ? input({ held: ["jump"] }) : createEmptyInput(),
          createEmptyInput(),
        ]);
        if (!snapshot.fighters[0].grounded) airborneFrames += 1;
        apex = Math.max(apex, snapshot.fighters[0].position.y);
        if (!snapshot.fighters[0].grounded && snapshot.fighters[0].velocity.y <= 0) break;
      }
      return apex - startY;
    };

    const fullHop = hopRise(null);
    const delayedTap = hopRise(2);
    const releaseAfterGrace = hopRise(SHORT_HOP_RELEASE_GRACE_FRAMES + 1);

    expect(SHORT_HOP_RELEASE_GRACE_FRAMES).toBe(4);
    expect(delayedTap).toBeLessThan(fullHop * 0.65);
    expect(releaseAfterGrace).toBeCloseTo(fullHop, 5);
  });

  it("turns a diagonal air dodge into a wavedash on landing", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 52 }, { x: 320, y: 52 }],
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
    expect(snapshot.events.some(({ type, wavedash }) => type === "land" && wavedash)).toBe(true);
    expect(snapshot.fighters[0].grounded).toBe(true);
    expect(snapshot.fighters[0].velocity.x).toBeGreaterThan(300);
    expect(snapshot.fighters[0].state).toBe("crouch");
  });

  it("bounds the fastest character's air dodge to a short burst", () => {
    const game = createGame(config("captain-falcon", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 600 }, { x: 420, y: 52 }],
    });
    const startX = game.getSnapshot().fighters[0].position.x;
    let snapshot = game.step([
      input({
        held: ["right", "shield"],
        pressed: ["right", "shield"],
        direction: { x: 1, y: 0 },
      }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].dodgeKind).toBe("air");

    for (let frame = 0; frame < 60 && snapshot.fighters[0].dodgeKind === "air"; frame += 1) {
      snapshot = game.step(idlePair());
    }
    const distance = snapshot.fighters[0].position.x - startX;

    expect(AIR_DODGE_VELOCITY_RETENTION).toBe(0.86);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(280);
    expect(snapshot.fighters[0].stocks).toBe(3);
  });

  it("buffers an input and its direction during move recovery", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 52 }, { x: 300, y: 52 }],
    });
    settle(game);
    game.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
    for (let frame = 0; frame < 11; frame += 1) game.step(idlePair());
    game.step([
      input({
        held: ["up", "special"],
        pressed: ["up", "special"],
        direction: { x: 0, y: 1 },
      }),
      createEmptyInput(),
    ]);

    const events: GameEvent[] = [];
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 12 && snapshot.fighters[0].currentMove !== "up-special"; frame += 1) {
      snapshot = game.step(idlePair());
      events.push(...snapshot.events);
    }
    expect(snapshot.fighters[0].currentMove).toBe("up-special");
    expect(events.some(({ type, move }) => type === "attack" && move === "up-special")).toBe(true);
  });

  it.each(["pikachu", "pichu"] as const)(
    "%s executes both steerable segments of Quick Attack",
    (fighterId) => {
      const game = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [{ x: -260, y: 340 }, { x: 360, y: 80 }],
      });
      const start = game.getSnapshot().fighters[0].position;

      game.step([
        input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
        createEmptyInput(),
      ]);
      game.step([input({ held: ["right"], direction: { x: 1, y: 0 } }), createEmptyInput()]);
      let snapshot = game.step([input({ held: ["right"], direction: { x: 1, y: 0 } }), createEmptyInput()]);
      expect(snapshot.fighters[0].velocity.x).toBeGreaterThan(850);
      expect(Math.abs(snapshot.fighters[0].velocity.y)).toBeLessThan(80);

      const afterFirstBurst = { ...snapshot.fighters[0].position };
      for (let frame = 0; frame < 8; frame += 1) {
        snapshot = game.step([
          input({ held: ["left", "down"], direction: { x: -0.7, y: -0.7 } }),
          createEmptyInput(),
        ]);
      }
      expect(snapshot.fighters[0].velocity.x).toBeLessThan(-550);
      expect(snapshot.fighters[0].velocity.y).toBeLessThan(-550);
      expect(afterFirstBurst.x).toBeGreaterThan(start.x);
      expect(snapshot.fighters[0].specialPhase).toBe("active");
    },
  );

  it.each(["pikachu", "pichu"] as const)(
    "%s triggers the Tonnerre discharge when the lightning reaches it",
    (fighterId) => {
      const game = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [{ x: -260, y: 260 }, { x: 500, y: 80 }],
      });
      game.step([
        input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
        createEmptyInput(),
      ]);

      let sawThunder = false;
      let dischargeEvents = 0;
      let snapshot = game.getSnapshot();
      for (let frame = 0; frame < 70; frame += 1) {
        snapshot = game.step(idlePair());
        sawThunder ||= snapshot.projectiles.some(({ kind }) => kind === "thunder");
        dischargeEvents += snapshot.events.filter(
          ({ type, move }) => type === "attack-active" && move === "down-special",
        ).length;
      }
      expect(sawThunder).toBe(true);
      expect(snapshot.projectiles.some(({ kind }) => kind === "thunder")).toBe(false);
      expect(dischargeEvents).toBeGreaterThanOrEqual(2);
    },
  );

  it("lets Pikachu's lightning pass through the top platform to its owner", () => {
    const game = createGame(config("pikachu"), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 500, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);

    let sawThunderAbovePlatform = false;
    let dischargeEvents = 0;
    for (let frame = 0; frame < 80; frame += 1) {
      const snapshot = game.step(idlePair());
      const platform = snapshot.stage.platforms.find(({ kind }) => kind === "platform")!;
      const top = stageSurfaceYAt(platform, 0);
      sawThunderAbovePlatform ||= snapshot.projectiles.some(
        ({ kind, position }) => kind === "thunder" && position.y > top,
      );
      dischargeEvents += snapshot.events.filter(
        ({ type, move }) => type === "attack-active" && move === "down-special",
      ).length;
    }
    expect(sawThunderAbovePlatform).toBe(true);
    expect(dischargeEvents).toBeGreaterThanOrEqual(2);
  });

  it("makes Bowser jump before the dive of his Bombe Bowser", () => {
    const game = createGame(config("bowser"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 100 }, { x: 360, y: 80 }],
    });
    settle(game);
    const groundY = game.getSnapshot().fighters[0].position.y;
    game.step([
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);

    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 20 && snapshot.fighters[0].velocity.y <= 0; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].velocity.y).toBeGreaterThan(500);
    for (let frame = 0; frame < 8; frame += 1) snapshot = game.step(idlePair());
    expect(snapshot.fighters[0].position.y).toBeGreaterThan(groundY + 45);

    for (let frame = 0; frame < 20 && snapshot.fighters[0].velocity.y > -800; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].velocity.y).toBeLessThan(-800);
  });

  it.each(["bowser", "donkey-kong", "link", "young-link", "yoshi"] as const)(
    "%s distinguishes its grounded up special from its aerial recovery",
    (fighterId) => {
      const groundSpawnY = getFighterDefinition(fighterId).size.height / 2 + 2;
      const groundedGame = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [{ x: 0, y: groundSpawnY }, { x: 620, y: 52 }],
      });
      settle(groundedGame);
      const groundedStart = groundedGame.getSnapshot().fighters[0].position;
      let grounded = groundedGame.step([
        input({ held: ["right", "up", "special"], pressed: ["up", "special"], direction: { x: 0.55, y: 0.84 } }),
        createEmptyInput(),
      ]);
      for (let frame = 0; frame < 22; frame += 1) {
        grounded = groundedGame.step([
          input({ held: ["right", "up"], direction: { x: 0.55, y: 0.84 } }),
          createEmptyInput(),
        ]);
      }
      expect(grounded.fighters[0].grounded).toBe(true);
      expect(Math.abs(grounded.fighters[0].position.y - groundedStart.y)).toBeLessThan(2);
      expect(grounded.fighters[0].position.x).toBeGreaterThan(groundedStart.x + 8);

      const aerialGame = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [{ x: -620, y: 500 }, { x: 620, y: 52 }],
      });
      const aerialStart = aerialGame.getSnapshot().fighters[0].position;
      let aerial = aerialGame.step([
        input({ held: ["right", "up", "special"], pressed: ["up", "special"], direction: { x: 0.55, y: 0.84 } }),
        createEmptyInput(),
      ]);
      let trough = aerialStart.y;
      let recoveryGain = 0;
      let maximumRiseSpeed = aerial.fighters[0].velocity.y;
      for (let frame = 0; frame < 30; frame += 1) {
        aerial = aerialGame.step([
          input({ held: ["right", "up"], direction: { x: 0.55, y: 0.84 } }),
          createEmptyInput(),
        ]);
        trough = Math.min(trough, aerial.fighters[0].position.y);
        recoveryGain = Math.max(recoveryGain, aerial.fighters[0].position.y - trough);
        maximumRiseSpeed = Math.max(maximumRiseSpeed, aerial.fighters[0].velocity.y);
      }
      expect(maximumRiseSpeed).toBeGreaterThan(200);
      const minimumRise = fighterId === "yoshi"
        ? 10
        : fighterId === "bowser" || fighterId === "donkey-kong"
          ? 70
          : 120;
      expect(recoveryGain).toBeGreaterThan(minimumRise);
      expect(aerial.fighters[0].position.x).toBeGreaterThan(aerialStart.x + 8);
    },
  );

  it.each([
    "kaykit-knight",
    "george",
    "platformer",
    "wolf",
    "cactus",
    "yeti",
    "quaternius-hero",
    "rgs-stick",
    "dark-knight-2d",
    "knight-hero",
    "kenney-toon",
    "rgs-character-prototype",
    "hormelz-melee",
    "hormelz-knight",
  ] as const)("%s preserves a real ascent during its up special", (fighterId) => {
    const game = createGame(config(fighterId), {
      countdownFrames: 0,
      spawnPositions: [{ x: -400, y: 430 }, { x: 500, y: 52 }],
    });
    const startY = game.getSnapshot().fighters[0].position.y;
    let snapshot = game.step([
      input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
      createEmptyInput(),
    ]);
    let apex = startY;
    for (let frame = 0; frame < 80 && snapshot.fighters[0].currentMove; frame += 1) {
      snapshot = game.step([
        input({ held: ["up"], direction: { x: 0, y: 1 } }),
        createEmptyInput(),
      ]);
      apex = Math.max(apex, snapshot.fighters[0].position.y);
    }
    expect(apex - startY).toBeGreaterThan(80);
  });

  it.each(["falco", "fox", "zelda", "sheik", "mewtwo"] as const)(
    "%s maintains its directional launch long enough to recover",
    (fighterId) => {
      const game = createGame(config(fighterId), {
        countdownFrames: 0,
        spawnPositions: [{ x: -400, y: 430 }, { x: 500, y: 52 }],
      });
      const startY = game.getSnapshot().fighters[0].position.y;
      let snapshot = game.step([
        input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
        createEmptyInput(),
      ]);
      let apex = startY;
      for (let frame = 0; frame < 80 && snapshot.fighters[0].currentMove; frame += 1) {
        snapshot = game.step([
          input({ held: ["up"], direction: { x: 0, y: 1 } }),
          createEmptyInput(),
        ]);
        apex = Math.max(apex, snapshot.fighters[0].position.y);
      }
      expect(DIRECTIONAL_LAUNCH_SUSTAIN_FRAMES).toBe(14);
      expect(apex - startY).toBeGreaterThan(100);
    },
  );

  it.each(["captain-falcon", "ganondorf"] as const)(
    "%s distinguishes the grounded horizontal kick from the aerial dive",
    (fighter) => {
      const grounded = createGame(config(fighter), {
        countdownFrames: 0,
        spawnPositions: [{ x: -280, y: 110 }, { x: 450, y: 100 }],
      });
      settle(grounded);
      grounded.step([
        input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
        createEmptyInput(),
      ]);
      let groundedSnapshot = grounded.getSnapshot();
      for (let frame = 0; frame < 22 && groundedSnapshot.fighters[0].velocity.x < 500; frame += 1) {
        groundedSnapshot = grounded.step(idlePair());
      }
      expect(groundedSnapshot.fighters[0].velocity.x).toBeGreaterThan(500);
      expect(groundedSnapshot.fighters[0].grounded).toBe(true);
      expect(Math.abs(groundedSnapshot.fighters[0].velocity.y)).toBeLessThan(1);

      const airborne = createGame(config(fighter), {
        countdownFrames: 0,
        spawnPositions: [{ x: -700, y: 400 }, { x: 450, y: 100 }],
      });
      expect(airborne.getSnapshot().fighters[0].grounded).toBe(false);
      airborne.step([
        input({ held: ["right", "down", "special"], pressed: ["right", "down", "special"], direction: { x: 0.7, y: -0.7 } }),
        createEmptyInput(),
      ]);
      let airborneSnapshot = airborne.getSnapshot();
      for (let frame = 0; frame < 30 && airborneSnapshot.fighters[0].velocity.x < 450; frame += 1) {
        airborneSnapshot = airborne.step(idlePair());
      }
      expect(airborneSnapshot.fighters[0].velocity.x).toBeGreaterThan(450);
      expect(airborneSnapshot.fighters[0].velocity.y).toBeLessThan(-550);
      expect(airborneSnapshot.fighters[0].grounded).toBe(false);
    },
  );

  it("allows Yoshi's Egg Roll to reverse during the same attack", () => {
    const game = createGame(config("yoshi"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 100 }, { x: 450, y: 100 }],
    });
    settle(game);
    game.step([
      input({ held: ["right", "special"], pressed: ["right", "special"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);

    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 20 && snapshot.fighters[0].velocity.x < 500; frame += 1) {
      snapshot = game.step([
        input({ held: ["right"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
    }
    expect(snapshot.fighters[0].velocity.x).toBeGreaterThan(500);

    snapshot = game.step([
      input({ held: ["left"], pressed: ["left"], direction: { x: -1, y: 0 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBe("side-special");
    expect(snapshot.fighters[0].velocity.x).toBeLessThan(-500);
  });

  it.each([
    {
      fighter: "ness" as const,
      move: "neutral-special" as const,
      kind: "pk-flash" as const,
      startHeld: ["special"] as ActionName[],
      startDirection: { x: 0, y: 0 },
    },
    {
      fighter: "zelda" as const,
      move: "side-special" as const,
      kind: "din-fire" as const,
      startHeld: ["right", "special"] as ActionName[],
      startDirection: { x: 1, y: 0 },
    },
  ])(
    "$fighter steers $move while charging and detonates it on release",
    ({ fighter, move, kind, startHeld, startDirection }) => {
      const game = createGame(config(fighter), {
        countdownFrames: 0,
        spawnPositions: [{ x: -280, y: 180 }, { x: 460, y: 100 }],
      });
      game.step([
        input({ held: startHeld, pressed: startHeld, direction: startDirection }),
        createEmptyInput(),
      ]);
      const initial = game.getSnapshot().projectiles.find((projectile) => projectile.kind === kind);
      expect(initial).toBeDefined();

      let snapshot = game.getSnapshot();
      for (let frame = 0; frame < 8; frame += 1) {
        snapshot = game.step([
          input({ held: ["up", "special"], direction: { x: 0, y: 1 } }),
          createEmptyInput(),
        ]);
      }
      const steered = snapshot.projectiles.find((projectile) => projectile.kind === kind);
      expect(steered?.position.y).toBeGreaterThan((initial?.position.y ?? 0) + 20);

      const released = game.step(idlePair());
      expect(released.events.some(({ type, slot, move: eventMove }) =>
        type === "attack-active" && slot === 0 && eventMove === move,
      )).toBe(true);
      expect(released.projectiles.some((projectile) => projectile.kind === kind)).toBe(false);
    },
  );

  it("aims Fire Fox in the direction held when triggered", () => {
    const game = createGame(config("fox"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 180 }, { x: 360, y: 80 }],
    });
    game.step([
      input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
      createEmptyInput(),
    ]);
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 18 && snapshot.fighters[0].velocity.x < 500; frame += 1) {
      snapshot = game.step([
        input({ held: ["right", "up"], direction: { x: 0.8, y: 0.6 } }),
        createEmptyInput(),
      ]);
    }
    expect(snapshot.fighters[0].velocity.x).toBeGreaterThan(600);
    expect(snapshot.fighters[0].velocity.y).toBeGreaterThan(350);
    expect(snapshot.fighters[0].visualRotation).toBeCloseTo(-Math.atan2(0.6, 0.8), 4);
  });

  it("reinjects the official root trajectory of Super Jump Punch", () => {
    const game = createGame(config("mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -320, y: 52 }, { x: 420, y: 52 }],
    });
    settle(game);
    const start = game.getSnapshot().fighters[0].position;
    let snapshot = game.step([
      input({ held: ["right", "up", "special"], pressed: ["up", "special"], direction: { x: 0.35, y: 0.94 } }),
      createEmptyInput(),
    ]);
    let apex = start.y;
    const verticalVelocities = new Set<number>();
    for (let frame = 0; frame < 55 && snapshot.fighters[0].currentMove; frame += 1) {
      snapshot = game.step([
        input({ held: ["right", "up"], direction: { x: 0.35, y: 0.94 } }),
        createEmptyInput(),
      ]);
      apex = Math.max(apex, snapshot.fighters[0].position.y);
      verticalVelocities.add(Math.round(snapshot.fighters[0].velocity.y));
    }

    expect(apex - start.y).toBeGreaterThan(180);
    expect(snapshot.fighters[0].position.x - start.x).toBeGreaterThan(65);
    expect(verticalVelocities.size).toBeGreaterThan(12);
  });

  it("applies the Ultimate aerial multiplier to Mario's recovery", () => {
    const game = createGame(config("mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -760, y: -250 }, { x: 420, y: 52 }],
    });
    const start = game.getSnapshot().fighters[0].position;
    let snapshot = game.step([
      input({
        held: ["right", "up", "special"],
        pressed: ["up", "special"],
        direction: { x: 0.25, y: 0.97 },
      }),
      createEmptyInput(),
    ]);
    let apex = start.y;
    for (let frame = 0; frame < 55 && snapshot.fighters[0].currentMove; frame += 1) {
      snapshot = game.step([
        input({ held: ["right", "up"], direction: { x: 0.25, y: 0.97 } }),
        createEmptyInput(),
      ]);
      apex = Math.max(apex, snapshot.fighters[0].position.y);
    }

    expect(apex - start.y).toBeGreaterThan(270);
  });

  it("lets the player steer Ness's PK Thunder directly", () => {
    const game = createGame(config("ness"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 220 }, { x: 420, y: 80 }],
    });
    game.step([
      input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
      createEmptyInput(),
    ]);

    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 20 && snapshot.projectiles.length === 0; frame += 1) {
      snapshot = game.step([
        input({ held: ["up"], direction: { x: 0, y: 1 } }),
        createEmptyInput(),
      ]);
    }
    expect(snapshot.projectiles).toHaveLength(1);

    snapshot = game.step([
      input({ held: ["left"], direction: { x: -1, y: 0 } }),
      createEmptyInput(),
    ]);
    const steeredProjectile = snapshot.projectiles[0]!;
    expect(steeredProjectile.velocity.x).toBeLessThan(-600);
    expect(Math.abs(steeredProjectile.velocity.y)).toBeLessThan(1);
    expect(Math.abs(snapshot.fighters[0].velocity.x)).toBeLessThan(350);
  });

  it("triggers PK Thunder 2 when the projectile returns and hits Ness", () => {
    const game = createGame(config("ness"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 260 }, { x: 500, y: 80 }],
    });
    game.step([
      input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
      createEmptyInput(),
    ]);

    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 20 && snapshot.projectiles.length === 0; frame += 1) {
      snapshot = game.step([
        input({ held: ["right"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
    }
    expect(snapshot.projectiles).toHaveLength(1);

    for (let frame = 0; frame < 8; frame += 1) {
      snapshot = game.step([
        input({ held: ["right"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
    }
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 24 && snapshot.projectiles.length > 0; frame += 1) {
      const projectile = snapshot.projectiles[0]!;
      const ness = snapshot.fighters[0];
      const dx = ness.position.x - projectile.position.x;
      const dy = ness.position.y - projectile.position.y;
      const magnitude = Math.max(1, Math.hypot(dx, dy));
      snapshot = game.step([
        input({ direction: { x: dx / magnitude, y: dy / magnitude } }),
        createEmptyInput(),
      ]);
      events.push(...snapshot.events);
    }

    expect(snapshot.projectiles).toHaveLength(0);
    expect(Math.hypot(snapshot.fighters[0].velocity.x, snapshot.fighters[0].velocity.y)).toBeGreaterThan(850);
    expect(events.some(({ type, move }) => type === "attack-active" && move === "up-special")).toBe(true);
  });

  it("applies the electric recoil specific to Pichu's four special moves", () => {
    const moves = [
      { held: ["special"] as ActionName[], direction: { x: 0, y: 0 }, damage: 0.7 },
      { held: ["right", "special"] as ActionName[], direction: { x: 1, y: 0 }, damage: 1.5 },
      { held: ["up", "special"] as ActionName[], direction: { x: 0, y: 1 }, damage: 1 },
      { held: ["down", "special"] as ActionName[], direction: { x: 0, y: -1 }, damage: 3.5 },
    ];
    for (const move of moves) {
      const game = createGame(config("pichu"), {
        countdownFrames: 0,
        spawnPositions: [{ x: -260, y: 240 }, { x: 360, y: 80 }],
      });
      game.step([
        input({ held: move.held, pressed: move.held, direction: move.direction }),
        createEmptyInput(),
      ]);
      let snapshot = game.getSnapshot();
      for (let frame = 0; frame < 70 && snapshot.fighters[0].percent === 0; frame += 1) {
        snapshot = game.step([
          input({ held: move.held, direction: move.direction }),
          createEmptyInput(),
        ]);
      }
      expect(snapshot.fighters[0].percent).toBeCloseTo(move.damage, 5);
    }
  });

  it.each([
    { fighter: "mario", held: ["down", "special"] as ActionName[], direction: { x: 0, y: -1 } },
    { fighter: "donkey-kong", held: ["special"] as ActionName[], direction: { x: 0, y: 0 } },
    { fighter: "samus", held: ["special"] as ActionName[], direction: { x: 0, y: 0 } },
    { fighter: "sheik", held: ["special"] as ActionName[], direction: { x: 0, y: 0 } },
    { fighter: "mewtwo", held: ["special"] as ActionName[], direction: { x: 0, y: 0 } },
  ] as const)("preserves $fighter's stored charge after a shield cancel", ({ fighter, held, direction }) => {
    const game = createGame(config(fighter), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 100 }, { x: 420, y: 100 }],
    });
    settle(game);
    game.step([
      input({ held: [...held], pressed: [...held], direction }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 20; frame += 1) {
      game.step([input({ held: [...held], direction }), createEmptyInput()]);
    }
    game.step([
      input({ held: ["shield"], pressed: ["shield"] }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 3; frame += 1) game.step(idlePair());

    const snapshot = game.step([
      input({ pressed: [...held], direction }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBe(
      direction.y < -0.5 ? "down-special" : "neutral-special",
    );
    expect(snapshot.fighters[0].charge).toBeGreaterThan(0.15);
  });

  it("limits true size scaling to projectiles that support it", () => {
    expect(getFighterDefinition("samus").attacks["neutral-special"]).toMatchObject({
      damage: 25,
      maxChargeFrames: 125,
      storesCharge: true,
      projectile: {
        kind: "charge-shot",
        storedChargeScaling: { minimumDamage: 3, minimumRadius: 8 },
      },
    });
    expect(getFighterDefinition("mewtwo").attacks["neutral-special"]).toMatchObject({
      damage: 25,
      maxChargeFrames: 100,
      storesCharge: true,
      projectile: {
        kind: "shadow-ball",
        storedChargeScaling: { minimumDamage: 3, minimumRadius: 9 },
      },
    });
    expect(
      getFighterDefinition("sheik").attacks["neutral-special"].projectile?.storedChargeScaling,
    ).toBeUndefined();
    expect(
      getFighterDefinition("link").attacks["neutral-special"].projectile?.storedChargeScaling,
    ).toBeUndefined();
  });

  it.each([
    { fighter: "samus", maximum: 125, minimumRadius: 8, maximumRadius: 27 },
    { fighter: "mewtwo", maximum: 100, minimumRadius: 9, maximumRadius: 28 },
  ] as const)(
    "$fighter fires a weak small charge or a large stored charge",
    ({ fighter, maximum, minimumRadius, maximumRadius }) => {
      const fireAtCharge = (chargeFrames: number): { radius: number; damage: number } => {
        const game = createGame(config(fighter, "mario"), {
          countdownFrames: 0,
          spawnPositions: [{ x: -420, y: 52 }, { x: 420, y: 52 }],
        });
        settle(game);
        const internals = game as unknown as {
          fighters: [{ storedCharges: Partial<Record<MoveName, number>> }, unknown];
          projectiles: Array<{ radius: number; powerScale: number }>;
        };
        game.step([
          input({
            held: chargeFrames > 0 ? ["special"] : [],
            pressed: ["special"],
          }),
          createEmptyInput(),
        ]);
        for (let frame = 0; frame < chargeFrames; frame += 1) {
          game.step([input({ held: ["special"] }), createEmptyInput()]);
        }
        if (chargeFrames === maximum) {
          const stored = game.step([input({ held: ["special"] }), createEmptyInput()]);
          expect(stored.projectiles).toHaveLength(0);
          expect(stored.fighters[0].currentMove).toBeNull();
          expect(internals.fighters[0].storedCharges["neutral-special"]).toBe(maximum);
          game.step([input({ pressed: ["special"] }), createEmptyInput()]);
        } else {
          game.step(idlePair());
        }
        for (let frame = 0; frame < 45 && internals.projectiles.length === 0; frame += 1) {
          game.step(idlePair());
        }
        const projectile = internals.projectiles[0]!;
        return {
          radius: projectile.radius,
          damage: getFighterDefinition(fighter).attacks["neutral-special"].damage *
            projectile.powerScale,
        };
      };

      const small = fireAtCharge(0);
      const partial = fireAtCharge(Math.floor(maximum / 2));
      const full = fireAtCharge(maximum);
      expect(small.radius).toBeCloseTo(minimumRadius, 5);
      expect(small.damage).toBeCloseTo(3, 5);
      expect(partial.radius).toBeGreaterThan(small.radius);
      expect(partial.radius).toBeLessThan(full.radius);
      expect(partial.damage).toBeGreaterThan(small.damage);
      expect(partial.damage).toBeLessThan(full.damage);
      expect(full.radius).toBeCloseTo(maximumRadius, 5);
      expect(full.damage).toBeCloseTo(25, 5);
    },
  );

  it("resumes a partial charge after moving between two sessions", () => {
    const game = createGame(config("samus", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 52 }, { x: 420, y: 52 }],
    });
    settle(game);
    const runtime = (game as unknown as {
      fighters: [{ storedCharges: Partial<Record<MoveName, number>> }, unknown];
    }).fighters[0];
    game.step([input({ held: ["special"], pressed: ["special"] }), createEmptyInput()]);
    for (let frame = 0; frame < 30; frame += 1) {
      game.step([input({ held: ["special"] }), createEmptyInput()]);
    }
    game.step([input({ held: ["shield"], pressed: ["shield"] }), createEmptyInput()]);
    expect(runtime.storedCharges["neutral-special"]).toBe(30);

    const moving = game.step([
      input({ held: ["right"], pressed: ["right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    expect(moving.fighters[0].velocity.x).toBeGreaterThan(0);
    game.step([input({ held: ["special"], pressed: ["special"] }), createEmptyInput()]);
    for (let frame = 0; frame < 20; frame += 1) {
      game.step([input({ held: ["special"] }), createEmptyInput()]);
    }
    game.step([input({ held: ["shield"], pressed: ["shield"] }), createEmptyInput()]);
    expect(runtime.storedCharges["neutral-special"]).toBe(50);
  });

  it.each(["link", "young-link"] as const)(
    "increases %s's arrow speed but not its size when charged",
    (fighter) => {
      const arrowStats = (chargeFrames: number): { speed: number; radius: number } => {
        const game = createGame(config(fighter), {
          countdownFrames: 0,
          spawnPositions: [{ x: -350, y: 220 }, { x: 500, y: 80 }],
        });
        game.step([
          input({
            held: chargeFrames > 0 ? ["special"] : [],
            pressed: ["special"],
          }),
          createEmptyInput(),
        ]);
        for (let frame = 0; frame < chargeFrames; frame += 1) {
          game.step([input({ held: ["special"] }), createEmptyInput()]);
        }
        let snapshot = game.step(idlePair());
        for (let frame = 0; frame < 30 && snapshot.projectiles.length === 0; frame += 1) {
          snapshot = game.step(idlePair());
        }
        return {
          speed: Math.abs(snapshot.projectiles[0]!.velocity.x),
          radius: snapshot.projectiles[0]!.radius,
        };
      };

      const uncharged = arrowStats(0);
      const charged = arrowStats(30);
      expect(uncharged.speed).toBeGreaterThan(350);
      expect(charged.speed).toBeGreaterThan(uncharged.speed * 1.3);
      expect(charged.radius).toBe(uncharged.radius);
    },
  );

  it("keeps Kirby's Pierre in place on the ground and makes it dive in the air", () => {
    const grounded = createGame(config("kirby"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 80 }, { x: 360, y: 80 }],
    });
    settle(grounded);
    const groundY = grounded.getSnapshot().fighters[0].position.y;
    grounded.step([
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    let groundedSnapshot = grounded.getSnapshot();
    for (let frame = 0; frame < 18; frame += 1) groundedSnapshot = grounded.step(idlePair());
    expect(groundedSnapshot.fighters[0].position.y).toBeCloseTo(groundY, 5);

    const airborne = createGame(config("kirby"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -260, y: 340 }, { x: 360, y: 80 }],
    });
    airborne.step([
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    let airborneSnapshot = airborne.getSnapshot();
    for (let frame = 0; frame < 18 && airborneSnapshot.fighters[0].velocity.y > -650; frame += 1) {
      airborneSnapshot = airborne.step(idlePair());
    }
    expect(airborneSnapshot.fighters[0].velocity.y).toBeLessThan(-650);
  });

  it("expires an input buffered too early and does not replay it", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 52 }, { x: 300, y: 52 }],
    });
    settle(game);
    game.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
    game.step([input({ held: ["special"], pressed: ["special"] }), createEmptyInput()]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 20; frame += 1) events.push(...game.step(idlePair()).events);
    expect(events.some(({ type, move }) => type === "attack" && move === "neutral-special")).toBe(false);
    expect(game.getSnapshot().fighters[0].currentMove).toBeNull();
  });

  it("converts an aerial into bounded landing lag and exposes impact speed", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -220, y: 130 }, { x: 320, y: 52 }],
    });
    game.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
    let snapshot = game.getSnapshot();
    let landing: GameEvent | undefined;
    for (let frame = 0; frame < 50 && !landing; frame += 1) {
      snapshot = game.step(idlePair());
      landing = snapshot.events.find(({ type, slot }) => type === "land" && slot === 0);
    }
    expect(landing?.impactSpeed).toBeGreaterThan(0);
    expect(snapshot.fighters[0].currentMove).toBeNull();
    expect(snapshot.fighters[0].state).toBe("crouch");
    let lagFrames = 0;
    while (game.getSnapshot().fighters[0].state === "crouch" && lagFrames < 30) {
      game.step(idlePair());
      lagFrames += 1;
    }
    expect(lagFrames).toBeGreaterThanOrEqual(6);
    expect(lagFrames).toBeLessThanOrEqual(16);
  });

  it("L-cancel halves landing lag within a seven-frame window", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -220, y: 130 }, { x: 320, y: 52 }],
    });
    game.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 40; frame += 1) {
      const fighter = snapshot.fighters[0];
      if (fighter.velocity.y < 0 && fighter.position.y < 86) break;
      snapshot = game.step(idlePair());
    }
    game.step([input({ held: ["shield"], pressed: ["shield"] }), createEmptyInput()]);
    let landing: GameEvent | undefined;
    for (let frame = 0; frame < 10 && !landing; frame += 1) {
      snapshot = game.step(idlePair());
      landing = snapshot.events.find(({ type }) => type === "land");
    }
    expect(landing?.lCancelled).toBe(true);
    let lagFrames = 0;
    while (game.getSnapshot().fighters[0].state === "crouch" && lagFrames < 20) {
      game.step(idlePair());
      lagFrames += 1;
    }
    expect(lagFrames).toBe(3);
  });

  it("edge-cancels landing lag as soon as the fighter leaves a platform", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 260 }, { x: 300, y: 52 }],
    });
    settle(game, 45);
    type EdgeCancelProbe = {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
      grounded: boolean;
      supportPlatform: string | null;
      landingLagFrames: number;
      state: string;
      definition: { size: { height: number } };
    };
    const internals = game as unknown as {
      fighters: [EdgeCancelProbe, EdgeCancelProbe];
    };
    const fighter = internals.fighters[0];
    const platform = game.getSnapshot().stage.platforms.find(({ id }) => id === "left")!;
    fighter.position = {
      x: platform.position.x + platform.width / 2 - 1,
      y: stageSurfaceYAt(platform, platform.position.x) + fighter.definition.size.height / 2,
    };
    // Also crosses half the capsule width in one frame to avoid retriggering
    // a landing on the platform's final pixel.
    fighter.velocity = { x: 1_500, y: 0 };
    fighter.grounded = true;
    fighter.supportPlatform = platform.id;
    fighter.landingLagFrames = 8;
    fighter.state = "crouch";

    const snapshot = game.step(idlePair());

    expect(snapshot.fighters[0]).toMatchObject({ grounded: false, state: "fall" });
    expect(fighter.landingLagFrames).toBe(0);
  });

  it("cancels landing lag and wavedash sliding when a fighter is launched", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -80, y: 52 }, { x: 80, y: 52 }],
    });
    settle(game);
    type FighterProbe = {
      landingLagFrames: number;
      wavedashFrames: number;
      hitstopFrames: number;
      hitstunFrames: number;
    };
    const internals = game as unknown as {
      fighters: [FighterProbe, FighterProbe];
      applyLaunch: (
        target: FighterProbe,
        attacker: FighterProbe,
        damage: number,
        angle: number,
        baseKnockback: number,
        growth: number,
        hitstun: number,
        targetInput: InputFrame,
      ) => void;
    };
    const [attacker, target] = internals.fighters;
    target.landingLagFrames = 10;
    target.wavedashFrames = 10;

    internals.applyLaunch(target, attacker, 6, 70, 45, 0.8, 8, createEmptyInput());

    expect(target.landingLagFrames).toBe(0);
    expect(target.wavedashFrames).toBe(0);
    target.hitstopFrames = 0;
    target.hitstunFrames = 0;
    const snapshot = game.step([
      createEmptyInput(),
      input({ held: ["attack"], pressed: ["attack"] }),
    ]);
    expect(snapshot.fighters[1].currentMove).toBe("neutral-air");
  });

  it("accounts for the DI chosen during hitstop", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -80, y: 52 }, { x: 80, y: 52 }],
    });
    settle(game);
    type LaunchProbe = {
      velocity: { x: number; y: number };
      launchVelocity: { x: number; y: number };
      hitstopFrames: number;
    };
    const internals = game as unknown as {
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
    const [attacker, target] = internals.fighters;
    internals.applyLaunch(target, attacker, 6, 0, 45, 0.8, 8, createEmptyInput());
    const speed = Math.hypot(target.launchVelocity.x, target.launchVelocity.y);
    target.hitstopFrames = 2;
    const up = input({ held: ["up"], direction: { x: 0, y: 1 } });
    game.step([createEmptyInput(), up]);
    game.step([createEmptyInput(), up]);

    expect(Math.hypot(target.launchVelocity.x, target.launchVelocity.y)).toBeCloseTo(speed, 6);
    expect(target.launchVelocity.y).toBeGreaterThan(speed * 0.3);
    expect(target.launchVelocity.x).toBeGreaterThan(0);
  });

  it("applies one SDI pulse on the input edge without repeating the held direction", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -80, y: 52 }, { x: 80, y: 420 }],
    });
    type SdiProbe = {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
      launchVelocity: { x: number; y: number };
      grounded: boolean;
      supportPlatform: string | null;
      hitstopFrames: number;
    };
    const internals = game as unknown as {
      fighters: [SdiProbe, SdiProbe];
      applyLaunch: (
        target: SdiProbe,
        attacker: SdiProbe,
        damage: number,
        angle: number,
        baseKnockback: number,
        growth: number,
        hitstun: number,
        targetInput: InputFrame,
      ) => void;
    };
    const [attacker, target] = internals.fighters;
    internals.applyLaunch(target, attacker, 6, 0, 45, 0.8, 8, createEmptyInput());
    target.position = { x: 80, y: 420 };
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

  it("applies held ASDI once when leaving hitstop", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -80, y: 52 }, { x: 80, y: 420 }],
    });
    type AsdiProbe = {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
      launchVelocity: { x: number; y: number };
      grounded: boolean;
      supportPlatform: string | null;
      hitstopFrames: number;
    };
    const internals = game as unknown as {
      fighters: [AsdiProbe, AsdiProbe];
      applyLaunch: (
        target: AsdiProbe,
        attacker: AsdiProbe,
        damage: number,
        angle: number,
        baseKnockback: number,
        growth: number,
        hitstun: number,
        targetInput: InputFrame,
      ) => void;
    };
    const [attacker, target] = internals.fighters;
    internals.applyLaunch(target, attacker, 6, 0, 45, 0.8, 8, createEmptyInput());
    target.position = { x: 80, y: 420 };
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

  it("bounds ASDI to solid stage surfaces and walls", () => {
    type CollisionProbe = {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
      launchVelocity: { x: number; y: number };
      grounded: boolean;
      supportPlatform: string | null;
      hitstopFrames: number;
      definition: { size: { width: number; height: number } };
    };
    const setup = () => {
      const game = createGame(config(), {
        countdownFrames: 0,
        spawnPositions: [{ x: -300, y: 52 }, { x: 0, y: 300 }],
      });
      const internals = game as unknown as {
        fighters: [CollisionProbe, CollisionProbe];
        applyLaunch: (
          target: CollisionProbe,
          attacker: CollisionProbe,
          damage: number,
          angle: number,
          baseKnockback: number,
          growth: number,
          hitstun: number,
          targetInput: InputFrame,
        ) => void;
      };
      const [attacker, target] = internals.fighters;
      internals.applyLaunch(target, attacker, 6, 0, 45, 0.8, 8, createEmptyInput());
      target.velocity = { x: 0, y: 0 };
      target.launchVelocity = { x: 0, y: 0 };
      target.grounded = false;
      target.supportPlatform = null;
      target.hitstopFrames = 1;
      return { game, target };
    };

    const floorCase = setup();
    const floor = floorCase.game.getSnapshot().stage.platforms.find(({ id }) => id === "main")!;
    const halfHeight = floorCase.target.definition.size.height / 2;
    floorCase.target.position = { x: 0, y: stageSurfaceYAt(floor, 0) + halfHeight + 1 };
    floorCase.game.step([
      createEmptyInput(),
      input({ held: ["down"], direction: { x: 0, y: -1 } }),
    ]);
    expect(floorCase.target.position.y - halfHeight)
      .toBeGreaterThanOrEqual(stageSurfaceYAt(floor, floorCase.target.position.x) - 0.001);

    const wallCase = setup();
    const wall = wallCase.game.getSnapshot().stage.platforms.find(({ id }) => id === "main")!;
    const halfWidth = wallCase.target.definition.size.width * 0.28;
    const wallLeft = wall.position.x - wall.width / 2;
    wallCase.target.position = {
      x: wallLeft - halfWidth - 1,
      y: stageSurfaceYAt(wall, wallLeft) - wall.height / 2,
    };
    wallCase.game.step([
      createEmptyInput(),
      input({ held: ["right"], direction: { x: 1, y: 0 } }),
    ]);
    expect(wallCase.target.position.x + halfWidth).toBeLessThanOrEqual(wallLeft + 0.001);
  });

  it("ground-techs in place or by rolling and immediately exits hitstun", () => {
    expect(TECH_INPUT_WINDOW_FRAMES).toBe(20);
    expect(TECH_INPUT_LOCKOUT_FRAMES).toBe(40);

    const groundTech = (directionX: -1 | 0 | 1) => {
      const game = createGame(config(), {
        countdownFrames: 0,
        spawnPositions: [{ x: -300, y: 52 }, { x: 0, y: 240 }],
      });
      type TechProbe = {
        position: { x: number; y: number };
        velocity: { x: number; y: number };
        grounded: boolean;
        supportPlatform: string | null;
        hitstopFrames: number;
        hitstunFrames: number;
        techable: boolean;
        state: string;
      };
      const internals = game as unknown as { fighters: [TechProbe, TechProbe] };
      const target = internals.fighters[1];
      const main = game.getSnapshot().stage.platforms.find(({ id }) => id === "main")!;
      const size = game.getSnapshot().fighters[1].size;
      target.position = {
        x: 0,
        y: stageSurfaceYAt(main, 0) + size.height / 2 + 5,
      };
      target.velocity = { x: 0, y: -600 };
      target.grounded = false;
      target.supportPlatform = null;
      target.hitstopFrames = 0;
      target.hitstunFrames = 30;
      target.techable = true;
      target.state = "hitstun";
      const directionAction = directionX < 0 ? "left" : "right";
      const held: ActionName[] = directionX === 0
        ? ["shield"]
        : ["shield", directionAction];
      return game.step([
        createEmptyInput(),
        input({
          held,
          pressed: held,
          direction: { x: directionX, y: 0 },
        }),
      ]).fighters[1];
    };

    const neutral = groundTech(0);
    expect(neutral).toMatchObject({
      grounded: true,
      state: "dodge",
      dodgeKind: "spot",
      hitstunFrames: 0,
    });
    expect(neutral.invulnerableFrames).toBeGreaterThan(0);

    const rolled = groundTech(1);
    expect(rolled.grounded).toBe(true);
    expect(rolled.state).toBe("dodge");
    expect(["forward", "back"]).toContain(rolled.dodgeKind);
    expect(rolled.hitstunFrames).toBe(0);
    expect(rolled.invulnerableFrames).toBeGreaterThan(0);
    expect(rolled.velocity.x).toBeGreaterThan(0);
  });

  it("wall-techs a horizontal impact instead of sticking to the solid edge", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 300, y: 52 }, { x: 0, y: 240 }],
    });
    type WallTechProbe = {
      position: { x: number; y: number };
      velocity: { x: number; y: number };
      grounded: boolean;
      supportPlatform: string | null;
      hitstopFrames: number;
      hitstunFrames: number;
      techable: boolean;
      state: string;
    };
    const internals = game as unknown as { fighters: [WallTechProbe, WallTechProbe] };
    const target = internals.fighters[1];
    const snapshot = game.getSnapshot();
    const main = snapshot.stage.platforms.find(({ id }) => id === "main")!;
    const halfWidth = snapshot.fighters[1].size.width * 0.28;
    const leftEdge = main.position.x - main.width / 2;
    target.position = { x: leftEdge - halfWidth - 2, y: main.position.y };
    target.velocity = { x: 360, y: 0 };
    target.grounded = false;
    target.supportPlatform = null;
    target.hitstopFrames = 0;
    target.hitstunFrames = 30;
    target.techable = true;
    target.state = "hitstun";

    const afterTech = game.step([
      createEmptyInput(),
      input({ held: ["shield"], pressed: ["shield"] }),
    ]).fighters[1];

    expect(afterTech.hitstunFrames).toBe(0);
    expect(afterTech.invulnerableFrames).toBeGreaterThan(0);
    expect(afterTech.velocity.x).toBeLessThan(0);
  });

  it("distributes nominal damage exactly among the hits of a multi-hit move", () => {
    const game = createGame(config("pikachu", "donkey-kong"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -25, y: 150 }, { x: 25, y: 150 }],
    });
    game.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
    const hits: GameEvent[] = [];
    for (let frame = 0; frame < 45; frame += 1) {
      hits.push(...game.step(idlePair()).events.filter(({ type }) => type === "hit"));
    }
    expect(hits).toHaveLength(3);
    expect(hits.map(({ damage }) => damage)).toEqual([
      8 / 3,
      8 / 3,
      8 / 3,
    ]);
    expect(hits.reduce((total, hit) => total + (hit.damage ?? 0), 0)).toBeCloseTo(8, 10);
    const launchSpeeds = hits.map(({ velocity }) => Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0));
    expect(Math.max(...launchSpeeds.slice(0, -1))).toBeLessThan(launchSpeeds.at(-1) ?? 0);
  });

  it("makes the finisher of Samus's seven-hit up special reachable", () => {
    const game = createGame(config("samus", "donkey-kong"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -25, y: 135 }, { x: 25, y: 165 }],
    });
    game.step([
      input({
        held: ["up", "special"],
        pressed: ["up", "special"],
        direction: { x: 0, y: 1 },
      }),
      createEmptyInput(),
    ]);
    const hits: GameEvent[] = [];
    for (let frame = 0; frame < 90; frame += 1) {
      hits.push(...game.step(idlePair()).events.filter(
        ({ type, move, target }) => type === "hit" && move === "up-special" && target === 1,
      ));
    }
    expect(hits).toHaveLength(7);
    expect(hits.reduce((total, hit) => total + (hit.damage ?? 0), 0)).toBeCloseTo(11, 10);
    const launchSpeeds = hits.map(({ velocity }) => Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0));
    expect(launchSpeeds.at(-1)).toBeGreaterThan(Math.max(...launchSpeeds.slice(0, -1)));
  });

  it("limits up special to one use before the next landing", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      // Keep Mario airborne after the first up-special recovery, even with
      // Melee gravity and fall speed.
      spawnPositions: [{ x: 0, y: 520 }, { x: 400, y: 52 }],
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

    for (let frame = 0; frame < 180 && !snapshot.fighters[0].grounded; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].grounded).toBe(true);
    snapshot = game.step([upSpecial, createEmptyInput()]);
    expect(snapshot.fighters[0].currentMove).toBe("up-special");
  });

  it("distinguishes entrance, spot dodge, roll, and taunt", () => {
    const entranceGame = createGame(config(), { countdownFrames: 2 });
    expect(entranceGame.getSnapshot().fighters.every(({ state }) => state === "entrance")).toBe(true);
    entranceGame.step(idlePair());
    expect(entranceGame.step(idlePair()).phase).toBe("playing");

    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -180, y: 52 }, { x: 180, y: 52 }],
    });
    settle(game);
    let snapshot = game.step([
      input({ held: ["shield", "down"], pressed: ["shield", "down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0]).toMatchObject({ state: "dodge", dodgeKind: "spot" });
    for (let frame = 0; frame < 26; frame += 1) game.step(idlePair());

    snapshot = game.step([
      input({ held: ["shield", "right"], pressed: ["shield", "right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0]).toMatchObject({ state: "dodge", dodgeKind: "forward" });
    for (let frame = 0; frame < 26; frame += 1) game.step(idlePair());

    snapshot = game.step([
      input({ held: ["shield", "grab"], pressed: ["grab"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].state).toBe("taunt");
  });

  it("lets a shield roll pass behind the opponent", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -70, y: 52 }, { x: 0, y: 52 }],
    });
    settle(game);
    let snapshot = game.step([
      input({ held: ["shield", "right"], pressed: ["shield", "right"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].dodgeKind).toBe("forward");
    for (let frame = 0; frame < 24 && snapshot.fighters[0].position.x <= snapshot.fighters[1].position.x; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0].position.x).toBeGreaterThan(snapshot.fighters[1].position.x);
    expect(snapshot.fighters[1].percent).toBe(0);
  });

  it("grabs a ledge with extra margin, then drops after ten seconds", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 300, y: 52 }],
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

  it("restores an aerial jump when the player deliberately drops down from the ledge", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 300, y: 52 }],
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
    expect(snapshot.fighters[0]).toMatchObject({ state: "fall", ledge: null, jumpsRemaining: 1 });
    snapshot = game.step([
      input({ held: ["jump"], pressed: ["jump"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].velocity.y).toBeGreaterThan(0);
    expect(snapshot.fighters[0].jumpsRemaining).toBe(0);
  });

  it("waits for a release before interpreting the direction held on ledge grab", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 300, y: 52 }],
    });
    settle(game);
    const climbInput = input({ held: ["right", "up"], direction: { x: 1, y: 1 } });
    let snapshot = approachLeftLedge(game, 50, climbInput);
    expect(snapshot.fighters[0]).toMatchObject({ state: "ledge", ledge: "left" });

    snapshot = game.step([climbInput, createEmptyInput()]);
    expect(snapshot.fighters[0]).toMatchObject({ state: "ledge", ledge: "left" });
    snapshot = game.step(idlePair());
    expect(snapshot.fighters[0]).toMatchObject({ state: "ledge", ledge: "left" });
    snapshot = game.step([climbInput, createEmptyInput()]);
    expect(snapshot.fighters[0]).toMatchObject({ state: "idle", ledge: null, grounded: true });
  });

  it("immediately allows action buttons despite a direction locked at the ledge", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 300, y: 52 }],
    });
    settle(game);
    const heldTowardStage = input({ held: ["right"], direction: { x: 1, y: 0 } });
    approachLeftLedge(game, 50, heldTowardStage);
    const snapshot = game.step([
      input({ held: ["right", "jump"], pressed: ["jump"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0]).toMatchObject({ state: "jump", ledge: null });
  });

  it.each([
    {
      label: "jump",
      command: input({ held: ["jump"], pressed: ["jump"] }),
      expected: { state: "jump", ledge: null },
    },
    {
      label: "neutral climb",
      command: input({ held: ["up"], pressed: ["up"], direction: { x: 0, y: 1 } }),
      expected: { state: "idle", ledge: null, grounded: true },
    },
    {
      label: "attack",
      command: input({ held: ["attack"], pressed: ["attack"] }),
      expected: { state: "attack", ledge: null, currentMove: "forward-tilt" },
    },
    {
      label: "roulade",
      command: input({ held: ["shield"], pressed: ["shield"] }),
      expected: { state: "dodge", ledge: null, dodgeKind: "forward" },
    },
  ])("provides a $label ledge option", ({ command, expected }) => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: 0, y: 52 }, { x: 300, y: 52 }],
    });
    settle(game);
    approachLeftLedge(game);
    const snapshot = game.step([command, createEmptyInput()]);
    expect(snapshot.fighters[0]).toMatchObject(expected);
  });

  it("widens counter and reflector windows around their active frames", () => {
    const cape = getFighterDefinition("mario").attacks["side-special"];
    const counter = getFighterDefinition("marth").attacks["down-special"];
    expect(defensiveMoveActiveAtFrame(cape.startup - 4, cape)).toBe(true);
    expect(defensiveMoveActiveAtFrame(cape.startup + cape.active + 4, cape)).toBe(true);
    expect(defensiveMoveActiveAtFrame(cape.startup + cape.active + 5, cape)).toBe(false);
    expect(defensiveMoveActiveAtFrame(counter.startup - 4, counter)).toBe(true);
  });

  it("exposes the directional animation of a throw", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -34, y: 52 }, { x: 34, y: 52 }],
    });
    settle(game);
    game.step([input({ held: ["grab"], pressed: ["grab"] }), createEmptyInput()]);
    expect(game.getSnapshot().fighters[0].grabTarget).toBe(1);
    expect(game.getSnapshot().fighters[1].grabbedBy).toBe(0);
    for (let frame = 0; frame < 4; frame += 1) game.step(idlePair());
    const snapshot = game.step([
      input({ held: ["down"], pressed: ["down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].throwAnimation).toBe("down");
    expect(snapshot.events.some(({ type }) => type === "throw")).toBe(true);
  });

  it("places a back throw on the exit side before launching", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -34, y: 52 }, { x: 34, y: 52 }],
    });
    settle(game);
    game.step([input({ held: ["grab"], pressed: ["grab"] }), createEmptyInput()]);
    for (let frame = 0; frame < 7; frame += 1) game.step(idlePair());
    const snapshot = game.step([
      input({ held: ["left", "right"], pressed: ["left"], direction: { x: 0, y: 0 } }),
      createEmptyInput(),
    ]);
    const [grabber, target] = snapshot.fighters;
    expect(grabber.throwAnimation).toBe("back");
    expect(target.position.x).toBeLessThan(grabber.position.x);
    expect(target.velocity.x).toBeLessThan(0);
    expect((target.position.x - grabber.position.x) * target.velocity.x).toBeGreaterThan(0);
  });

  it("makes Mario's signature properties and Link's shield strategic", () => {
    const reflectGame = createGame(config("samus", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -120, y: 52 }, { x: 120, y: 52 }],
    });
    settle(reflectGame);
    reflectGame.step([input({ pressed: ["special"] }), createEmptyInput()]);
    let incoming = reflectGame.getSnapshot();
    for (
      let frame = 0;
      frame < 120 && (incoming.projectiles[0]?.position.x ?? Number.NEGATIVE_INFINITY) < 20;
      frame += 1
    ) incoming = reflectGame.step(idlePair());
    expect(incoming.projectiles).toHaveLength(1);
    const remainingBeforeReflect = incoming.projectiles[0]!.remainingFrames;
    reflectGame.step([
      createEmptyInput(),
      input({ held: ["special", "left"], pressed: ["special", "left"], direction: { x: -1, y: 0 } }),
    ]);
    const reflectEvents: GameEvent[] = [];
    let reflectedOwnerSeen = false;
    let reflectedRemainingFrames = 0;
    for (let frame = 0; frame < 16; frame += 1) {
      const snapshot = reflectGame.step(idlePair());
      reflectEvents.push(...snapshot.events);
      const reflected = snapshot.projectiles.find(({ owner }) => owner === 1);
      reflectedOwnerSeen ||= Boolean(reflected);
      if (reflected) reflectedRemainingFrames = Math.max(reflectedRemainingFrames, reflected.remainingFrames);
    }
    expect(reflectEvents.some(({ type, slot }) => type === "shield-hit" && slot === 1)).toBe(true);
    expect(reflectedOwnerSeen).toBe(true);
    expect(reflectedRemainingFrames).toBeGreaterThan(remainingBeforeReflect);

    const shieldGame = createGame(config("samus", "link"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -70, y: 52 }, { x: 70, y: 52 }],
    });
    settle(shieldGame);
    shieldGame.step([input({ pressed: ["special"] }), createEmptyInput()]);
    const shieldEvents: GameEvent[] = [];
    for (let frame = 0; frame < 30; frame += 1) {
      shieldEvents.push(...shieldGame.step(idlePair()).events);
    }
    expect(shieldGame.getSnapshot().fighters[1].percent).toBe(0);
    expect(shieldEvents.some(({ type, slot }) => type === "shield-hit" && slot === 1)).toBe(true);
  });

  it("makes Oil Panic absorb energy and reflect physical projectiles", () => {
    const absorbGame = createGame(config("mario", "mr-game-and-watch"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -70, y: 52 }, { x: 70, y: 52 }],
    });
    settle(absorbGame);
    absorbGame.step([input({ pressed: ["special"] }), createEmptyInput()]);
    for (let frame = 0; frame < 7; frame += 1) absorbGame.step(idlePair());
    absorbGame.step([
      createEmptyInput(),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    const absorbEvents: GameEvent[] = [];
    for (let frame = 0; frame < 24; frame += 1) {
      absorbEvents.push(...absorbGame.step(idlePair()).events);
    }
    expect(absorbGame.getSnapshot().fighters[1].percent).toBe(0);
    expect(absorbEvents.some(({ type, slot }) => type === "shield-hit" && slot === 1)).toBe(true);
    expect(absorbGame.getSnapshot().projectiles.some(({ kind }) => kind === "fireball")).toBe(false);

    const reflectGame = createGame(config("link", "mr-game-and-watch"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -250, y: 52 }, { x: 250, y: 52 }],
    });
    settle(reflectGame);
    reflectGame.step([input({ pressed: ["special"] }), createEmptyInput()]);
    let approaching = reflectGame.getSnapshot();
    for (let frame = 0; frame < 70; frame += 1) {
      const arrow = approaching.projectiles.find(({ kind }) => kind === "arrow");
      if (arrow && approaching.fighters[1].position.x - arrow.position.x < 190) break;
      approaching = reflectGame.step(idlePair());
    }
    expect(approaching.projectiles.some(({ kind }) => kind === "arrow")).toBe(true);
    reflectGame.step([
      createEmptyInput(),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    let reflectedOwnerSeen = false;
    for (let frame = 0; frame < 24; frame += 1) {
      const snapshot = reflectGame.step(idlePair());
      reflectedOwnerSeen ||= snapshot.projectiles.some(
        ({ kind, owner }) => kind === "arrow" && owner === 1,
      );
    }
    expect(reflectGame.getSnapshot().fighters[1].percent).toBe(0);
    expect(reflectedOwnerSeen).toBe(true);
  });

  it("stores absorbed energy, then releases it with Oil Panic", () => {
    const game = createGame(config("mario", "mr-game-and-watch"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -50, y: 52 }, { x: 50, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["special"], pressed: ["special"] }),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 65; frame += 1) snapshot = game.step(idlePair());
    expect(snapshot.projectiles.some(({ kind }) => kind === "fireball")).toBe(false);
    expect(snapshot.fighters[1].percent).toBe(0);

    game.step([
      createEmptyInput(),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 35 && snapshot.fighters[0].percent === 0; frame += 1) {
      snapshot = game.step(idlePair());
      events.push(...snapshot.events);
    }
    expect(snapshot.fighters[0].percent).toBeGreaterThan(8);
    expect(events.some(({ type, move, target }) =>
      type === "hit" && move === "down-special" && target === 0,
    )).toBe(true);
  });

  it("also turns the opponent around with Dr. Mario's Super drap", () => {
    const game = createGame(config("dr-mario", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -42, y: 52 }, { x: 42, y: 52 }],
    });
    settle(game);
    expect(game.getSnapshot().fighters[1].facing).toBe(-1);
    game.step([
      input({ held: ["right", "special"], pressed: ["right", "special"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 24; frame += 1) game.step(idlePair());
    expect(game.getSnapshot().fighters[1].facing).toBe(1);
  });

  it("makes Mario's J.E.T. a damage-free push", () => {
    const game = createGame(config("mario", "link"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -42, y: 52 }, { x: 42, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["special", "down"], pressed: ["special", "down"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 12; frame += 1) game.step(idlePair());
    const target = game.getSnapshot().fighters[1];
    expect(target.percent).toBe(0);
    expect(target.velocity.x).toBeGreaterThan(0);
  });

  it("launches in the projectile's travel direction even if the shooter turns around", () => {
    const game = createGame(config("samus", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -240, y: 52 }, { x: 180, y: 52 }],
    });
    settle(game);
    game.step([input({ held: ["special"], pressed: ["special"] }), createEmptyInput()]);

    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 45; frame += 1) {
      snapshot = game.step([
        input({ held: ["left"], pressed: frame === 0 ? ["left"] : [], direction: { x: -1, y: 0 } }),
        createEmptyInput(),
      ]);
    }
    expect(snapshot.fighters[0].facing).toBe(-1);

    let projectileHit = false;
    for (let frame = 0; frame < 120 && !projectileHit; frame += 1) {
      snapshot = game.step(idlePair());
      projectileHit = snapshot.events.some(
        ({ type, source, target }) => type === "hit" && source === "projectile" && target === 1,
      );
    }
    expect(projectileHit).toBe(true);
    expect(snapshot.fighters[1].velocity.x).toBeGreaterThan(0);
  });

  it("distributes multi-hit projectile damage without multiplying it", () => {
    const game = createGame(config("bowser", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -55, y: 72 }, { x: 55, y: 52 }],
    });
    settle(game);
    game.step([input({ pressed: ["special"] }), createEmptyInput()]);
    const hits: GameEvent[] = [];
    for (let frame = 0; frame < 45; frame += 1) {
      hits.push(...game.step(idlePair()).events.filter(
        ({ type, source, target }) => type === "hit" && source === "projectile" && target === 1,
      ));
    }

    expect(hits).toHaveLength(5);
    expect(hits.reduce((total, event) => total + (event.damage ?? 0), 0)).toBeCloseTo(11, 5);
    expect(game.getSnapshot().fighters[1].percent).toBeCloseTo(11, 5);
  });

  it("lets the boomerang return after hitting on its outbound path", () => {
    const game = createGame(config("link", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -100, y: 52 }, { x: 55, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["right", "special"], pressed: ["right", "special"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    let survivedHit = false;
    let reversedAfterHit = false;
    let curvedReturnSeen = false;
    let hitSeen = false;
    const lifetime = getFighterDefinition("link").attacks["side-special"].projectile!.lifetimeFrames;
    expect(lifetime).toBeGreaterThanOrEqual(160);
    for (let frame = 0; frame < 150; frame += 1) {
      const snapshot = game.step(idlePair());
      hitSeen ||= snapshot.events.some(
        ({ type, source, move, target }) =>
          type === "hit" && source === "projectile" && move === "side-special" && target === 1,
      );
      const boomerang = snapshot.projectiles.find(({ kind }) => kind === "boomerang");
      if (hitSeen && boomerang) survivedHit = true;
      if (
        boomerang &&
        boomerang.remainingFrames < lifetime - lifetime * 0.48 &&
        boomerang.velocity.x > 0
      ) curvedReturnSeen = true;
      if (survivedHit && (boomerang?.velocity.x ?? 0) < 0) reversedAfterHit = true;
    }

    expect(hitSeen).toBe(true);
    expect(survivedHit).toBe(true);
    expect(curvedReturnSeen).toBe(true);
    expect(reversedAfterHit).toBe(true);
  });

  it("detonates Link's remote bomb on the second down-B", () => {
    const game = createGame(config("link", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 100 }, { x: 500, y: 100 }],
    });
    settle(game);
    const downSpecial = input({
      held: ["down", "special"],
      pressed: ["down", "special"],
      direction: { x: 0, y: -1 },
    });
    game.step([downSpecial, createEmptyInput()]);
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 45 && snapshot.projectiles.length === 0; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.projectiles).toHaveLength(1);
    const bombId = snapshot.projectiles[0]!.id;

    for (let frame = 0; frame < 45 && snapshot.fighters[0].currentMove; frame += 1) {
      snapshot = game.step(idlePair());
    }
    snapshot = game.step([downSpecial, createEmptyInput()]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 35 && snapshot.projectiles.length > 0; frame += 1) {
      snapshot = game.step(idlePair());
      events.push(...snapshot.events);
    }

    expect(snapshot.projectiles.some(({ id }) => id === bombId)).toBe(false);
    expect(snapshot.projectiles).toHaveLength(0);
    expect(events.some(({ type, move }) => type === "attack-active" && move === "down-special")).toBe(true);
  });

  it("does not launch Ness before PK Thunder returns and hits him", () => {
    const game = createGame(config("ness", "mario"), {
      countdownFrames: 0,
      // Keep this owner-contact test away from the ledge-catch envelope: a
      // valid ledge snap can intentionally bring Ness back into PK Thunder.
      spawnPositions: [{ x: 0, y: 520 }, { x: 500, y: 52 }],
    });
    const startingY = game.getSnapshot().fighters[0].position.y;
    game.step([
      input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
      createEmptyInput(),
    ]);
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 18; frame += 1) snapshot = game.step(idlePair());

    expect(snapshot.projectiles.some(({ kind }) => kind === "pk-thunder")).toBe(true);
    expect(snapshot.fighters[0].position.y).toBeLessThan(startingY);
    expect(snapshot.fighters[0].velocity.y).toBeLessThanOrEqual(0);
  });

  it("does not lock Sing after grounded use", () => {
      const game = createGame(config("jigglypuff", "mario"), {
        countdownFrames: 0,
        spawnPositions: [{ x: -220, y: 52 }, { x: 280, y: 52 }],
      });
      settle(game);
      const upSpecial = input({
        held: ["up", "special"],
        pressed: ["up", "special"],
        direction: { x: 0, y: 1 },
      });
      let snapshot = game.step([upSpecial, createEmptyInput()]);
      for (let frame = 0; frame < 90 && snapshot.fighters[0].currentMove; frame += 1) {
        snapshot = game.step(idlePair());
      }
      expect(snapshot.fighters[0].grounded).toBe(true);
      snapshot = game.step([upSpecial, createEmptyInput()]);
      expect(snapshot.fighters[0].currentMove).toBe("up-special");
  });

  it("triggers Marth's counters only when he is hit", () => {
    const passive = createGame(config("marth", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -42, y: 52 }, { x: 42, y: 52 }],
    });
    settle(passive);
    passive.step([
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 35; frame += 1) passive.step(idlePair());
    expect(passive.getSnapshot().fighters[1].percent).toBe(0);

    const reactive = createGame(config("mario", "marth"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -42, y: 52 }, { x: 42, y: 52 }],
    });
    settle(reactive);
    reactive.step([
      createEmptyInput(),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    for (let frame = 0; frame < 4; frame += 1) reactive.step(idlePair());
    reactive.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 12; frame += 1) events.push(...reactive.step(idlePair()).events);

    const snapshot = reactive.getSnapshot();
    expect(snapshot.fighters[0].percent).toBeGreaterThan(0);
    expect(snapshot.fighters[1].percent).toBe(0);
    expect(events.some(({ type, slot, target, move }) =>
      type === "hit" && slot === 1 && target === 0 && move === "down-special"
    )).toBe(true);
  });

  it("triggers only one retaliation against a multi-hit projectile", () => {
    const game = createGame(config("bowser", "marth"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -55, y: 72 }, { x: 55, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["special"], pressed: ["special"] }),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    const counterHits: GameEvent[] = [];
    for (let frame = 0; frame < 40; frame += 1) {
      counterHits.push(...game.step(idlePair()).events.filter(
        ({ type, slot, target, move }) =>
          type === "hit" && slot === 1 && target === 0 && move === "down-special",
      ));
    }

    expect(counterHits).toHaveLength(1);
    expect(game.getSnapshot().fighters[0].percent).toBeCloseTo(14, 5);
    expect(game.getSnapshot().fighters[1].percent).toBe(0);
  });

  it("neutralizes a countered projectile without hitting its shooter at range", () => {
    const game = createGame(config("samus", "marth"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -400, y: 52 }, { x: 400, y: 52 }],
    });
    settle(game);
    game.step([input({ held: ["special"], pressed: ["special"] }), createEmptyInput()]);
    let incoming = game.getSnapshot();
    for (
      let frame = 0;
      frame < 180 && (incoming.projectiles[0]?.position.x ?? Number.NEGATIVE_INFINITY) < 250;
      frame += 1
    ) incoming = game.step(idlePair());
    expect(incoming.projectiles).toHaveLength(1);
    game.step([
      createEmptyInput(),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    let projectileSeen = game.getSnapshot().projectiles.length > 0;
    for (let frame = 0; frame < 35; frame += 1) {
      const snapshot = game.step(idlePair());
      projectileSeen ||= snapshot.projectiles.length > 0;
    }

    const snapshot = game.getSnapshot();
    expect(projectileSeen).toBe(true);
    expect(snapshot.projectiles).toHaveLength(0);
    expect(snapshot.fighters[0].percent).toBe(0);
    expect(snapshot.fighters[1].percent).toBe(0);
  });

  it("makes Sing inflict sleep without damage or knockback", () => {
    const game = createGame(config("jigglypuff", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -35, y: 52 }, { x: 35, y: 52 }],
    });
    settle(game);
    game.step([
      input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
      createEmptyInput(),
    ]);
    let sleepHit: GameEvent | undefined;
    for (let frame = 0; frame < 30 && !sleepHit; frame += 1) {
      sleepHit = game.step(idlePair()).events.find(
        ({ type, target, move }) => type === "hit" && target === 1 && move === "up-special",
      );
    }

    expect(sleepHit?.damage).toBe(0);
    expect(sleepHit?.velocity).toEqual({ x: 0, y: 0 });
    expect(game.getSnapshot().fighters[1].percent).toBe(0);
    expect(game.getSnapshot().fighters[1].hitstunFrames).toBeGreaterThan(70);
  });

  it("applies damage, hitstop, and hitstun when a jab connects", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [
        { x: -40, y: 52 },
        { x: 40, y: 52 },
      ],
    });
    settle(game);

    const events: GameEvent[] = [];
    game.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
    for (let frame = 0; frame < 10; frame += 1) {
      const snapshot = game.step(idlePair());
      events.push(...snapshot.events);
      if (snapshot.fighters[1].percent > 0) break;
    }
    const snapshot = game.getSnapshot();
    expect(snapshot.fighters[1].percent).toBeGreaterThan(0);
    expect(snapshot.fighters[1].hitstunFrames).toBeGreaterThan(0);
    const hit = events.find((event) => event.type === "hit" && event.target === 1);
    expect(hit).toMatchObject({ source: "melee" });
    expect(Math.hypot(hit?.velocity?.x ?? 0, hit?.velocity?.y ?? 0)).toBeGreaterThan(0);
  });

  it("reproduces Melee's formula, speed, hitstun, and decay", () => {
    const knockbackAt = (preHitPercent: number): number => calculateMeleeKnockback({
      postHitPercent: preHitPercent + 6,
      damage: 6,
      weight: 100,
      baseKnockback: 45,
      knockbackGrowth: 0.8,
    });
    const fresh = knockbackAt(0);
    const damaged = knockbackAt(100);
    const critical = knockbackAt(150);

    expect(fresh).toBeCloseTo(62.088, 6);
    expect(damaged).toBeCloseTo(106.888, 6);
    expect(critical).toBeCloseTo(129.288, 6);
    expect(MELEE_LAUNCH_SPEED_MULTIPLIER).toBe(0.03);
    expect(MELEE_HITSTUN_PER_KNOCKBACK).toBe(0.4);
    expect(meleeHitstunFrames(critical)).toBe(Math.floor(critical * 0.4));

    const launch = meleeLaunchVelocity(critical, 0);
    const decayed = decayMeleeLaunchVelocity(launch);
    expect(Math.hypot(launch.x, launch.y)).toBeCloseTo(critical * 0.03, 8);
    expect(Math.hypot(launch.x, launch.y) - Math.hypot(decayed.x, decayed.y))
      .toBeCloseTo(MELEE_LAUNCH_SPEED_DECAY_PER_FRAME, 8);
    expect(meleeLaunchVelocityToWorld(launch).x).toBeGreaterThan(1_700);
  });

  it("preserves independent knockback after hitstun ends", () => {
    type LaunchRuntime = {
      position: { x: number; y: number };
      previousPosition: { x: number; y: number };
      velocity: { x: number; y: number };
      launchVelocity: { x: number; y: number };
      grounded: boolean;
      supportPlatform: string | null;
      hitstunFrames: number;
    };
    const game = createGame(config("mario", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -300, y: 52 }, { x: 0, y: 500 }],
    });
    const internals = game as unknown as {
      fighters: [LaunchRuntime, LaunchRuntime];
      applyLaunch: (
        target: LaunchRuntime,
        attacker: LaunchRuntime,
        damage: number,
        angle: number,
        baseKnockback: number,
        growth: number,
        hitstun: number,
        targetInput: InputFrame,
      ) => void;
    };
    const [attacker, target] = internals.fighters;
    target.position = { x: 0, y: 500 };
    target.previousPosition = { ...target.position };
    target.grounded = false;
    target.supportPlatform = null;
    internals.applyLaunch(target, attacker, 6, 0, 45, 0.8, 8, createEmptyInput());
    const initialSpeed = Math.hypot(target.launchVelocity.x, target.launchVelocity.y);
    const initialHitstun = target.hitstunFrames;

    game.step(idlePair());
    expect(Math.hypot(target.launchVelocity.x, target.launchVelocity.y))
      .toBeCloseTo(initialSpeed - MELEE_LAUNCH_SPEED_DECAY_PER_FRAME, 8);
    expect(game.getSnapshot().fighters[1].velocity.x).toBeGreaterThan(0);

    for (let frame = 1; frame < initialHitstun; frame += 1) game.step(idlePair());
    expect(target.hitstunFrames).toBe(0);
    const residualSpeed = Math.hypot(target.launchVelocity.x, target.launchVelocity.y);
    expect(residualSpeed).toBeGreaterThan(0);
    game.step(idlePair());
    expect(Math.hypot(target.launchVelocity.x, target.launchVelocity.y))
      .toBeLessThan(residualSpeed);
  });

  it("makes a normal move produce meaningful knockback at 150% without becoming a smash", () => {
    const jabSpeedAt = (percent: number): number => {
      const game = createGame(config("mario", "mario"), {
        countdownFrames: 0,
        spawnPositions: [{ x: -40, y: 52 }, { x: 40, y: 52 }],
      });
      settle(game);
      const internals = game as unknown as {
        fighters: [{ percent: number }, { percent: number }];
      };
      internals.fighters[1].percent = percent;
      game.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
      for (let frame = 0; frame < 12; frame += 1) {
        const hit = game.step(idlePair()).events.find(
          ({ type, target, move }) => type === "hit" && target === 1 && move === "jab",
        );
        if (hit) return Math.hypot(hit.velocity?.x ?? 0, hit.velocity?.y ?? 0);
      }
      throw new Error("The calibration jab did not connect");
    };

    const fresh = jabSpeedAt(0);
    const damaged = jabSpeedAt(100);
    const critical = jabSpeedAt(150);
    expect(comboStarterBaseKnockbackScale("jab", 0)).toBe(0.76);
    expect(comboStarterBaseKnockbackScale("jab", 150)).toBe(1);
    expect(damaged).toBeGreaterThan(fresh);
    expect(critical).toBeGreaterThan(damaged);
    expect(critical).toBeGreaterThan(fresh * 1.45);
  });

  it("emits an attack's active frame for low-frame-rate rendering", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [{ x: -180, y: 52 }, { x: 180, y: 52 }],
    });
    settle(game);
    game.step([input({ held: ["attack"], pressed: ["attack"] }), createEmptyInput()]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 8; frame += 1) {
      events.push(...game.step(idlePair()).events);
    }
    const active = events.find(({ type, move }) => type === "attack-active" && move === "jab");
    expect(active).toMatchObject({ slot: 0, move: "jab" });
    expect(active?.position?.x).toBeGreaterThan(game.getSnapshot().fighters[0].position.x);
  });

  it("the shield absorbs the hit and loses durability", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [
        { x: -40, y: 52 },
        { x: 40, y: 52 },
      ],
    });
    settle(game);
    const shield = input({ held: ["shield"] });
    const initialShield = game.getSnapshot().fighters[1].shield;
    const events: GameEvent[] = [];

    game.step([input({ held: ["attack"], pressed: ["attack"] }), shield]);
    for (let frame = 0; frame < 10; frame += 1) {
      const snapshot = game.step([createEmptyInput(), shield]);
      events.push(...snapshot.events);
      if (events.some((event) => event.type === "shield-hit")) break;
    }
    const snapshot = game.getSnapshot();
    expect(snapshot.fighters[1].percent).toBe(0);
    expect(snapshot.fighters[1].shield).toBeLessThan(initialShield);
    expect(events.some((event) => event.type === "shield-hit" && event.target === 1)).toBe(true);
  });

  it("makes command grabs pass through shields", () => {
    const game = createGame(config("kirby", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -55, y: 52 }, { x: 55, y: 52 }],
    });
    settle(game);
    const shield = input({ held: ["shield"] });
    game.step([
      input({ held: ["special"], pressed: ["special"] }),
      input({ held: ["shield"], pressed: ["shield"] }),
    ]);

    const events: GameEvent[] = [];
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 30 && snapshot.fighters[1].percent === 0; frame += 1) {
      snapshot = game.step([createEmptyInput(), shield]);
      events.push(...snapshot.events);
    }

    expect(snapshot.fighters[1].percent).toBeGreaterThan(0);
    expect(events.some(({ type, move, target }) =>
      type === "hit" && move === "neutral-special" && target === 1,
    )).toBe(true);
    expect(events.some(({ type }) => type === "shield-hit")).toBe(false);
  });

  it.each([
    {
      fighter: "yoshi" as const,
      held: ["special"] as ActionName[],
      direction: { x: 0, y: 0 },
      minimumStatusFrames: 55,
      attackerX: -50,
    },
    {
      fighter: "donkey-kong" as const,
      held: ["right", "special"] as ActionName[],
      direction: { x: 1, y: 0 },
      minimumStatusFrames: 50,
      attackerX: -50,
    },
  ])("applies $fighter's signature immobilization", ({
    fighter,
    held,
    direction,
    minimumStatusFrames,
    attackerX,
  }) => {
    const game = createGame(config(fighter, "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: attackerX, y: 100 }, { x: 50, y: 100 }],
    });
    settle(game);
    game.step([
      input({ held, pressed: held, direction }),
      createEmptyInput(),
    ]);
    let maximumHitstun = 0;
    for (let frame = 0; frame < 35; frame += 1) {
      const snapshot = game.step(idlePair());
      maximumHitstun = Math.max(maximumHitstun, snapshot.fighters[1].hitstunFrames);
    }
    expect(maximumHitstun).toBeGreaterThanOrEqual(minimumStatusFrames);
  });

  type StatusProbe = {
    grounded: boolean;
    supportPlatform: string | null;
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    launchVelocity: { x: number; y: number };
    statusEffect: "sleep" | "stun" | "bury" | null;
    statusResistanceFrames: number;
    hitstunFrames: number;
    hitstopFrames: number;
    consecutiveHitMoveCount: number;
    jumpsRemaining: number;
    airUpSpecialUsed: boolean;
  };
  type CombatProbe = {
    fighters: [StatusProbe, StatusProbe];
    resolveAttackHit: (
      attacker: StatusProbe,
      target: StatusProbe,
      move: AttackDefinition,
      moveName: MoveName,
      targetInput: InputFrame,
    ) => void;
  };
  const buryProbe = (airborne = false): {
    game: ReturnType<typeof createGame>;
    internals: CombatProbe;
    move: AttackDefinition;
  } => {
    const game = createGame(config("donkey-kong", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -50, y: 52 }, { x: 50, y: 52 }],
    });
    settle(game);
    const internals = game as unknown as CombatProbe;
    if (airborne) {
      internals.fighters[1].grounded = false;
      internals.fighters[1].supportPlatform = null;
      internals.fighters[1].position.y = 300;
    }
    return {
      game,
      internals,
      move: getFighterDefinition("donkey-kong").attacks["side-special"],
    };
  };

  it("prevents DK's Headbutt from refreshing a bury indefinitely", () => {
    const { internals, move } = buryProbe();
    const [attacker, target] = internals.fighters;
    internals.resolveAttackHit(attacker, target, move, "side-special", createEmptyInput());
    const initialStun = target.hitstunFrames;

    expect(target.statusEffect).toBe("bury");
    expect(target.hitstopFrames).toBe(move.hitstop + 1);
    internals.resolveAttackHit(attacker, target, move, "side-special", createEmptyInput());

    expect(target.statusEffect).toBeNull();
    expect(target.statusResistanceFrames).toBeGreaterThanOrEqual(90);
    expect(target.hitstunFrames).toBeLessThan(initialStun);
    expect(Math.hypot(target.launchVelocity.x, target.launchVelocity.y)).toBeGreaterThan(0);
  });

  it("launches an aerial target normally instead of burying it in midair", () => {
    const { internals, move } = buryProbe(true);
    const [attacker, target] = internals.fighters;
    internals.resolveAttackHit(attacker, target, move, "side-special", createEmptyInput());

    expect(target.statusEffect).toBeNull();
    expect(target.grounded).toBe(false);
    expect(Math.hypot(target.launchVelocity.x, target.launchVelocity.y)).toBeGreaterThan(0);
  });

  it("restores a jump and up special after being hit in the air", () => {
    const { internals } = buryProbe(true);
    const [attacker, target] = internals.fighters;
    const jab = getFighterDefinition("mario").attacks.jab;
    target.jumpsRemaining = 0;
    target.airUpSpecialUsed = true;

    internals.resolveAttackHit(attacker, target, jab, "jab", createEmptyInput());

    expect(target.jumpsRemaining).toBe(1);
    expect(target.airUpSpecialUsed).toBe(false);
  });

  it("blocks all new attacks after an Up B until the fighter is hit", () => {
    const game = createGame(config("mario", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -80, y: 52 }, { x: 80, y: 52 }],
    });
    settle(game);
    const internals = game as unknown as {
      fighters: [StatusProbe & {
        previousPosition: { x: number; y: number };
        state: string;
        action: unknown;
      }, StatusProbe];
      resolveAttackHit: CombatProbe["resolveAttackHit"];
    };
    const recovering = internals.fighters[0];
    recovering.position = { x: -80, y: 400 };
    recovering.previousPosition = { ...recovering.position };
    recovering.velocity = { x: 0, y: 0 };
    recovering.launchVelocity = { x: 0, y: 0 };
    recovering.grounded = false;
    recovering.supportPlatform = null;
    recovering.state = "fall";

    let snapshot = game.step([
      input({ held: ["up", "special"], pressed: ["up", "special"], direction: { x: 0, y: 1 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBe("up-special");
    for (let frame = 0; frame < 90 && snapshot.fighters[0].currentMove; frame += 1) {
      snapshot = game.step(idlePair());
    }
    expect(snapshot.fighters[0]).toMatchObject({ currentMove: null, grounded: false });
    expect(recovering.airUpSpecialUsed).toBe(true);

    snapshot = game.step([
      input({ held: ["attack"], pressed: ["attack"] }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBeNull();
    snapshot = game.step([
      input({ held: ["right", "special"], pressed: ["right", "special"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    expect(snapshot.fighters[0].currentMove).toBeNull();

    internals.resolveAttackHit(
      internals.fighters[1],
      recovering,
      getFighterDefinition("mario").attacks.jab,
      "jab",
      createEmptyInput(),
    );
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

  it("does not grant an extra resource to a grounded target that is hit", () => {
    const { internals } = buryProbe(false);
    const [attacker, target] = internals.fighters;
    const jab = getFighterDefinition("mario").attacks.jab;
    target.jumpsRemaining = 0;
    target.airUpSpecialUsed = true;

    internals.resolveAttackHit(attacker, target, jab, "jab", createEmptyInput());

    expect(target.jumpsRemaining).toBe(0);
    expect(target.airUpSpecialUsed).toBe(true);
  });

  it("allows mashing to reduce bury time without sliding the victim", () => {
    const escapeFrames = (mash: boolean): { frames: number; travel: number } => {
      const { game, internals, move } = buryProbe();
      const [attacker, target] = internals.fighters;
      const startX = target.position.x;
      internals.resolveAttackHit(attacker, target, move, "side-special", createEmptyInput());
      let frames = 0;
      while (game.getSnapshot().fighters[1].statusEffect === "bury" && frames < 100) {
        const targetInput = mash && frames % 2 === 0
          ? input({ held: ["attack"], pressed: ["attack"] })
          : input({ held: ["right"], direction: { x: 1, y: 0 } });
        game.step([createEmptyInput(), targetInput]);
        frames += 1;
      }
      return { frames, travel: Math.abs(target.position.x - startX) };
    };

    const idle = escapeFrames(false);
    const mashed = escapeFrames(true);
    expect(mashed.frames).toBeLessThan(idle.frames - 20);
    expect(idle.travel).toBeLessThan(1);
  });

  it("allows a jab confirm, then breaks the second identical lock", () => {
    const { internals } = buryProbe();
    const [attacker, target] = internals.fighters;
    const jab = getFighterDefinition("mario").attacks.jab;
    const speeds: number[] = [];
    const stuns: number[] = [];
    for (let hit = 0; hit < 2; hit += 1) {
      internals.resolveAttackHit(attacker, target, jab, "jab", createEmptyInput());
      speeds.push(Math.hypot(target.launchVelocity.x, target.launchVelocity.y));
      stuns.push(target.hitstunFrames);
    }

    expect(SAME_MOVE_LOCK_BREAK_HIT).toBe(2);
    expect(SAME_MOVE_LOCK_BREAK_LAUNCH_MULTIPLIER).toBe(1.45);
    expect(target.consecutiveHitMoveCount).toBe(2);
    expect(speeds[1]!).toBeGreaterThan(speeds[0]! * 1.4);
    // The repeated hit follows Melee's K × 0.4 hitstun rule too, but its much
    // larger launch speed forces separation instead of refreshing a local lock.
    expect(stuns[1]!).toBeGreaterThan(stuns[0]!);

    const upTilt = getFighterDefinition("mario").attacks["up-tilt"];
    internals.resolveAttackHit(attacker, target, upTilt, "up-tilt", createEmptyInput());
    expect(target.consecutiveHitMoveCount).toBe(1);
  });

  it("propagates Donkey Kong's Tambour shockwave along the ground", () => {
    const game = createGame(config("donkey-kong", "mario"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -250, y: 100 }, { x: 0, y: 100 }],
    });
    settle(game);
    game.step([
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
      createEmptyInput(),
    ]);
    const events: GameEvent[] = [];
    let maximumWaveX = Number.NEGATIVE_INFINITY;
    let minimumWaveDistance = Number.POSITIVE_INFINITY;
    let snapshot = game.getSnapshot();
    for (let frame = 0; frame < 60 && snapshot.fighters[1].percent === 0; frame += 1) {
      snapshot = game.step(idlePair());
      events.push(...snapshot.events);
      const wave = snapshot.projectiles.find(({ kind }) => kind === "ground-wave");
      if (wave) {
        maximumWaveX = Math.max(maximumWaveX, wave.position.x);
        minimumWaveDistance = Math.min(
          minimumWaveDistance,
          Math.hypot(
            wave.position.x - snapshot.fighters[1].position.x,
            wave.position.y - snapshot.fighters[1].position.y,
          ),
        );
      }
    }
    expect(events.some(({ type, projectileKind }) =>
      type === "projectile" && projectileKind === "ground-wave",
    )).toBe(true);
    expect(maximumWaveX).toBeGreaterThan(-70);
    expect(minimumWaveDistance).toBeLessThan(70);
    expect(events.some(({ type, source, move, target }) =>
      type === "hit" && source === "projectile" && move === "down-special" && target === 1,
    )).toBe(true);
  });

  it("requires the target to face Mewtwo for Disable to stun", () => {
    const toward = createGame(config("mario", "mewtwo"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -35, y: 52 }, { x: 35, y: 52 }],
    });
    settle(toward);
    toward.step([
      createEmptyInput(),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    let towardStun = 0;
    for (let frame = 0; frame < 35; frame += 1) {
      const snapshot = toward.step(idlePair());
      towardStun = Math.max(towardStun, snapshot.fighters[0].hitstunFrames);
    }
    expect(towardStun).toBeGreaterThanOrEqual(60);

    const away = createGame(config("mario", "mewtwo"), {
      countdownFrames: 0,
      spawnPositions: [{ x: -20, y: 52 }, { x: 35, y: 52 }],
    });
    settle(away);
    away.step([
      input({ held: ["left"], pressed: ["left"], direction: { x: -1, y: 0 } }),
      createEmptyInput(),
    ]);
    for (let frame = 0; frame < 6; frame += 1) {
      away.step([input({ held: ["left"], direction: { x: -1, y: 0 } }), createEmptyInput()]);
    }
    away.step([
      createEmptyInput(),
      input({ held: ["down", "special"], pressed: ["down", "special"], direction: { x: 0, y: -1 } }),
    ]);
    let awayStun = 0;
    for (let frame = 0; frame < 35; frame += 1) {
      const snapshot = away.step(idlePair());
      awayStun = Math.max(awayStun, snapshot.fighters[0].hitstunFrames);
    }
    expect(awayStun).toBe(0);
  });

  it("rolls Mr. Game & Watch's Judge deterministically across several power levels", () => {
    const damages = [
      0xc0ffee,
      0x12345678,
      0x9abcdef0,
      0xdeadbeef,
      0x0badf00d,
      0x76543210,
    ].map((seed) => {
      const game = createGame(config("mr-game-and-watch", "mario"), {
        seed,
        countdownFrames: 0,
        spawnPositions: [{ x: -50, y: 52 }, { x: 50, y: 52 }],
      });
      settle(game);
      game.step([
        input({ held: ["right", "special"], pressed: ["right", "special"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
      let snapshot = game.getSnapshot();
      for (let frame = 0; frame < 35 && snapshot.fighters[1].percent === 0; frame += 1) {
        snapshot = game.step(idlePair());
      }
      return snapshot.fighters[1].percent;
    });

    expect(damages.every((damage) => damage >= 2 && damage <= 32)).toBe(true);
    expect(new Set(damages).size).toBeGreaterThan(2);

    const replay = createGame(config("mr-game-and-watch", "mario"), {
      seed: 0xc0ffee,
      countdownFrames: 0,
      spawnPositions: [{ x: -50, y: 52 }, { x: 50, y: 52 }],
    });
    settle(replay);
    replay.step([
      input({ held: ["right", "special"], pressed: ["right", "special"], direction: { x: 1, y: 0 } }),
      createEmptyInput(),
    ]);
    let replaySnapshot = replay.getSnapshot();
    for (let frame = 0; frame < 35 && replaySnapshot.fighters[1].percent === 0; frame += 1) {
      replaySnapshot = replay.step(idlePair());
    }
    expect(replaySnapshot.fighters[1].percent).toBe(damages[0]);
  });

  it("makes Green Missile's misfire deterministic and significantly faster", () => {
    const launchSpeed = (seed: number): number => {
      const game = createGame(config("luigi", "mario"), {
        seed,
        countdownFrames: 0,
        spawnPositions: [{ x: -400, y: 240 }, { x: 500, y: 80 }],
      });
      game.step([
        input({ held: ["right"], pressed: ["right", "special"], direction: { x: 1, y: 0 } }),
        createEmptyInput(),
      ]);
      let maximum = 0;
      for (let frame = 0; frame < 30; frame += 1) {
        const snapshot = game.step([
          input({ held: ["right"], direction: { x: 1, y: 0 } }),
          createEmptyInput(),
        ]);
        maximum = Math.max(maximum, snapshot.fighters[0].velocity.x);
      }
      return maximum;
    };

    const normal = launchSpeed(0xc0ffee);
    const misfire = launchSpeed(800);
    expect(normal).toBeGreaterThan(600);
    expect(misfire).toBeGreaterThan(normal * 1.65);
    expect(launchSpeed(800)).toBe(misfire);
  });

  it("removes a stock and emits a KO when crossing the blast zone", () => {
    const game = createGame(config(), {
      countdownFrames: 0,
      spawnPositions: [
        { x: 1_365, y: 120 },
        { x: 0, y: 52 },
      ],
    });
    const snapshot = game.step(idlePair());
    expect(snapshot.fighters[0].stocks).toBe(2);
    expect(snapshot.fighters[0].state).toBe("ko");
    expect(snapshot.events.some((event) => event.type === "ko" && event.slot === 0)).toBe(true);
  });

  it("spawns the projectiles defined by the roster's special moves", () => {
    const game = createGame(config("mario", "donkey-kong"), {
      countdownFrames: 0,
      spawnPositions: [
        { x: -210, y: 52 },
        { x: 300, y: 58 },
      ],
    });
    settle(game);
    game.step([input({ pressed: ["special"] }), createEmptyInput()]);
    const events: GameEvent[] = [];
    for (let frame = 0; frame < 18; frame += 1) {
      const snapshot = game.step(idlePair());
      events.push(...snapshot.events);
    }
    const snapshot = game.getSnapshot();
    expect(snapshot.projectiles.some((projectile) => projectile.kind === "fireball")).toBe(true);
    expect(events.some((event) =>
      event.type === "projectile" &&
      event.slot === 0 &&
      event.projectileKind === "fireball" &&
      typeof event.entityId === "number"
    )).toBe(true);
  });
});
