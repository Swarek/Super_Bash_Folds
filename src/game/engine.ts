import type {
  ActionName,
  FighterId,
  InputFrame,
  MatchConfig,
  MatchResult,
  PlayerSlot,
  StageId,
} from "./contracts";
import {
  EXACT_MODEL_TO_BODY_HEIGHT_RATIO,
  MELEE_HORIZONTAL_WORLD_SCALE,
  MELEE_VERTICAL_WORLD_SCALE,
  getFighterDefinition,
  type AttackHitboxDefinition,
  type AttackDefinition,
  type FighterDefinition,
  type MoveName,
  type ProjectileDefinition,
  type ThrowName,
  type Vec2,
} from "./roster";
import { getStageDefinition, stageSurfaceYAt } from "./stages";
import {
  ITEM_DEFINITIONS,
  ITEM_KINDS,
  isAutomaticItem,
  type ItemKind,
} from "./items";

export const FIXED_DT = 1 / 60;
export const FIXED_DT_MS = 1_000 / 60;
export const COUNTDOWN_FRAMES = 240;
/** Tiny browser leniency; Melee deliberately has no generous universal buffer. */
export const INPUT_BUFFER_FRAMES = 2;
/** A jump pressed near the end of recovery should come out on the first legal frame. */
export const JUMP_INPUT_BUFFER_FRAMES = 6;
/** Shield must answer through short recovery gaps as reliably as jump. */
export const SHIELD_INPUT_BUFFER_FRAMES = 5;
/** Human key presses rarely land in the exact same 16.7 ms simulation tick. */
export const SMASH_CHORD_GRACE_FRAMES = 4;
export const MAX_RESPONSIVE_JUMP_SQUAT_FRAMES = 4;
/** A quick tap may end just after takeoff and should still produce a short hop. */
export const SHORT_HOP_RELEASE_GRACE_FRAMES = 4;
export const GROUND_RUN_SPEED_MULTIPLIER = 0.92;
export const AIR_DODGE_VELOCITY_RETENTION = 0.86;
export const AIR_DODGE_SPEED_MULTIPLIER = 1.9;
export const L_CANCEL_WINDOW_FRAMES = 7;
export const FAST_FALL_BUFFER_FRAMES = 3;
export const WAVEDASH_LANDING_LAG_FRAMES = 10;
export const GROUND_TO_AIR_MOMENTUM = 0.8;
/** Keyboard is digital: ramp into Melee top speed instead of teleporting to it. */
export const DIGITAL_DASH_IMPULSE_MULTIPLIER = 0.42;
/** Neutral stick/key release must stop a fighter before a short tap crosses the stage. */
export const GROUND_RELEASE_BRAKE_MULTIPLIER = 4;
/** Opposite input must win quickly without erasing character-specific top speeds. */
export const GROUND_REVERSAL_ACCELERATION_MULTIPLIER = 2.25;
/** Grounded attacks keep their commitment without carrying run momentum across the stage. */
export const GROUND_ATTACK_BRAKE_MULTIPLIER = 3;
/** Landing knockback keeps weight, then loses its excess speed before the ledge. */
export const GROUND_HITSTUN_BRAKE_MULTIPLIER = 3.2;
export const GROUND_HITSTUN_LANDING_VELOCITY_RETENTION = 0.7;
export const GROUND_HITSTUN_EDGE_VELOCITY_RETENTION = 0.42;
/** Movement may resume shortly after the hitbox ends; attacking stays locked for the authored endlag. */
export const ATTACK_MOBILITY_RECOVERY_FRAMES = 3;
/** Accessibility floors derived from Battlefield's 164u / 329u platform gaps. */
export const MIN_FULL_HOP_RISE = 185;
export const MIN_DOUBLE_JUMP_RISE = 165;
/** Fire Fox-style launches need a short sustained travel window, not a one-frame impulse. */
export const DIRECTIONAL_LAUNCH_SUSTAIN_FRAMES = 14;
export const DIRECTIONAL_LAUNCH_EXIT_VELOCITY_RETENTION = 0.35;
/** Melee-style defensive movement during hitlag, scaled to roughly 10% of a body width. */
export const SDI_DISTANCE = 6;
export const ASDI_DISTANCE = 3;
export const TECH_INPUT_WINDOW_FRAMES = 20;
export const TECH_INPUT_LOCKOUT_FRAMES = 40;
export const TECH_NEUTRAL_FRAMES = 26;
export const TECH_INVULNERABLE_FRAMES = 20;
/** Melee enters tumble at 80 units of knockback; only tumble impacts are techable. */
export const MELEE_TUMBLE_KNOCKBACK_THRESHOLD = 80;
export const SHIELD_DROP_THRESHOLD = -0.55;
/** Repeating one move can confirm once, but cannot create an indefinite hitstun lock. */
export const SAME_MOVE_LOCK_BREAK_HIT = 2;
/** Defensive specials should work around the authored active frames, not on one exact tick. */
export const DEFENSIVE_MOVE_STARTUP_GRACE_FRAMES = 4;
export const DEFENSIVE_MOVE_END_GRACE_FRAMES = 5;
/** A ledge cannot be stalled indefinitely: ten seconds at the 60 Hz simulation rate. */
export const LEDGE_MAX_HANG_FRAMES = 600;
/** Extra reach keeps near-miss recoveries from turning into accidental landings or KOs. */
export const LEDGE_HORIZONTAL_CATCH_BONUS = 64;
export const LEDGE_VERTICAL_CATCH_BONUS = 72;
/** Returning projectiles curve back instead of snapping to a new vector in one frame. */
export const PROJECTILE_RETURN_TURN_RATE = 42;
/** Ordinary shots remain relevant longer without changing their authored speed. */
export const STANDARD_PROJECTILE_LIFETIME_MULTIPLIER = 1.25;

const BUFFERABLE_ACTIONS = ["jump", "attack", "special", "grab", "shield"] as const;
type BufferableAction = (typeof BUFFERABLE_ACTIONS)[number];
const AERIAL_NORMALS = new Set<MoveName>([
  "neutral-air",
  "forward-air",
  "back-air",
  "up-air",
  "down-air",
]);
const COMBO_STARTER_NORMALS = new Set<MoveName>(["jab", "up-tilt", "down-tilt"]);
export const SAME_MOVE_LOCK_BREAK_LAUNCH_MULTIPLIER = 1.45;
export const MELEE_CLANK_DAMAGE_WINDOW = 9;

export const defensiveMoveActiveAtFrame = (
  frame: number,
  move: Pick<AttackDefinition, "startup" | "active" | "counters" | "absorbsProjectiles" | "reflectsProjectiles">,
): boolean => {
  if (!move.counters && !move.absorbsProjectiles && !move.reflectsProjectiles) return false;
  const firstFrame = Math.max(0, move.startup - DEFENSIVE_MOVE_STARTUP_GRACE_FRAMES);
  const lastFrameExclusive = move.startup + move.active + DEFENSIVE_MOVE_END_GRACE_FRAMES;
  return frame >= firstFrame && frame < lastFrameExclusive;
};

export const effectiveProjectileLifetime = (
  definition: ProjectileDefinition,
): number => {
  const mechanicallyTimed = Boolean(
    definition.returns ||
    definition.controlledByOwner ||
    definition.ownerDischargeRadius ||
    definition.manualDetonation ||
    definition.restsOnGround ||
    definition.kind === "fire-breath" ||
    definition.kind === "ground-wave"
  );
  return mechanicallyTimed
    ? definition.lifetimeFrames
    : Math.round(definition.lifetimeFrames * STANDARD_PROJECTILE_LIFETIME_MULTIPLIER);
};

/** Keep starters close at low percent, then restore their authored base force. */
export const comboStarterBaseKnockbackScale = (
  move: MoveName,
  percent: number,
): number => COMBO_STARTER_NORMALS.has(move)
  ? 0.76 + Math.min(1, Math.max(0, percent) / 80) * 0.24
  : 1;

export interface ActiveMeleeHitbox {
  offset: Vec2;
  radius: number;
  damageMultiplier: number;
  knockbackMultiplier: number;
  priority: number;
  kind: "sweet" | "normal" | "sour";
}

const activeAuthoredHitboxes = (
  hitboxes: readonly AttackHitboxDefinition[],
  activeFrame: number,
): ActiveMeleeHitbox[] => hitboxes.flatMap((hitbox) => {
  const start = Math.max(0, hitbox.activeStart ?? 0);
  const end = Math.max(start, hitbox.activeEnd ?? Number.POSITIVE_INFINITY);
  if (activeFrame < start || activeFrame > end) return [];
  const duration = Number.isFinite(end) ? Math.max(1, end - start) : 1;
  const progress = clamp((activeFrame - start) / duration, 0, 1);
  const endOffset = hitbox.endOffset ?? hitbox.offset;
  return [{
    offset: {
      x: hitbox.offset.x + (endOffset.x - hitbox.offset.x) * progress,
      y: hitbox.offset.y + (endOffset.y - hitbox.offset.y) * progress,
    },
    radius: Math.max(4, hitbox.radius),
    damageMultiplier: hitbox.damageMultiplier ?? 1,
    knockbackMultiplier: hitbox.knockbackMultiplier ?? 1,
    priority: hitbox.priority ?? 1,
    kind: hitbox.kind ?? "normal",
  }];
});

/**
 * Compact competitive defaults: several small bubbles describe a limb or
 * weapon instead of one oversized circle. The active-frame motion gives fast
 * swings continuous coverage without granting a large permanent blind-zone.
 */
export const competitiveHitboxesForMove = (
  moveName: MoveName,
  move: Pick<AttackDefinition, "active" | "radius" | "offset" | "hitboxes">,
  activeFrame: number,
): ActiveMeleeHitbox[] => {
  if (move.hitboxes?.length) return activeAuthoredHitboxes(move.hitboxes, activeFrame);

  const progress = move.active <= 1
    ? 1
    : clamp(activeFrame / Math.max(1, move.active - 1), 0, 1);
  const extension = 0.84 + Math.sin(progress * Math.PI) * 0.16;
  const x = move.offset.x;
  const y = move.offset.y;
  const radius = (scale: number): number => Math.max(7, move.radius * scale);
  const zone = (
    offsetX: number,
    offsetY: number,
    radiusScale: number,
    damageMultiplier = 1,
    knockbackMultiplier = 1,
    priority = 1,
    kind: ActiveMeleeHitbox["kind"] = "normal",
  ): ActiveMeleeHitbox => ({
    offset: { x: offsetX, y: offsetY },
    radius: radius(radiusScale),
    damageMultiplier,
    knockbackMultiplier,
    priority,
    kind,
  });
  const line = (
    reachX: number,
    reachY: number,
    innerScale: number,
    outerScale: number,
    tipDamage = 1.03,
    tipKnockback = 1.04,
  ): ActiveMeleeHitbox[] => [
    zone(reachX * 0.42, reachY * 0.42, innerScale, 0.94, 0.94, 3, "sour"),
    zone(reachX * 0.72, reachY * 0.72, (innerScale + outerScale) / 2, 1, 1, 2),
    zone(reachX, reachY, outerScale, tipDamage, tipKnockback, 1, "sweet"),
  ];

  switch (moveName) {
    case "jab":
      // Jabs must connect at close neutral spacing, but their narrow chain no
      // longer catches opponents far above or below the attacking limb.
      return line(x * 1.12, y, 0.4, 0.55, 1, 1);
    case "dash-attack":
      return [
        zone(x * 0.35, y, 0.46, 0.9, 0.9, 3, "sour"),
        zone(x * 0.75 * extension, y, 0.48, 1, 1, 2),
        zone(x * extension, y, 0.4, 1.04, 1.04, 1, "sweet"),
      ];
    case "forward-tilt":
      return line(x * extension, y, 0.4, 0.38);
    case "down-tilt":
      return line(x * extension, y, 0.38, 0.34, 1.02, 1.02);
    case "forward-smash":
      return line(x * extension * 1.08, y, 0.5, 0.47, 1.08, 1.1);
    case "up-tilt":
    case "up-smash": {
      const sweepX = x + (progress - 0.5) * Math.abs(y) * 0.72;
      const reachY = y * extension;
      const smash = moveName === "up-smash";
      return line(
        sweepX,
        reachY,
        smash ? 0.5 : 0.4,
        smash ? 0.47 : 0.38,
        smash ? 1.08 : 1.03,
        smash ? 1.1 : 1.04,
      );
    }
    case "down-smash": {
      const reach = Math.max(Math.abs(x), move.radius * 1.02) * extension;
      const front = progress <= 0.68
        ? line(reach, y, 0.48, 0.44, 1.06, 1.08)
        : [];
      const back = progress >= 0.32
        ? line(-reach, y, 0.46, 0.42, 1.03, 1.05)
        : [];
      return [...front, ...back];
    }
    case "neutral-air": {
      const early = progress <= 0.34;
      const damage = early ? 1.04 : 0.82;
      const knockback = early ? 1.04 : 0.84;
      const kind: ActiveMeleeHitbox["kind"] = early ? "sweet" : "sour";
      return [
        zone(0, y * 0.35, 0.5, damage, knockback, 3, kind),
        zone(move.radius * 0.48, y, 0.38, damage, knockback, 2, kind),
        zone(-move.radius * 0.48, y, 0.38, damage, knockback, 2, kind),
      ];
    }
    case "forward-air":
    case "back-air": {
      const early = progress <= 0.45;
      return line(
        x * extension,
        y,
        0.44,
        0.4,
        early ? 1.06 : 0.9,
        early ? 1.08 : 0.9,
      );
    }
    case "up-air": {
      const sweepX = x + (progress - 0.5) * Math.abs(y) * 0.62;
      return line(sweepX, y * extension, 0.42, 0.38, 1.04, 1.05);
    }
    case "down-air": {
      const early = progress <= 0.42;
      return line(
        x,
        y * extension,
        0.43,
        0.39,
        early ? 1.06 : 0.88,
        early ? 1.1 : 0.86,
      );
    }
    default:
      return [zone(x, y, 0.86)];
  }
};

export type MeleeClankOutcome = "both" | "first" | "second";

export const meleeClankOutcome = (
  firstDamage: number,
  secondDamage: number,
): MeleeClankOutcome => {
  const difference = firstDamage - secondDamage;
  if (Math.abs(difference) <= MELEE_CLANK_DAMAGE_WINDOW) return "both";
  return difference < 0 ? "first" : "second";
};

export const meleeClankReboundFrames = (strongerDamage: number): number =>
  Math.ceil(0.559 * (Math.max(0, strongerDamage) + 10));

export type InputPair = [InputFrame, InputFrame];
export type MatchPhase = "countdown" | "playing" | "finished";
export type FighterState =
  | "entrance"
  | "idle"
  | "crouch"
  | "walk"
  | "turn"
  | "dash"
  | "run"
  | "jump-squat"
  | "jump"
  | "fall"
  | "attack"
  | "shield"
  | "dodge"
  | "grab"
  | "grabbed"
  | "hitstun"
  | "ledge"
  | "ko"
  | "respawn"
  | "taunt"
  | "victory";

export interface PlatformSnapshot {
  id: string;
  /** Center coordinates; x/y aliases keep renderer math terse. */
  x: number;
  y: number;
  position: Vec2;
  width: number;
  height: number;
  kind: "ground" | "platform";
  surfaceY?: readonly [number, number];
}

export interface StageLedgeSnapshot {
  platformId: string;
  side: "left" | "right";
  position: Vec2;
}

export interface StageSnapshot {
  id: StageId;
  platforms: readonly PlatformSnapshot[];
  ledges: readonly StageLedgeSnapshot[];
  blastZone: { left: number; right: number; top: number; bottom: number };
}

export interface FighterSnapshot {
  slot: PlayerSlot;
  fighter: FighterId;
  skin: import("./contracts").SkinId;
  name: string;
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  percent: number;
  stocks: number;
  state: FighterState;
  grounded: boolean;
  fastFalling: boolean;
  jumpsRemaining: number;
  shield: number;
  maxShield: number;
  invulnerableFrames: number;
  currentMove: MoveName | null;
  moveFrame: number;
  specialPhase: "startup" | "active" | "recovery" | "landing" | null;
  visualRotation: number;
  hitstunFrames: number;
  statusEffect?: "sleep" | "stun" | "bury" | null;
  respawnFrames: number;
  charge: number;
  grabTarget: PlayerSlot | null;
  grabbedBy: PlayerSlot | null;
  grabFrames: number;
  dodgeKind: "spot" | "forward" | "back" | "air" | null;
  throwAnimation: ThrowName | null;
  ledge: "left" | "right" | null;
  size: { width: number; height: number };
  heldItem: { kind: ItemKind; charges: number } | null;
  itemAction: "pickup" | "attack" | null;
  activeEffects: {
    damageMultiplier: number;
    speedMultiplier: number;
    jumpMultiplier: number;
    defenseMultiplier: number;
    projectileShieldFrames: number;
  };
}

export interface ProjectileSnapshot {
  id: number;
  owner: PlayerSlot;
  kind: ProjectileDefinition["kind"];
  position: Vec2;
  velocity: Vec2;
  radius: number;
  remainingFrames: number;
  rotation: number;
}

export interface ItemSnapshot {
  id: number;
  kind: ItemKind;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  mode: "world" | "thrown" | "trap";
  owner: PlayerSlot | null;
}

export type GameEventType =
  | "countdown"
  | "match-start"
  | "attack"
  | "attack-active"
  | "jump"
  | "land"
  | "hit"
  | "shield-hit"
  | "clank"
  | "shield-break"
  | "dodge"
  | "ledge"
  | "taunt"
  | "grab"
  | "throw"
  | "projectile"
  | "item-spawn"
  | "item-pickup"
  | "item-use"
  | "ko"
  | "respawn"
  | "sudden-death"
  | "match-end";

export interface GameEvent {
  type: GameEventType;
  frame: number;
  slot?: PlayerSlot;
  target?: PlayerSlot;
  position?: Vec2;
  move?: MoveName;
  item?: ItemKind;
  value?: number;
  /** Damage alias used by visual/audio feedback consumers. */
  damage?: number;
  /** Factual gameplay source used by audio and visual feedback. */
  source?: "melee" | "projectile" | "throw" | "item";
  /** Resulting launch velocity after DI, when the event moves a fighter. */
  velocity?: Vec2;
  /** Downward speed immediately before a landing collision. */
  impactSpeed?: number;
  projectileKind?: ProjectileDefinition["kind"];
  entityId?: number;
  lCancelled?: boolean;
  wavedash?: boolean;
  techKind?: "neutral" | "roll-left" | "roll-right" | "wall-left" | "wall-right" | "ceiling";
  winner?: PlayerSlot;
  sound?: string;
}

export interface GameSnapshot {
  frame: number;
  elapsedMs: number;
  remainingTimeMs: number | null;
  suddenDeath: boolean;
  phase: MatchPhase;
  countdownFrames: number;
  fighters: [FighterSnapshot, FighterSnapshot];
  projectiles: readonly ProjectileSnapshot[];
  items: readonly ItemSnapshot[];
  stage: StageSnapshot;
  winner: PlayerSlot | null;
  result: MatchResult | null;
  events: readonly GameEvent[];
}

export interface GameOptions {
  seed?: number;
  countdownFrames?: number;
  spawnPositions?: [Vec2, Vec2];
}

interface ActiveMove {
  name: MoveName;
  frame: number;
  chargeFrames: number;
  charging: boolean;
  spawnedProjectile: boolean;
  hitTargets: Set<PlayerSlot>;
  lastHitFrame: Map<PlayerSlot, number>;
  hitCounts: Map<PlayerSlot, number>;
  startedGrounded: boolean;
  startedSupportPlatform: string | null;
  specialPhase: "startup" | "active" | "recovery" | "landing" | null;
  lastSpecialDirection: Vec2 | null;
  appliedSelfDamage: boolean;
  specialVariant: number | null;
  specialStoredDamage: number;
}

interface FighterRuntime {
  slot: PlayerSlot;
  fighter: FighterId;
  skin: import("./contracts").SkinId;
  name: string;
  cpu: boolean;
  definition: FighterDefinition;
  position: Vec2;
  previousPosition: Vec2;
  /** Player/authored movement in world-units per second. */
  velocity: Vec2;
  /** Knockback in Melee character-units per frame, decayed independently. */
  launchVelocity: Vec2;
  facing: -1 | 1;
  percent: number;
  stocks: number;
  state: FighterState;
  grounded: boolean;
  supportPlatform: string | null;
  jumpsRemaining: number;
  fastFalling: boolean;
  fastFallInputFrames: number;
  floatFramesRemaining: number;
  floating: boolean;
  airUpSpecialUsed: boolean;
  airDodgeUsed: boolean;
  airDodgeHelpless: boolean;
  analogRunning: boolean;
  coyoteFrames: number;
  bufferedAction: BufferableAction | null;
  bufferedDirection: Vec2;
  bufferedDirectionAction: ActionName | null;
  bufferedActionFrames: number;
  smashDirection: Vec2;
  smashDirectionAction: ActionName | null;
  smashDirectionFrames: number;
  dropThroughFrames: number;
  shield: number;
  shieldLockFrames: number;
  shieldStunFrames: number;
  invulnerableFrames: number;
  hitstopFrames: number;
  hitstopElapsedFrames: number;
  hitstunFrames: number;
  launchBaseAngle: number | null;
  pendingHitstopDi: Vec2 | null;
  sdiRegion: number | null;
  asdiDirection: Vec2 | null;
  techWindowFrames: number;
  techLockoutFrames: number;
  techable: boolean;
  statusEffect: "sleep" | "stun" | "bury" | null;
  statusResistanceFrames: number;
  lastHitMove: MoveName | null;
  consecutiveHitMoveCount: number;
  dodgeFrames: number;
  dodgeKind: "spot" | "forward" | "back" | "air" | null;
  jumpSquatFrames: number;
  fullHopRequested: boolean;
  shortHopReleaseFrames: number;
  landingLagFrames: number;
  wavedashFrames: number;
  lCancelFrames: number;
  dashFrames: number;
  turnFrames: number;
  tauntFrames: number;
  attackLockFrames: number;
  action: ActiveMove | null;
  grabTarget: PlayerSlot | null;
  grabbedBy: PlayerSlot | null;
  grabFrames: number;
  throwAnimation: ThrowName | null;
  respawnFrames: number;
  ledge: "left" | "right" | null;
  ledgeCooldownFrames: number;
  ledgeHangFrames: number;
  /** True once climb directions held during ledge catch have returned to neutral. */
  ledgeDirectionReleased: boolean;
  lastHitBy: PlayerSlot | null;
  lastHitFrames: number;
  damageMultiplier: number;
  damageBuffFrames: number;
  speedMultiplier: number;
  speedBuffFrames: number;
  jumpMultiplier: number;
  jumpBuffFrames: number;
  defenseMultiplier: number;
  defenseBuffFrames: number;
  projectileShieldFrames: number;
  heldItem: { kind: ItemKind; charges: number } | null;
  itemUseFrames: number;
  itemAction: "pickup" | "attack" | null;
  storedCharges: Partial<Record<MoveName, number>>;
  absorbedEnergy: number;
}

export const effectiveJumpSquatFrames = (authoredFrames: number): number =>
  Math.min(MAX_RESPONSIVE_JUMP_SQUAT_FRAMES, Math.max(1, authoredFrames));

/**
 * Compensate for semi-implicit 60 Hz gravity while preserving authored jumps
 * that already clear the requested height. This floor is used only for full
 * hops and double jumps; short hops retain their exact authored impulse.
 */
export const jumpSpeedForMinimumRise = (
  authoredSpeed: number,
  gravity: number,
  minimumRise: number,
): number => Math.max(
  authoredSpeed,
  Math.sqrt(2 * gravity * minimumRise) + gravity * FIXED_DT * 0.5,
);

/** Melee converts knockback units to launch speed in character-units per frame. */
export const MELEE_LAUNCH_SPEED_MULTIPLIER = 0.03;
/** Launch speed loses exactly this magnitude every 60 Hz simulation frame. */
export const MELEE_LAUNCH_SPEED_DECAY_PER_FRAME = 0.051;
/** Melee hitstun is the floored product of knockback and this ratio. */
export const MELEE_HITSTUN_PER_KNOCKBACK = 0.4;

export interface MeleeKnockbackParameters {
  postHitPercent: number;
  damage: number;
  weight: number;
  baseKnockback: number;
  knockbackGrowth: number;
  ratio?: number;
}

/**
 * The standard Melee knockback equation. `knockbackGrowth` is expressed as a
 * ratio in fighter data (`0.8` = 80 KBG), matching the rest of this engine.
 */
export const calculateMeleeKnockback = ({
  postHitPercent,
  damage,
  weight,
  baseKnockback,
  knockbackGrowth,
  ratio = 1,
}: MeleeKnockbackParameters): number => {
  const percent = Math.max(0, postHitPercent);
  const hitDamage = Math.max(0, damage);
  const targetWeight = Math.max(1, weight);
  return Math.max(
    0,
    (
      (
        (percent / 10 + percent * hitDamage / 20) *
          200 / (targetWeight + 100) * 1.4 +
        18
      ) * Math.max(0, knockbackGrowth) +
      Math.max(0, baseKnockback)
    ) * Math.max(0, ratio),
  );
};

export const meleeHitstunFrames = (knockback: number): number =>
  Math.floor(Math.max(0, knockback) * MELEE_HITSTUN_PER_KNOCKBACK);

export const meleeLaunchVelocity = (knockback: number, angleDegrees: number): Vec2 => {
  const speed = Math.max(0, knockback) * MELEE_LAUNCH_SPEED_MULTIPLIER;
  const radians = angleDegrees * Math.PI / 180;
  return {
    x: Math.cos(radians) * speed,
    y: Math.sin(radians) * speed,
  };
};

/** Converts Melee character-units/frame into this game's world-units/second. */
export const meleeLaunchVelocityToWorld = (velocity: Vec2): Vec2 => ({
  x: velocity.x * MELEE_HORIZONTAL_WORLD_SCALE * 60,
  y: velocity.y * MELEE_VERTICAL_WORLD_SCALE * 60,
});

export const decayMeleeLaunchVelocity = (velocity: Vec2): Vec2 => {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= MELEE_LAUNCH_SPEED_DECAY_PER_FRAME) return { x: 0, y: 0 };
  const retained = (speed - MELEE_LAUNCH_SPEED_DECAY_PER_FRAME) / speed;
  return { x: velocity.x * retained, y: velocity.y * retained };
};

interface ProjectileRuntime extends ProjectileSnapshot {
  definition: ProjectileDefinition;
  move: MoveName;
  attack: AttackDefinition;
  age: number;
  bouncesRemaining: number;
  hitTargets: Set<PlayerSlot>;
  hitCounts: Map<PlayerSlot, number>;
  lastHitFrame: Map<PlayerSlot, number>;
  returning: boolean;
  powerScale: number;
  detonating: boolean;
}

interface ItemRuntime extends ItemSnapshot {
  age: number;
  grounded: boolean;
  supportPlatform: string | null;
}

export function createEmptyInput(): InputFrame {
  return {
    held: new Set(),
    pressed: new Set(),
    released: new Set(),
    direction: { x: 0, y: 0 },
  };
}

export const EMPTY_INPUT: InputFrame = Object.freeze(createEmptyInput()) as InputFrame;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const sampleRootMotion = (
  samples: readonly (readonly [forward: number, vertical: number])[],
  progress: number,
): Vec2 => {
  if (samples.length === 0) return { x: 0, y: 0 };
  const cursor = clamp(progress, 0, 1) * (samples.length - 1);
  const lower = Math.floor(cursor);
  const upper = Math.min(samples.length - 1, lower + 1);
  const blend = cursor - lower;
  const lowerSample = samples[lower] ?? samples[0]!;
  const upperSample = samples[upper] ?? lowerSample;
  return {
    x: lowerSample[0] + (upperSample[0] - lowerSample[0]) * blend,
    y: lowerSample[1] + (upperSample[1] - lowerSample[1]) * blend,
  };
};

const specialVisualRotation = (fighter: FighterRuntime): number => {
  const action = fighter.action;
  if (!action) return 0;
  const behavior = fighter.definition.attacks[action.name].specialMovement;
  if (
    !behavior ||
    (behavior.kind !== "directional-launch" && behavior.kind !== "directional-bursts") ||
    !behavior.rotateWithDirection
  ) return 0;
  const direction = action.lastSpecialDirection;
  if (!direction) return 0;
  const magnitude = Math.hypot(direction.x, direction.y);
  if (magnitude <= 0.01) return 0;
  return Math.atan2(
    -direction.y / magnitude,
    direction.x / magnitude * fighter.facing,
  );
};

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) return Math.min(value + amount, target);
  if (value > target) return Math.max(value - amount, target);
  return value;
};

const distanceSquared = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export interface FighterHurtboxProfile {
  radius: number;
  halfHeight: number;
  centerOffsetY: number;
}

/** The shared standing/crouching capsule contract used by combat and the Lab. */
export const fighterHurtboxProfile = (
  size: Readonly<{ width: number; height: number }>,
  state: FighterState,
): FighterHurtboxProfile => {
  const standingHalfHeight = size.height * 0.48;
  const halfHeight = state === "crouch"
    ? standingHalfHeight * 0.68
    : standingHalfHeight;
  return {
    radius: Math.min(Math.max(size.width, size.height) * 0.34, halfHeight),
    halfHeight,
    centerOffsetY: -standingHalfHeight + halfHeight,
  };
};

/** Circle-vs-capsule hurtbox shared by attacks, projectiles and thrown items. */
const circleIntersectsFighter = (
  fighter: Pick<FighterRuntime, "position" | "definition" | "state" | "statusEffect">,
  circle: Vec2,
  circleRadius: number,
): boolean => {
  const { radius, halfHeight, centerOffsetY } = fighterHurtboxProfile(
    fighter.definition.size,
    fighter.statusEffect === "bury" ? "crouch" : fighter.state,
  );
  const centerY = fighter.position.y + centerOffsetY;
  const segmentHalfHeight = Math.max(0, halfHeight - radius);
  const dx = circle.x - fighter.position.x;
  const dy = Math.max(0, Math.abs(circle.y - centerY) - segmentHalfHeight);
  return dx * dx + dy * dy <= (circleRadius + radius) ** 2;
};

const cloneVec = (value: Vec2): Vec2 => ({ x: value.x, y: value.y });

const slotOther = (slot: PlayerSlot): PlayerSlot => (slot === 0 ? 1 : 0);

const platformTop = (platform: PlatformSnapshot, worldX = platform.position.x): number =>
  stageSurfaceYAt(platform, worldX);

const platformBottom = (platform: PlatformSnapshot, worldX = platform.position.x): number =>
  platformTop(platform, worldX) - platform.height;

const platformLeft = (platform: PlatformSnapshot): number =>
  platform.position.x - platform.width / 2;

const platformRight = (platform: PlatformSnapshot): number =>
  platform.position.x + platform.width / 2;

const platformContainsX = (platform: PlatformSnapshot, worldX: number): boolean =>
  worldX >= platformLeft(platform) && worldX <= platformRight(platform);

type GroundCollisionFace = "bottom" | "left" | "right";

interface GroundCollisionCandidate {
  platform: PlatformSnapshot;
  face: GroundCollisionFace;
  time: number;
}

const crossingTime = (before: number, after: number): number | null => {
  const span = before - after;
  if (Math.abs(span) < 0.000_001) return null;
  const time = before / span;
  return time >= 0 && time <= 1 ? time : null;
};

const findGroundVolumeCollision = (
  platforms: readonly PlatformSnapshot[],
  previous: Vec2,
  current: Vec2,
  halfWidth: number,
  halfHeight: number,
  ignoredPlatformIds: ReadonlySet<string> = new Set(),
): GroundCollisionCandidate | null => {
  const deltaX = current.x - previous.x;
  const candidates: GroundCollisionCandidate[] = [];

  for (const platform of platforms) {
    if (platform.kind !== "ground" || ignoredPlatformIds.has(platform.id)) continue;

    const previousUnder = platformBottom(platform, previous.x) - (previous.y + halfHeight);
    const currentUnder = platformBottom(platform, current.x) - (current.y + halfHeight);
    if (previousUnder >= -3 && currentUnder <= 0) {
      const time = crossingTime(previousUnder, currentUnder);
      if (time !== null) {
        const xAtImpact = previous.x + deltaX * time;
        if (
          xAtImpact + halfWidth >= platformLeft(platform) &&
          xAtImpact - halfWidth <= platformRight(platform)
        ) {
          candidates.push({ platform, face: "bottom", time });
        }
      }
    }

    const checkSide = (face: "left" | "right"): void => {
      const edgeX = face === "left" ? platformLeft(platform) : platformRight(platform);
      const previousEdge =
        face === "left"
          ? edgeX - (previous.x + halfWidth)
          : previous.x - halfWidth - edgeX;
      const currentEdge =
        face === "left"
          ? edgeX - (current.x + halfWidth)
          : current.x - halfWidth - edgeX;
      if (previousEdge < -3 || currentEdge > 0) return;
      const time = crossingTime(previousEdge, currentEdge);
      if (time === null) return;
      const yAtImpact = previous.y + (current.y - previous.y) * time;
      const edgeTop = platformTop(platform, edgeX);
      const edgeBottom = platformBottom(platform, edgeX);
      if (yAtImpact + halfHeight <= edgeBottom || yAtImpact - halfHeight >= edgeTop) return;
      candidates.push({ platform, face, time });
    };

    if (deltaX > 0) checkSide("left");
    if (deltaX < 0) checkSide("right");
  }

  return candidates.sort((a, b) => a.time - b.time)[0] ?? null;
};

const normalizedDirection = (input: InputFrame): Vec2 => {
  const x = clamp(Number.isFinite(input.direction.x) ? input.direction.x : 0, -1, 1);
  const y = clamp(Number.isFinite(input.direction.y) ? input.direction.y : 0, -1, 1);
  const length = Math.hypot(x, y);
  if (length <= 1 || length === 0) return { x, y };
  return { x: x / length, y: y / length };
};

/** Eight-way stick region used to make SDI react to flicks instead of held directions. */
const sdiRegionForDirection = (direction: Vec2): number | null => {
  if (Math.hypot(direction.x, direction.y) < 0.5) return null;
  const octant = Math.round(Math.atan2(direction.y, direction.x) / (Math.PI / 4));
  return (octant + 8) % 8;
};

export const landingLagFramesForAttack = (attack: AttackDefinition): number =>
  clamp(Math.round(attack.recovery * 0.42), 6, 16);

const withoutEdges = (input: InputFrame): InputFrame => ({
  held: input.held,
  pressed: new Set(),
  released: new Set(),
  direction: input.direction,
  analog: input.analog,
});

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

export class CombatGame {
  readonly config: MatchConfig;

  private readonly options: Required<Pick<GameOptions, "seed" | "countdownFrames">> &
    Pick<GameOptions, "spawnPositions">;
  private readonly random: SeededRandom;
  private stage: StageSnapshot;
  private fighters!: [FighterRuntime, FighterRuntime];
  private projectiles: ProjectileRuntime[] = [];
  private items: ItemRuntime[] = [];
  private events: GameEvent[] = [];
  private frame = 0;
  private countdownFrames = 0;
  private phase: MatchPhase = "countdown";
  private winner: PlayerSlot | null = null;
  private result: MatchResult | null = null;
  private suddenDeath = false;
  private readonly timeLimitFrames: number | null;
  private kos: [number, number] = [0, 0];
  private nextEntityId = 1;
  private nextItemFrame = Number.POSITIVE_INFINITY;
  private accumulator = 0;

  constructor(config: MatchConfig, options: GameOptions | number = {}) {
    this.config = config;
    const normalizedOptions: GameOptions =
      typeof options === "number" ? { seed: options } : options;
    this.options = {
      seed: normalizedOptions.seed ?? 0xc0ffee,
      countdownFrames: Math.max(0, Math.round(normalizedOptions.countdownFrames ?? COUNTDOWN_FRAMES)),
      spawnPositions: normalizedOptions.spawnPositions,
    };
    const timeLimitSeconds = config.timeLimitSeconds;
    this.timeLimitFrames = typeof timeLimitSeconds === "number" && Number.isFinite(timeLimitSeconds) && timeLimitSeconds > 0
      ? Math.max(1, Math.round(timeLimitSeconds * 60))
      : null;
    this.random = new SeededRandom(this.options.seed);
    this.stage = this.createStage();
    this.initializeMatch();
  }

  step(inputs: InputPair): GameSnapshot {
    this.events = [];
    if (this.phase === "finished") return this.getSnapshot();

    this.frame += 1;
    if (this.phase === "countdown") {
      if (this.countdownFrames <= 180 && this.countdownFrames % 60 === 0) {
        this.emit({
          type: "countdown",
          value: Math.ceil(this.countdownFrames / 60),
          sound: "countdown",
        });
      }
      this.countdownFrames = Math.max(0, this.countdownFrames - 1);
      if (this.countdownFrames === 0) {
        this.phase = "playing";
        for (const fighter of this.fighters) {
          if (fighter.state === "entrance") fighter.state = "idle";
        }
        this.emit({ type: "match-start", sound: "announcer-go" });
      }
      return this.getSnapshot();
    }

    this.updateFighter(this.fighters[0], inputs[0], inputs);
    this.updateFighter(this.fighters[1], inputs[1], inputs);
    this.resolveFighterOverlap();
    this.resolveMeleeHits(inputs);
    this.updateProjectiles(inputs);
    this.updateItems(inputs);
    this.maybeSpawnItem();
    this.resolveKnockouts();
    if (this.phase === "playing") this.resolveTimeLimit();
    return this.getSnapshot();
  }

  /**
   * Convenience adapter for render loops. Simulation always advances in fixed
   * 1/60 s ticks; edge-triggered inputs are consumed only by the first tick.
   */
  advance(elapsedSeconds: number, inputs: InputPair): GameSnapshot {
    this.accumulator = Math.min(this.accumulator + Math.max(0, elapsedSeconds), FIXED_DT * 8);
    let firstTick = true;
    let snapshot = this.getSnapshot();
    const accumulatedEvents: GameEvent[] = [];
    while (this.accumulator >= FIXED_DT && this.phase !== "finished") {
      snapshot = this.step(
        firstTick ? inputs : [withoutEdges(inputs[0]), withoutEdges(inputs[1])],
      );
      accumulatedEvents.push(...snapshot.events);
      firstTick = false;
      this.accumulator -= FIXED_DT;
    }
    if (!firstTick) {
      this.events = accumulatedEvents;
      snapshot = this.getSnapshot();
    }
    return snapshot;
  }

  getSnapshot(): GameSnapshot {
    const playingFrames = this.playingFrames();
    return {
      frame: this.frame,
      elapsedMs: this.frame * FIXED_DT_MS,
      remainingTimeMs: this.timeLimitFrames === null || this.suddenDeath
        ? null
        : Math.max(0, this.timeLimitFrames - playingFrames) * FIXED_DT_MS,
      suddenDeath: this.suddenDeath,
      phase: this.phase,
      countdownFrames: this.countdownFrames,
      fighters: [this.snapshotFighter(this.fighters[0]), this.snapshotFighter(this.fighters[1])],
      projectiles: this.projectiles.map((projectile) => ({
        id: projectile.id,
        owner: projectile.owner,
        kind: projectile.kind,
        position: cloneVec(projectile.position),
        velocity: cloneVec(projectile.velocity),
        radius: projectile.radius,
        remainingFrames: projectile.remainingFrames,
        rotation: projectile.rotation,
      })),
      items: this.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        position: cloneVec(item.position),
        velocity: cloneVec(item.velocity),
        radius: item.radius,
        mode: item.mode,
        owner: item.owner,
      })),
      stage: {
        ...this.stage,
        platforms: this.stage.platforms.map((platform) => ({
          ...platform,
          position: cloneVec(platform.position),
        })),
        ledges: this.stage.ledges.map((ledge) => ({
          ...ledge,
          position: cloneVec(ledge.position),
        })),
        blastZone: { ...this.stage.blastZone },
      },
      winner: this.winner,
      result: this.result
        ? {
            winner: this.result.winner,
            durationMs: this.result.durationMs,
            kos: [...this.result.kos] as [number, number],
          }
        : null,
      events: this.events.map((event) => ({
        ...event,
        position: event.position ? cloneVec(event.position) : undefined,
      })),
    };
  }

  private fighterLaunchWorldVelocity(fighter: FighterRuntime): Vec2 {
    return meleeLaunchVelocityToWorld(fighter.launchVelocity);
  }

  private fighterWorldVelocity(fighter: FighterRuntime): Vec2 {
    const launch = this.fighterLaunchWorldVelocity(fighter);
    return {
      x: fighter.velocity.x + launch.x,
      y: fighter.velocity.y + launch.y,
    };
  }

  private clearLaunchVelocity(fighter: FighterRuntime): void {
    fighter.launchVelocity = { x: 0, y: 0 };
  }

  reset(): GameSnapshot {
    this.initializeMatch();
    return this.getSnapshot();
  }

  spawnItem(kind: ItemKind, position: Vec2, velocity: Vec2 = { x: 0, y: 0 }): number {
    const item: ItemRuntime = {
      id: this.nextEntityId,
      kind,
      position: cloneVec(position),
      velocity: cloneVec(velocity),
      radius: 24,
      mode: "world",
      owner: null,
      age: 0,
      grounded: false,
      supportPlatform: null,
    };
    this.nextEntityId += 1;
    this.items.push(item);
    this.emit({ type: "item-spawn", item: kind, position: cloneVec(position), sound: "item-spawn" });
    return item.id;
  }

  private initializeMatch(): void {
    this.frame = 0;
    this.countdownFrames = this.options.countdownFrames;
    this.phase = this.countdownFrames > 0 ? "countdown" : "playing";
    this.winner = null;
    this.result = null;
    this.suddenDeath = false;
    this.kos = [0, 0];
    this.nextEntityId = 1;
    this.projectiles = [];
    this.items = [];
    this.events = [];
    this.accumulator = 0;
    this.stage = this.createStage();
    const stageDefinition = getStageDefinition(this.config.stage);
    const usesAuthoredStageSpawns = this.options.spawnPositions === undefined;
    const spawns = this.options.spawnPositions ?? stageDefinition.spawns;
    this.fighters = [
      this.createFighter(0, spawns[0], usesAuthoredStageSpawns),
      this.createFighter(1, spawns[1], usesAuthoredStageSpawns),
    ];
    this.nextItemFrame = this.config.items ? this.itemIntervalFrames() : Number.POSITIVE_INFINITY;
  }

  private createStage(): StageSnapshot {
    const definition = getStageDefinition(this.config.stage);
    const platforms = definition.platforms.map((platform) => ({
      ...platform,
      position: { x: platform.x, y: platform.y },
    }));
    const main = platforms.find((platform) => platform.id === "main");
    if (!main) throw new Error(`Stage ${definition.id} has no main platform.`);
    const ledges = definition.ledges.map((ledge) => {
      const platform = platforms.find(({ id }) => id === ledge.platformId);
      if (!platform || platform.kind !== "ground") {
        throw new Error(
          `The ${ledge.side} ledge of ${definition.id} must reference a valid ground volume.`,
        );
      }
      const x = ledge.side === "left" ? platformLeft(platform) : platformRight(platform);
      return {
        ...ledge,
        position: { x, y: platformTop(platform, x) },
      };
    });
    return {
      id: definition.id,
      platforms,
      ledges,
      blastZone: { ...definition.blastZone },
    };
  }

  private mainPlatform(): PlatformSnapshot {
    const main = this.stage.platforms.find((platform) => platform.id === "main");
    if (!main) throw new Error(`Stage ${this.stage.id} has no main platform.`);
    return main;
  }

  private createFighter(
    slot: PlayerSlot,
    spawn: Vec2,
    placeOnAuthoredSurface = false,
  ): FighterRuntime {
    const setup = this.config.players[slot];
    const definition = getFighterDefinition(setup.fighter);
    const spawnSupport = placeOnAuthoredSurface
      ? this.stage.platforms
          .filter((platform) =>
            platformContainsX(platform, spawn.x) &&
            platformTop(platform, spawn.x) <= spawn.y + 4
          )
          .sort(
            (left, right) =>
              platformTop(right, spawn.x) - platformTop(left, spawn.x),
          )[0]
      : undefined;
    const position = spawnSupport
      ? {
          x: spawn.x,
          y: platformTop(spawnSupport, spawn.x) + definition.size.height / 2,
        }
      : cloneVec(spawn);
    return {
      slot,
      fighter: setup.fighter,
      skin: setup.skin,
      name: setup.name,
      cpu: setup.cpu,
      definition,
      position,
      previousPosition: cloneVec(position),
      velocity: { x: 0, y: 0 },
      launchVelocity: { x: 0, y: 0 },
      facing: slot === 0 ? 1 : -1,
      percent: 0,
      stocks: Math.max(1, Math.round(this.config.stocks)),
      state: this.phase === "countdown" ? "entrance" : spawnSupport ? "idle" : "fall",
      grounded: Boolean(spawnSupport),
      supportPlatform: spawnSupport?.id ?? null,
      jumpsRemaining: definition.maxJumps,
      fastFalling: false,
      fastFallInputFrames: 0,
      floatFramesRemaining: definition.floatDurationFrames ?? 0,
      floating: false,
      airUpSpecialUsed: false,
      airDodgeUsed: false,
      airDodgeHelpless: false,
      analogRunning: false,
      coyoteFrames: 0,
      bufferedAction: null,
      bufferedDirection: { x: 0, y: 0 },
      bufferedDirectionAction: null,
      bufferedActionFrames: 0,
      smashDirection: { x: 0, y: 0 },
      smashDirectionAction: null,
      smashDirectionFrames: 0,
      dropThroughFrames: 0,
      shield: definition.shieldHealth,
      shieldLockFrames: 0,
      shieldStunFrames: 0,
      invulnerableFrames: 0,
      hitstopFrames: 0,
      hitstopElapsedFrames: 0,
      hitstunFrames: 0,
      launchBaseAngle: null,
      pendingHitstopDi: null,
      sdiRegion: null,
      asdiDirection: null,
      techWindowFrames: 0,
      techLockoutFrames: 0,
      techable: false,
      statusEffect: null,
      statusResistanceFrames: 0,
      lastHitMove: null,
      consecutiveHitMoveCount: 0,
      dodgeFrames: 0,
      dodgeKind: null,
      jumpSquatFrames: 0,
      fullHopRequested: true,
      shortHopReleaseFrames: 0,
      landingLagFrames: 0,
      wavedashFrames: 0,
      lCancelFrames: 0,
      dashFrames: 0,
      turnFrames: 0,
      tauntFrames: 0,
      attackLockFrames: 0,
      action: null,
      grabTarget: null,
      grabbedBy: null,
      grabFrames: 0,
      throwAnimation: null,
      respawnFrames: 0,
      ledge: null,
      ledgeCooldownFrames: 0,
      ledgeHangFrames: 0,
      ledgeDirectionReleased: false,
      lastHitBy: null,
      lastHitFrames: 0,
      damageMultiplier: 1,
      damageBuffFrames: 0,
      speedMultiplier: 1,
      speedBuffFrames: 0,
      jumpMultiplier: 1,
      jumpBuffFrames: 0,
      defenseMultiplier: 1,
      defenseBuffFrames: 0,
      projectileShieldFrames: 0,
      heldItem: null,
      itemUseFrames: 0,
      itemAction: null,
      storedCharges: {},
      absorbedEnergy: 0,
    };
  }

  private fighterCannotStartAction(fighter: FighterRuntime): boolean {
    return (
      fighter.state === "ko" ||
      fighter.state === "respawn" ||
      fighter.state === "grabbed" ||
      fighter.state === "ledge" ||
      fighter.hitstopFrames > 0 ||
      fighter.hitstunFrames > 0 ||
      fighter.shieldStunFrames > 0 ||
      fighter.jumpSquatFrames > 0 ||
      fighter.landingLagFrames > 0 ||
      fighter.tauntFrames > 0 ||
      fighter.dodgeFrames > 0 ||
      fighter.airDodgeHelpless ||
      fighter.itemUseFrames > 0 ||
      fighter.grabTarget !== null ||
      fighter.grabFrames > 0 ||
      fighter.action !== null
    );
  }

  private captureBufferedAction(fighter: FighterRuntime, input: InputFrame): boolean {
    const action = BUFFERABLE_ACTIONS.find((candidate) => input.pressed.has(candidate));
    if (!action) return false;
    fighter.bufferedAction = action;
    fighter.bufferedDirection = normalizedDirection(input);
    fighter.bufferedDirectionAction = (["left", "right", "up", "down"] as const)
      .find((candidate) => input.pressed.has(candidate)) ?? null;
    fighter.bufferedActionFrames = action === "jump"
      ? JUMP_INPUT_BUFFER_FRAMES
      : action === "shield"
        ? SHIELD_INPUT_BUFFER_FRAMES
        : INPUT_BUFFER_FRAMES;
    return true;
  }

  private captureSmashDirection(fighter: FighterRuntime, input: InputFrame): void {
    const action = (["left", "right", "up", "down"] as const).find(
      (candidate) => input.pressed.has(candidate),
    );
    if (!action) return;
    const direction = normalizedDirection(input);
    fighter.smashDirectionAction = action;
    fighter.smashDirection = Math.hypot(direction.x, direction.y) > 0.25
      ? direction
      : action === "left"
        ? { x: -1, y: 0 }
        : action === "right"
          ? { x: 1, y: 0 }
          : action === "up"
            ? { x: 0, y: 1 }
            : { x: 0, y: -1 };
    // Timers age before actions are selected, so keep one sentinel tick to
    // expose the full authored number of frames between the two key events.
    fighter.smashDirectionFrames = SMASH_CHORD_GRACE_FRAMES + 1;
  }

  private clearSmashDirection(fighter: FighterRuntime): void {
    fighter.smashDirection = { x: 0, y: 0 };
    fighter.smashDirectionAction = null;
    fighter.smashDirectionFrames = 0;
  }

  private withBufferedAction(fighter: FighterRuntime, input: InputFrame): InputFrame {
    const hasFreshAction = BUFFERABLE_ACTIONS.some((candidate) => input.pressed.has(candidate));
    if (hasFreshAction) {
      this.clearBufferedAction(fighter);
      return input;
    }
    if (!fighter.bufferedAction || fighter.bufferedActionFrames <= 0) return input;
    const pressed = new Set(input.pressed);
    const held = new Set(input.held);
    pressed.add(fighter.bufferedAction);
    held.add(fighter.bufferedAction);
    if (fighter.bufferedDirectionAction) {
      pressed.add(fighter.bufferedDirectionAction);
      held.add(fighter.bufferedDirectionAction);
    }
    return {
      ...input,
      pressed,
      held,
      direction: { ...fighter.bufferedDirection },
    };
  }

  private ageBufferedAction(fighter: FighterRuntime): void {
    if (fighter.bufferedActionFrames <= 0) return;
    fighter.bufferedActionFrames -= 1;
    if (fighter.bufferedActionFrames === 0) this.clearBufferedAction(fighter);
  }

  private consumeBufferedAction(fighter: FighterRuntime, action: BufferableAction): void {
    if (fighter.bufferedAction === action) this.clearBufferedAction(fighter);
  }

  private clearBufferedAction(fighter: FighterRuntime): void {
    fighter.bufferedAction = null;
    fighter.bufferedDirection = { x: 0, y: 0 };
    fighter.bufferedDirectionAction = null;
    fighter.bufferedActionFrames = 0;
  }

  private captureMeleeTechniqueInputs(fighter: FighterRuntime, input: InputFrame): void {
    if (
      input.pressed.has("shield") &&
      fighter.techable &&
      (fighter.hitstopFrames > 0 || fighter.hitstunFrames > 0) &&
      fighter.techLockoutFrames === 0
    ) {
      fighter.techWindowFrames = TECH_INPUT_WINDOW_FRAMES;
      fighter.techLockoutFrames = TECH_INPUT_LOCKOUT_FRAMES;
    }
    // Hitlag/hitstun accept DI, SDI and tech inputs, but must not accidentally
    // arm fast-fall or L-cancel for an action the defender is no longer doing.
    if (fighter.hitstopFrames > 0 || fighter.hitstunFrames > 0) return;
    if (fighter.grounded) return;
    if (input.pressed.has("down")) {
      fighter.fastFallInputFrames = FAST_FALL_BUFFER_FRAMES;
    }
    if (
      input.pressed.has("shield") &&
      fighter.action &&
      AERIAL_NORMALS.has(fighter.action.name)
    ) {
      fighter.lCancelFrames = L_CANCEL_WINDOW_FRAMES;
    }
    if (
      !fighter.fastFalling &&
      fighter.fastFallInputFrames > 0 &&
      fighter.velocity.y <= 0
    ) {
      fighter.fastFalling = true;
      fighter.fastFallInputFrames = 0;
      fighter.velocity.y = -fighter.definition.fastFallSpeed;
    }
  }

  private updateFighter(
    fighter: FighterRuntime,
    input: InputFrame,
    inputs: InputPair,
  ): void {
    const controlsLocked = this.fighterCannotStartAction(fighter);
    const captured = controlsLocked && this.captureBufferedAction(fighter, input);
    if (!controlsLocked) input = this.withBufferedAction(fighter, input);
    if (!captured) this.ageBufferedAction(fighter);
    this.tickFighterTimers(fighter);
    this.captureSmashDirection(fighter, input);
    this.captureMeleeTechniqueInputs(fighter, input);

    if (fighter.state === "ko") {
      fighter.respawnFrames = Math.max(0, fighter.respawnFrames - 1);
      if (fighter.respawnFrames === 0 && fighter.stocks > 0) this.respawnFighter(fighter);
      return;
    }

    if (fighter.state === "respawn" && fighter.respawnFrames > 0) {
      fighter.respawnFrames -= 1;
      fighter.velocity = { x: 0, y: 0 };
      this.clearLaunchVelocity(fighter);
      if (fighter.respawnFrames === 0) fighter.state = "fall";
      return;
    }

    if (fighter.hitstopFrames > 0) {
      const hitstopDirection = normalizedDirection(input);
      if (
        fighter.launchBaseAngle !== null &&
        Math.hypot(hitstopDirection.x, hitstopDirection.y) > 0.25
      ) {
        fighter.pendingHitstopDi = hitstopDirection;
      }
      if (fighter.launchBaseAngle !== null) {
        const region = sdiRegionForDirection(hitstopDirection);
        fighter.asdiDirection = region === null ? null : cloneVec(hitstopDirection);
        if (region === null) {
          fighter.sdiRegion = null;
        } else if (region !== fighter.sdiRegion) {
          if (fighter.hitstopElapsedFrames >= 1) {
            this.applyHitstopDisplacement(fighter, hitstopDirection, SDI_DISTANCE);
          }
          fighter.sdiRegion = region;
        }
        fighter.hitstopElapsedFrames += 1;
      }
      fighter.hitstopFrames -= 1;
      if (fighter.hitstopFrames === 0) this.finishHitstopDi(fighter);
      return;
    }

    if (fighter.state === "grabbed") {
      this.followGrabber(fighter);
      return;
    }

    if (fighter.state === "ledge") {
      this.updateLedge(fighter, input);
      return;
    }

    if (fighter.hitstunFrames > 0) {
      fighter.launchBaseAngle = null;
      fighter.pendingHitstopDi = null;
      const mashEscape = fighter.statusEffect
        ? Math.min(
          9,
          (["jump", "attack", "special", "grab", "shield"] as const)
            .filter((action) => input.pressed.has(action)).length * 3 +
          (["left", "right", "up", "down"] as const)
            .filter((action) => input.pressed.has(action)).length * 2,
        )
        : 0;
      fighter.hitstunFrames = Math.max(0, fighter.hitstunFrames - 1 - mashEscape);
      fighter.state = "hitstun";
      const direction = normalizedDirection(input);
      if (fighter.statusEffect === "bury") {
        fighter.velocity.x = 0;
      } else if (fighter.grounded) {
        fighter.velocity.x = approach(
          fighter.velocity.x,
          0,
          fighter.definition.traction * GROUND_HITSTUN_BRAKE_MULTIPLIER * FIXED_DT,
        );
      } else {
        fighter.velocity.x += direction.x * fighter.definition.airAcceleration * FIXED_DT * 0.32;
      }
      this.integrateFighter(fighter, input);
      if (fighter.hitstunFrames === 0) {
        if (fighter.statusEffect) {
          fighter.statusResistanceFrames = Math.max(
            fighter.statusResistanceFrames,
            fighter.statusEffect === "bury" ? 90 : 45,
          );
          fighter.statusEffect = null;
        }
        fighter.techable = false;
        if (fighter.dodgeFrames === 0) fighter.state = fighter.grounded ? "idle" : "fall";
      }
      return;
    }

    if (fighter.shieldStunFrames > 0) {
      fighter.shieldStunFrames -= 1;
      this.integrateFighter(fighter, input);
      return;
    }

    if (fighter.jumpSquatFrames > 0) {
      fighter.jumpSquatFrames -= 1;
      fighter.state = "jump-squat";
      if (!input.held.has("jump")) fighter.fullHopRequested = false;
      const jumpDirection = normalizedDirection(input);
      const preservingMomentum =
        Math.abs(jumpDirection.x) > 0.08 &&
        Math.sign(jumpDirection.x) === Math.sign(fighter.velocity.x);
      if (!preservingMomentum) {
        fighter.velocity.x = approach(
          fighter.velocity.x,
          0,
          fighter.definition.traction * 0.25 * FIXED_DT,
        );
      }
      if (fighter.jumpSquatFrames === 0) {
        fighter.grounded = false;
        fighter.supportPlatform = null;
        fighter.coyoteFrames = 0;
        fighter.jumpsRemaining = Math.max(0, fighter.definition.maxJumps - 1);
        fighter.velocity.x *= GROUND_TO_AIR_MOMENTUM;
        fighter.velocity.y =
          (fighter.fullHopRequested
            ? jumpSpeedForMinimumRise(
                fighter.definition.jumpSpeed,
                fighter.definition.gravity,
                MIN_FULL_HOP_RISE,
              )
            : fighter.definition.jumpSpeed * fighter.definition.shortHopSpeedMultiplier) *
          fighter.jumpMultiplier;
        fighter.shortHopReleaseFrames = fighter.fullHopRequested
          ? SHORT_HOP_RELEASE_GRACE_FRAMES
          : 0;
        fighter.fastFalling = false;
        fighter.fastFallInputFrames = 0;
        fighter.state = "jump";
        this.emit({ type: "jump", slot: fighter.slot, position: cloneVec(fighter.position), sound: "jump" });
      }
      return;
    }

    if (fighter.shortHopReleaseFrames > 0) {
      if (!fighter.grounded && fighter.velocity.y > 0 && !input.held.has("jump")) {
        const shortHopSpeed =
          fighter.definition.jumpSpeed *
          fighter.jumpMultiplier *
          fighter.definition.shortHopSpeedMultiplier;
        fighter.velocity.y = Math.min(fighter.velocity.y, shortHopSpeed);
        fighter.fullHopRequested = false;
        fighter.shortHopReleaseFrames = 0;
      } else {
        fighter.shortHopReleaseFrames -= 1;
      }
    }

    if (fighter.landingLagFrames > 0) {
      fighter.landingLagFrames -= 1;
      if (fighter.wavedashFrames > 0) fighter.wavedashFrames -= 1;
      fighter.state = "crouch";
      fighter.velocity.x = approach(
        fighter.velocity.x,
        0,
        (fighter.wavedashFrames > 0
          ? fighter.definition.wavedashTraction
          : fighter.definition.traction * 0.72) * FIXED_DT,
      );
      this.integrateFighter(fighter, input);
      if (fighter.landingLagFrames === 0) {
        fighter.state = fighter.grounded ? "idle" : "fall";
      }
      return;
    }

    if (fighter.tauntFrames > 0) {
      fighter.tauntFrames -= 1;
      fighter.state = "taunt";
      fighter.velocity.x = approach(fighter.velocity.x, 0, fighter.definition.traction * FIXED_DT);
      if (fighter.tauntFrames === 0) fighter.state = fighter.grounded ? "idle" : "fall";
      return;
    }

    if (fighter.dodgeFrames > 0) {
      fighter.dodgeFrames -= 1;
      fighter.state = "dodge";
      if (fighter.grounded) {
        fighter.velocity.x = approach(fighter.velocity.x, 0, 1_250 * FIXED_DT);
      } else if (fighter.dodgeKind === "air") {
        fighter.velocity.x *= AIR_DODGE_VELOCITY_RETENTION;
        fighter.velocity.y *= AIR_DODGE_VELOCITY_RETENTION;
      }
      this.integrateFighter(fighter, input);
      if (fighter.dodgeFrames === 0) {
        fighter.dodgeKind = null;
        if (fighter.landingLagFrames === 0) fighter.state = fighter.grounded ? "idle" : "fall";
      }
      return;
    }

    if (fighter.airDodgeHelpless && !fighter.grounded) {
      fighter.state = "fall";
      this.integrateFighter(fighter, input);
      return;
    }

    if (fighter.itemUseFrames > 0) {
      fighter.itemUseFrames -= 1;
      fighter.state = "attack";
      fighter.velocity.x = approach(fighter.velocity.x, 0, fighter.definition.traction * FIXED_DT);
      this.integrateFighter(fighter, input);
      if (fighter.itemUseFrames === 0) {
        fighter.itemAction = null;
        fighter.state = fighter.grounded ? "idle" : "fall";
      }
      return;
    }

    if (fighter.grabTarget !== null) {
      this.updateHeldGrab(fighter, input, inputs[fighter.grabTarget]);
      return;
    }

    if (fighter.grabFrames > 0) {
      fighter.grabFrames -= 1;
      fighter.state = "grab";
      fighter.velocity.x = approach(fighter.velocity.x, 0, fighter.definition.traction * FIXED_DT);
      this.integrateFighter(fighter, input);
      if (fighter.grabFrames === 0) {
        fighter.throwAnimation = null;
        fighter.state = fighter.grounded ? "idle" : "fall";
      }
      return;
    }

    if (fighter.action) {
      const activeAction = fighter.action;
      const move = fighter.definition.attacks[fighter.action.name];
      this.updateActiveMove(fighter, input);
      const recoveryInput =
        !input.pressed.has("jump") &&
        fighter.bufferedAction === "jump" &&
        fighter.bufferedActionFrames > 0
          ? {
              ...input,
              held: new Set([...input.held, "jump" as const]),
              pressed: new Set([...input.pressed, "jump" as const]),
              direction: { ...fighter.bufferedDirection },
            }
          : input;
      const recoveryDirection = normalizedDirection(recoveryInput);
      const mobilityUnlockFrame =
        move.startup + move.active + Math.min(move.recovery, ATTACK_MOBILITY_RECOVERY_FRAMES);
      const mobilityRequested =
        recoveryInput.pressed.has("jump") || Math.abs(recoveryDirection.x) > 0.08;
      if (
        fighter.action === activeAction &&
        !activeAction.charging &&
        !move.specialMovement &&
        !move.projectile?.ownerLaunchOnContact &&
        activeAction.frame >= mobilityUnlockFrame &&
        mobilityRequested
      ) {
        const totalFrames = move.startup + move.active + move.recovery;
        fighter.attackLockFrames = Math.max(
          fighter.attackLockFrames,
          totalFrames - activeAction.frame,
        );
        fighter.action = null;
        fighter.state = fighter.grounded ? "idle" : "fall";
        this.updateMovement(fighter, recoveryInput, recoveryDirection);
        this.integrateFighter(fighter, recoveryInput);
        return;
      }
      const inRecovery = activeAction.frame >= move.startup + move.active;
      if (
        fighter.grounded &&
        !move.specialMovement &&
        (!move.movement || inRecovery)
      ) {
        fighter.velocity.x = approach(
          fighter.velocity.x,
          0,
          fighter.definition.traction * GROUND_ATTACK_BRAKE_MULTIPLIER * FIXED_DT,
        );
      }
      this.applyAirDrift(fighter, input, 0.68);
      this.integrateFighter(fighter, input);
      return;
    }

    if (fighter.airUpSpecialUsed && !fighter.grounded) {
      // A recovery Up-B ends in freefall: directional drift, fast-fall and
      // ledge catch remain available, but no new action starts until landing
      // or an incoming hit refreshes aerial resources.
      fighter.state = "fall";
      this.applyAirDrift(fighter, input, 1);
      this.integrateFighter(fighter, input);
      return;
    }

    const direction = normalizedDirection(input);
    const directionPressed =
      input.pressed.has("left") ||
      input.pressed.has("right") ||
      input.pressed.has("up") ||
      input.pressed.has("down");

    const shieldSupport = fighter.supportPlatform
      ? this.stage.platforms.find((platform) => platform.id === fighter.supportPlatform)
      : undefined;
    if (
      fighter.state === "shield" &&
      fighter.grounded &&
      shieldSupport?.kind === "platform" &&
      input.pressed.has("down") &&
      direction.y <= SHIELD_DROP_THRESHOLD
    ) {
      fighter.grounded = false;
      fighter.supportPlatform = null;
      fighter.dropThroughFrames = 12;
      fighter.position.y -= 5;
      fighter.velocity.y = Math.min(fighter.velocity.y, -70);
      fighter.state = "fall";
      this.integrateFighter(fighter, input);
      return;
    }

    const canDodge = fighter.grounded || !fighter.airDodgeUsed;
    if (
      canDodge &&
      (
        (input.pressed.has("shield") && (!fighter.grounded || Math.hypot(direction.x, direction.y) > 0.25)) ||
        (fighter.state === "shield" && directionPressed)
      )
    ) {
      this.consumeBufferedAction(fighter, "shield");
      this.startDodge(fighter, direction);
      this.integrateFighter(fighter, input);
      return;
    }

    if (input.pressed.has("grab") && input.held.has("shield") && fighter.grounded) {
      this.consumeBufferedAction(fighter, "grab");
      fighter.tauntFrames = 60;
      fighter.state = "taunt";
      fighter.velocity.x = 0;
      this.emit({ type: "taunt", slot: fighter.slot, position: cloneVec(fighter.position), sound: "taunt" });
      return;
    }

    if (input.pressed.has("grab")) {
      this.consumeBufferedAction(fighter, "grab");
      if (this.tryPickupItem(fighter)) {
        this.integrateFighter(fighter, input);
        return;
      }
      this.startGrab(fighter);
      this.integrateFighter(fighter, input);
      return;
    }

    if (
      (input.held.has("shield") || input.pressed.has("shield")) &&
      fighter.grounded &&
      fighter.shieldLockFrames === 0
    ) {
      fighter.state = "shield";
      fighter.velocity.x = approach(fighter.velocity.x, 0, fighter.definition.traction * 1.4 * FIXED_DT);
      fighter.shield = Math.max(0, fighter.shield - 0.16);
      if (fighter.shield <= 0) this.breakShield(fighter);
      this.integrateFighter(fighter, input);
      return;
    }

    if (fighter.state === "shield") fighter.state = "idle";

    if (
      fighter.attackLockFrames === 0 &&
      input.pressed.has("attack") &&
      fighter.heldItem
    ) {
      this.useHeldItem(fighter, input, inputs[slotOther(fighter.slot)]);
      this.integrateFighter(fighter, input);
      return;
    }

    if (
      fighter.attackLockFrames === 0 &&
      (input.pressed.has("attack") || input.pressed.has("special"))
    ) {
      const requestedAction: BufferableAction = input.pressed.has("special") ? "special" : "attack";
      this.consumeBufferedAction(fighter, requestedAction);
      const attackDirection =
        !input.pressed.has("special") &&
        Math.hypot(direction.x, direction.y) <= 0.25 &&
        fighter.smashDirectionFrames > 0
          ? fighter.smashDirection
          : direction;
      const moveName = input.pressed.has("special")
        ? this.chooseSpecial(direction)
        : this.chooseNormal(fighter, attackDirection);
      if (moveName.includes("smash")) this.clearSmashDirection(fighter);
      const selectedMove = fighter.definition.attacks[moveName];
      if (
        moveName === "up-special" &&
        (
          selectedMove.movement ||
          selectedMove.specialMovement ||
          selectedMove.projectile?.ownerLaunchOnContact
        )
      ) {
        if (fighter.airUpSpecialUsed) {
          this.integrateFighter(fighter, input);
          return;
        }
        fighter.airUpSpecialUsed = true;
      }
      this.startMove(fighter, moveName, input);
      this.integrateFighter(fighter, input);
      return;
    }

    this.updateMovement(fighter, input, direction);
    this.integrateFighter(fighter, input);
  }

  private tickFighterTimers(fighter: FighterRuntime): void {
    fighter.invulnerableFrames = Math.max(0, fighter.invulnerableFrames - 1);
    fighter.dropThroughFrames = Math.max(0, fighter.dropThroughFrames - 1);
    fighter.ledgeCooldownFrames = Math.max(0, fighter.ledgeCooldownFrames - 1);
    fighter.shieldLockFrames = Math.max(0, fighter.shieldLockFrames - 1);
    fighter.coyoteFrames = Math.max(0, fighter.coyoteFrames - 1);
    fighter.lCancelFrames = Math.max(0, fighter.lCancelFrames - 1);
    fighter.fastFallInputFrames = Math.max(0, fighter.fastFallInputFrames - 1);
    fighter.smashDirectionFrames = Math.max(0, fighter.smashDirectionFrames - 1);
    if (fighter.smashDirectionFrames === 0) this.clearSmashDirection(fighter);
    fighter.statusResistanceFrames = Math.max(0, fighter.statusResistanceFrames - 1);
    fighter.techWindowFrames = Math.max(0, fighter.techWindowFrames - 1);
    fighter.techLockoutFrames = Math.max(0, fighter.techLockoutFrames - 1);
    fighter.attackLockFrames = Math.max(0, fighter.attackLockFrames - 1);
    if (fighter.lastHitFrames > 0) fighter.lastHitFrames -= 1;
    else fighter.lastHitBy = null;

    if (fighter.damageBuffFrames > 0) fighter.damageBuffFrames -= 1;
    else fighter.damageMultiplier = 1;
    if (fighter.speedBuffFrames > 0) fighter.speedBuffFrames -= 1;
    else fighter.speedMultiplier = 1;
    if (fighter.jumpBuffFrames > 0) fighter.jumpBuffFrames -= 1;
    else fighter.jumpMultiplier = 1;
    if (fighter.defenseBuffFrames > 0) fighter.defenseBuffFrames -= 1;
    else fighter.defenseMultiplier = 1;
    fighter.projectileShieldFrames = Math.max(0, fighter.projectileShieldFrames - 1);

    if (
      fighter.state !== "shield" &&
      fighter.shieldLockFrames === 0 &&
      fighter.shield < fighter.definition.shieldHealth
    ) {
      fighter.shield = Math.min(
        fighter.definition.shieldHealth,
        fighter.shield + fighter.definition.shieldRegen * FIXED_DT,
      );
    }
  }

  private updateMovement(fighter: FighterRuntime, input: InputFrame, direction: Vec2): void {
    const support = fighter.supportPlatform
      ? this.stage.platforms.find((platform) => platform.id === fighter.supportPlatform)
      : undefined;
    if (
      fighter.grounded &&
      support?.kind === "platform" &&
      input.pressed.has("down")
    ) {
      fighter.grounded = false;
      fighter.supportPlatform = null;
      fighter.dropThroughFrames = 12;
      fighter.position.y -= 5;
      fighter.state = "fall";
      return;
    }

    if (input.pressed.has("jump")) {
      this.consumeBufferedAction(fighter, "jump");
      if (fighter.grounded || fighter.coyoteFrames > 0) {
        fighter.jumpSquatFrames = effectiveJumpSquatFrames(fighter.definition.jumpSquatFrames);
        fighter.fullHopRequested = input.held.has("jump");
        fighter.state = "jump-squat";
        return;
      } else if (fighter.jumpsRemaining > 0) {
        fighter.jumpsRemaining -= 1;
        fighter.shortHopReleaseFrames = 0;
        fighter.velocity.y = jumpSpeedForMinimumRise(
          fighter.definition.doubleJumpSpeed,
          fighter.definition.gravity,
          MIN_DOUBLE_JUMP_RISE,
        ) * fighter.jumpMultiplier;
        fighter.fastFalling = false;
        fighter.fastFallInputFrames = 0;
        fighter.state = "jump";
        this.emit({ type: "jump", slot: fighter.slot, position: cloneVec(fighter.position), sound: "double-jump" });
      }
    }

    const speed = fighter.definition.runSpeed * fighter.speedMultiplier * GROUND_RUN_SPEED_MULTIPLIER;
    if (fighter.grounded) {
      if (direction.y < -0.55 && Math.abs(direction.y) >= Math.abs(direction.x)) {
        fighter.analogRunning = false;
        fighter.dashFrames = 0;
        fighter.turnFrames = 0;
        fighter.velocity.x = approach(
          fighter.velocity.x,
          0,
          fighter.definition.traction * FIXED_DT,
        );
        fighter.state = "crouch";
      } else if (Math.abs(direction.x) > 0.08) {
        const directionSign = direction.x < 0 ? -1 : 1;
        const stickAmount = Math.abs(input.direction.x);
        const stickEffort = Math.min(1, Math.hypot(input.direction.x, input.direction.y));
        const running = !input.analog ||
          (stickAmount >= 0.45 && stickEffort >= (fighter.analogRunning ? 0.56 : 0.68));
        fighter.analogRunning = Boolean(input.analog && running);
        const changedFacing = directionSign !== fighter.facing && Math.abs(fighter.velocity.x) > 28;
        const directionAction = directionSign < 0 ? "left" : "right";
        const dashDancePivot =
          running &&
          changedFacing &&
          fighter.state === "dash" &&
          fighter.dashFrames > 0 &&
          input.pressed.has(directionAction);
        if (running && input.pressed.has(directionAction)) {
          fighter.dashFrames = fighter.definition.initialDashFrames;
          if (dashDancePivot || !changedFacing || Math.abs(fighter.velocity.x) <= 28) {
            const impulseMultiplier = input.analog
              ? 1
              : DIGITAL_DASH_IMPULSE_MULTIPLIER;
            fighter.velocity.x =
              directionSign * fighter.definition.initialDashSpeed *
              fighter.speedMultiplier * impulseMultiplier;
          }
        }
        if (dashDancePivot) fighter.turnFrames = 0;
        else if (changedFacing) fighter.turnFrames = 5;
        const walkAmount = clamp(stickAmount / 0.72, 0, 1);
        const dashSpeed = fighter.definition.initialDashSpeed * fighter.speedMultiplier;
        const targetSpeed = running
          ? directionSign * (fighter.dashFrames > 0 ? dashSpeed : speed) *
            (input.analog ? Math.max(0.68, stickAmount) : 1)
          : directionSign * speed * (0.2 + walkAmount * 0.38);
        const reversingVelocity =
          Math.abs(fighter.velocity.x) > 28 &&
          Math.sign(fighter.velocity.x) !== directionSign;
        fighter.velocity.x = approach(
          fighter.velocity.x,
          targetSpeed,
          fighter.definition.groundAcceleration *
            (reversingVelocity ? GROUND_REVERSAL_ACCELERATION_MULTIPLIER : 1) *
            FIXED_DT,
        );
        fighter.facing = direction.x < 0 ? -1 : 1;
        if (fighter.turnFrames > 0) {
          fighter.turnFrames -= 1;
          fighter.state = "turn";
        } else if (running && fighter.dashFrames > 0) {
          fighter.dashFrames -= 1;
          fighter.state = "dash";
        } else {
          fighter.dashFrames = 0;
          fighter.state = running ? "run" : "walk";
        }
      } else {
        fighter.analogRunning = false;
        fighter.dashFrames = 0;
        fighter.turnFrames = 0;
        fighter.velocity.x = approach(
          fighter.velocity.x,
          0,
          fighter.definition.traction * GROUND_RELEASE_BRAKE_MULTIPLIER * FIXED_DT,
        );
        fighter.state = "idle";
      }
    } else {
      this.applyAirDrift(fighter, input, 1);
      fighter.state = fighter.velocity.y > 0 ? "jump" : "fall";
    }
  }

  private applyAirDrift(fighter: FighterRuntime, input: InputFrame, multiplier: number): void {
    if (fighter.grounded) return;
    const direction = normalizedDirection(input);
    const target = direction.x * fighter.definition.airSpeed * fighter.speedMultiplier;
    fighter.velocity.x = approach(
      fighter.velocity.x,
      target,
      fighter.definition.airAcceleration * multiplier * FIXED_DT,
    );
    if (Math.abs(direction.x) > 0.1 && !fighter.action) fighter.facing = direction.x < 0 ? -1 : 1;
  }

  private chooseNormal(
    fighter: FighterRuntime,
    direction: Vec2,
  ): MoveName {
    if (!fighter.grounded) {
      if (direction.y > 0.52) return "up-air";
      if (direction.y < -0.52) return "down-air";
      if (Math.abs(direction.x) > 0.42) {
        return direction.x * fighter.facing < 0 ? "back-air" : "forward-air";
      }
      return "neutral-air";
    }

    const smashDirection = fighter.smashDirectionFrames > 0
      ? fighter.smashDirectionAction
      : null;
    if (
      !smashDirection &&
      (fighter.state === "dash" || fighter.state === "run") &&
      Math.abs(fighter.velocity.x) > fighter.definition.runSpeed * 0.35
    ) {
      return "dash-attack";
    }
    if (direction.y > 0.52) {
      return smashDirection === "up" ? "up-smash" : "up-tilt";
    }
    if (direction.y < -0.52) {
      return smashDirection === "down" ? "down-smash" : "down-tilt";
    }
    if (Math.abs(direction.x) > 0.42) {
      fighter.facing = direction.x < 0 ? -1 : 1;
      return smashDirection === (direction.x < 0 ? "left" : "right")
        ? "forward-smash"
        : "forward-tilt";
    }
    return "jab";
  }

  private chooseSpecial(direction: Vec2): MoveName {
    if (direction.y > 0.5) return "up-special";
    if (direction.y < -0.5) return "down-special";
    if (Math.abs(direction.x) > 0.45) return "side-special";
    return "neutral-special";
  }

  private startMove(fighter: FighterRuntime, name: MoveName, input: InputFrame): void {
    const move = fighter.definition.attacks[name];
    const button = name.endsWith("special") ? "special" : "attack";
    const initialDirection = normalizedDirection(input);
    const storedCharge = move.storesCharge ? (fighter.storedCharges[name] ?? 0) : 0;
    const maximumCharge = move.maxChargeFrames ?? 1;
    const storedOil =
      fighter.fighter === "mr-game-and-watch" && name === "down-special"
        ? fighter.absorbedEnergy
        : 0;
    if (storedOil > 0) fighter.absorbedEnergy = 0;
    fighter.action = {
      name,
      frame: 0,
      chargeFrames: storedCharge,
      charging: Boolean(
        move.chargeable &&
        input.held.has(button) &&
        storedCharge < maximumCharge
      ),
      spawnedProjectile: false,
      hitTargets: new Set(),
      lastHitFrame: new Map(),
      hitCounts: new Map(),
      startedGrounded: fighter.grounded,
      startedSupportPlatform: fighter.supportPlatform,
      specialPhase: name.endsWith("special") ? "startup" : null,
      lastSpecialDirection: Math.hypot(initialDirection.x, initialDirection.y) > 0.25
        ? initialDirection
        : null,
      appliedSelfDamage: false,
      specialVariant:
        fighter.fighter === "mr-game-and-watch" && name === "side-special"
          ? 1 + Math.floor(this.random.next() * 9)
          : fighter.fighter === "luigi" && name === "side-special"
            ? (this.random.next() < 0.1 ? 1 : 0)
          : null,
      specialStoredDamage: storedOil,
    };
    if (move.projectile?.detonatesOnChargeRelease) {
      this.spawnProjectile(fighter, name, move);
      fighter.action.spawnedProjectile = true;
    }
    fighter.state = "attack";
    this.emit({
      type: "attack",
      slot: fighter.slot,
      move: name,
      position: cloneVec(fighter.position),
      sound: name.includes("smash") ? "swing-heavy" : name.includes("special") ? "special" : "swing-light",
    });
  }

  private updateActiveMove(fighter: FighterRuntime, input: InputFrame): void {
    const action = fighter.action;
    if (!action) return;
    const move = fighter.definition.attacks[action.name];
    const button = action.name.endsWith("special") ? "special" : "attack";

    // Keyboard events that belong to the same intended chord can arrive in
    // either order. A neutral attack may therefore become a smash while its
    // jab is still in startup, before it has produced a hitbox.
    if (
      fighter.grounded &&
      action.name === "jab" &&
      action.frame < move.startup &&
      fighter.smashDirectionFrames > 0 &&
      fighter.smashDirectionAction
    ) {
      const smashName: MoveName = fighter.smashDirectionAction === "up"
        ? "up-smash"
        : fighter.smashDirectionAction === "down"
          ? "down-smash"
          : "forward-smash";
      fighter.action = null;
      this.startMove(fighter, smashName, input);
      this.clearSmashDirection(fighter);
      return;
    }

    if (action.charging) {
      const maximum = move.maxChargeFrames ?? 1;
      if (move.storesCharge && input.pressed.has("shield")) {
        fighter.storedCharges[action.name] = action.chargeFrames;
        fighter.action = null;
        fighter.state = fighter.grounded ? "idle" : "fall";
        // The shield press has already fulfilled its purpose by cancelling the
        // charge. Do not replay it from the input buffer on the next free frame.
        this.consumeBufferedAction(fighter, "shield");
        return;
      }
      if (input.held.has(button) && action.chargeFrames < maximum) {
        action.chargeFrames += 1;
        fighter.velocity.x = approach(fighter.velocity.x, 0, fighter.definition.traction * FIXED_DT);
        return;
      }
      if (move.storesCharge && action.chargeFrames >= maximum) {
        fighter.storedCharges[action.name] = maximum;
        fighter.action = null;
        fighter.state = fighter.grounded ? "idle" : "fall";
        return;
      }
      action.charging = false;
      if (move.projectile?.detonatesOnChargeRelease) {
        const projectile = this.projectiles.find(
          (candidate) => candidate.owner === fighter.slot && candidate.move === action.name,
        );
        if (projectile) {
          projectile.powerScale = this.chargeScale(move, action.chargeFrames);
          projectile.detonating = true;
          projectile.remainingFrames = Math.max(1, projectile.remainingFrames);
          projectile.velocity = { x: 0, y: 0 };
          this.emit({
            type: "attack-active",
            slot: fighter.slot,
            move: action.name,
            position: cloneVec(projectile.position),
          });
        }
      }
    }

    action.frame += 1;
    if (action.name.endsWith("special") && action.specialPhase !== "landing") {
      action.specialPhase = action.frame < move.startup
        ? "startup"
        : action.frame < move.startup + move.active
          ? "active"
          : "recovery";
    }

    this.applySpecialMovement(fighter, action, move, input);
    if (action.frame === Math.max(1, move.startup)) {
      if (move.storesCharge) fighter.storedCharges[action.name] = 0;
      if (move.selfDamage && !action.appliedSelfDamage) {
        fighter.percent += move.selfDamage;
        action.appliedSelfDamage = true;
      }
      if (move.movement && !move.specialMovement) {
        const direction = normalizedDirection(input);
        const horizontalSign = Math.abs(direction.x) > 0.25 ? Math.sign(direction.x) : fighter.facing;
        const authoredMovement = !action.startedGrounded && move.airMovement
          ? move.airMovement
          : move.movement;
        const movementScale =
          fighter.fighter === "luigi" &&
          action.name === "side-special" &&
          action.specialVariant === 1
            ? 1.75
            : 1;
        fighter.velocity.x = Math.abs(authoredMovement.x) * horizontalSign * movementScale;
        if (authoredMovement.y !== 0) {
          fighter.velocity.y = authoredMovement.y;
          fighter.grounded = false;
          fighter.supportPlatform = null;
        }
      }
      if (move.projectile && !action.spawnedProjectile) {
        this.spawnProjectile(fighter, action.name, move);
        action.spawnedProjectile = true;
      }
      this.emit({
        type: "attack-active",
        slot: fighter.slot,
        move: action.name,
        position: {
          x: fighter.position.x + move.offset.x * fighter.facing,
          y: fighter.position.y + move.offset.y,
        },
      });
    }

    const totalFrames = move.startup + move.active + move.recovery;
    if (action.frame >= totalFrames) {
      fighter.action = null;
      fighter.state = fighter.grounded ? "idle" : "fall";
    }
  }

  private applySpecialMovement(
    fighter: FighterRuntime,
    action: ActiveMove,
    move: AttackDefinition,
    input: InputFrame,
  ): void {
    const behavior = move.specialMovement;
    if (!behavior) return;

    const inputDirection = normalizedDirection(input);
    const inputMagnitude = Math.hypot(inputDirection.x, inputDirection.y);
    const fallbackDirection = action.lastSpecialDirection ?? { x: 0, y: 1 };
    const direction = inputMagnitude > 0.25 ? inputDirection : fallbackDirection;
    const directionMagnitude = Math.hypot(direction.x, direction.y) || 1;
    const normalized = {
      x: direction.x / directionMagnitude,
      y: direction.y / directionMagnitude,
    };

    if (behavior.kind === "authored-root-motion") {
      const totalFrames = Math.max(1, move.startup + move.active + move.recovery);
      const current = sampleRootMotion(behavior.samples, action.frame / totalFrames);
      const previous = sampleRootMotion(
        behavior.samples,
        Math.max(0, action.frame - 1) / totalFrames,
      );
      // The NUANMB curve is normalized to the rendered skeleton, whose visible
      // height deliberately overhangs the smaller gameplay hurtbox.
      const worldScale =
        fighter.definition.size.height * EXACT_MODEL_TO_BODY_HEIGHT_RATIO;
      const verticalScale = worldScale * (
        !action.startedGrounded ? behavior.airVerticalMultiplier ?? 1 : 1
      );
      const authoredHorizontal = action.lastSpecialDirection?.x ?? 0;
      const horizontalSign = Math.abs(authoredHorizontal) > 0.25
        ? Math.sign(authoredHorizontal)
        : fighter.facing;
      fighter.velocity = {
        x: (current.x - previous.x) * worldScale * horizontalSign / FIXED_DT,
        y: (current.y - previous.y) * verticalScale / FIXED_DT,
      };
      if (Math.abs(fighter.velocity.y) > 0.01) {
        fighter.grounded = false;
        fighter.supportPlatform = null;
      }
      return;
    }

    if (behavior.kind === "steered-rise") {
      const startFrame = Math.max(1, move.startup);
      if (action.frame < startFrame) return;
      const groundSupport = action.startedSupportPlatform
        ? this.stage.platforms.find((platform) => platform.id === action.startedSupportPlatform)
        : undefined;
      const staysOnAuthoredGround = Boolean(
        action.startedGrounded &&
        behavior.staysGroundedWhenStartedGrounded &&
        groundSupport &&
        platformContainsX(groundSupport, fighter.position.x),
      );
      if (action.frame === startFrame) {
        fighter.velocity.x *= 0.42;
        if (!staysOnAuthoredGround) {
          fighter.velocity.y = behavior.riseSpeed;
          fighter.grounded = false;
          fighter.supportPlatform = null;
        }
        action.specialPhase = "active";
      }
      if (staysOnAuthoredGround && groundSupport) {
        fighter.grounded = true;
        fighter.supportPlatform = groundSupport.id;
        fighter.position.y = platformTop(groundSupport, fighter.position.x) + fighter.definition.size.height / 2;
        fighter.velocity.y = 0;
      }
      if (action.frame <= startFrame + behavior.steerFrames) {
        if (!staysOnAuthoredGround) {
          // A recovery is authored as a sustained powered rise. Applying this
          // velocity only on its first frame let gravity erase nearly all of
          // Bowser, DK and open-fighter Up-B movement before the active phase.
          const riseProgress = clamp(
            (action.frame - startFrame) / Math.max(1, behavior.steerFrames),
            0,
            1,
          );
          const sustainedRiseSpeed = behavior.riseSpeed * (1 - riseProgress * 0.35);
          fighter.velocity.y = Math.max(fighter.velocity.y, sustainedRiseSpeed);
        }
        const horizontalInput = Math.abs(inputDirection.x) > 0.15
          ? inputDirection.x
          : 0;
        const targetVelocity = horizontalInput * behavior.horizontalSpeed;
        fighter.velocity.x = approach(
          fighter.velocity.x,
          targetVelocity,
          behavior.horizontalSpeed * 0.16,
        );
        if (horizontalInput !== 0) {
          fighter.facing = horizontalInput < 0 ? -1 : 1;
          action.lastSpecialDirection = {
            x: horizontalInput,
            y: action.startedGrounded && behavior.staysGroundedWhenStartedGrounded ? 0 : 1,
          };
        }
      }
      return;
    }

    if (behavior.kind === "directional-bursts") {
      if (!behavior.frames.includes(action.frame)) return;
      fighter.velocity = {
        x: normalized.x * behavior.speed,
        y: normalized.y * behavior.speed,
      };
      fighter.facing = normalized.x < -0.1 ? -1 : normalized.x > 0.1 ? 1 : fighter.facing;
      fighter.grounded = false;
      fighter.supportPlatform = null;
      action.lastSpecialDirection = normalized;
      action.specialPhase = "active";
      if (action.frame !== Math.max(1, move.startup)) {
        this.emit({
          type: "attack-active",
          slot: fighter.slot,
          move: action.name,
          position: cloneVec(fighter.position),
        });
      }
      return;
    }

    if (behavior.kind === "directional-launch") {
      const startFrame = Math.max(1, move.startup);
      if (action.frame === startFrame + DIRECTIONAL_LAUNCH_SUSTAIN_FRAMES) {
        fighter.velocity.x *= DIRECTIONAL_LAUNCH_EXIT_VELOCITY_RETENTION;
        fighter.velocity.y *= DIRECTIONAL_LAUNCH_EXIT_VELOCITY_RETENTION;
        return;
      }
      if (
        action.frame < startFrame ||
        action.frame >= startFrame + DIRECTIONAL_LAUNCH_SUSTAIN_FRAMES
      ) return;
      if (action.frame === startFrame) action.lastSpecialDirection = normalized;
      const launchDirection = action.lastSpecialDirection ?? normalized;
      fighter.velocity = {
        x: launchDirection.x * behavior.speed,
        y: launchDirection.y * behavior.speed,
      };
      fighter.facing = launchDirection.x < -0.1
        ? -1
        : launchDirection.x > 0.1
          ? 1
          : fighter.facing;
      fighter.grounded = false;
      fighter.supportPlatform = null;
      action.specialPhase = "active";
      return;
    }

    if (behavior.kind === "ground-steered") {
      const startFrame = Math.max(1, move.startup);
      if (action.frame < startFrame) return;
      const horizontalDirection = Math.abs(inputDirection.x) > 0.25
        ? Math.sign(inputDirection.x)
        : fighter.facing;
      fighter.facing = horizontalDirection < 0 ? -1 : 1;
      fighter.velocity.x = behavior.speed * fighter.facing;
      if (action.startedGrounded && fighter.grounded) fighter.velocity.y = 0;
      action.lastSpecialDirection = { x: fighter.facing, y: 0 };
      action.specialPhase = "active";
      return;
    }

    const startFrame = Math.max(1, move.startup);
    if (behavior.kind === "air-dive") {
      if (action.frame !== startFrame || action.startedGrounded) return;
      fighter.velocity.x *= 0.25;
      fighter.velocity.y = -behavior.diveSpeed;
      action.specialPhase = "active";
      return;
    }
    if (action.frame === startFrame) {
      fighter.velocity.x *= 0.2;
      fighter.velocity.y = action.startedGrounded ? behavior.riseSpeed : -behavior.diveSpeed;
      fighter.grounded = false;
      fighter.supportPlatform = null;
      action.specialPhase = "active";
      return;
    }
    if (action.startedGrounded && action.frame === startFrame + behavior.riseFrames) {
      fighter.velocity.x *= 0.2;
      fighter.velocity.y = -behavior.diveSpeed;
      action.specialPhase = "active";
      this.emit({
        type: "attack-active",
        slot: fighter.slot,
        move: action.name,
        position: cloneVec(fighter.position),
      });
    }
  }

  private integrateFighter(fighter: FighterRuntime, input: InputFrame): void {
    fighter.previousPosition = cloneVec(fighter.position);

    this.updateGroundSupport(fighter);

    // Holding down before reaching a one-way platform must be enough to pass
    // through it. Refreshing this short window while held also survives a
    // fast-fall across more than one simulation tick.
    if (
      !fighter.grounded &&
      input.held.has("down") &&
      normalizedDirection(input).y <= -0.45
    ) {
      fighter.dropThroughFrames = Math.max(fighter.dropThroughFrames, 6);
    }

    const canFloat = Boolean(
      !fighter.grounded &&
      fighter.definition.floatDurationFrames &&
      fighter.floatFramesRemaining > 0 &&
      input.held.has("jump") &&
      fighter.velocity.y <= 0 &&
      fighter.hitstunFrames === 0 &&
      fighter.dodgeFrames === 0 &&
      !fighter.airDodgeHelpless
    );
    fighter.floating = canFloat;
    if (canFloat) {
      fighter.floatFramesRemaining -= 1;
      fighter.velocity.y = 0;
      fighter.fastFalling = false;
      fighter.fastFallInputFrames = 0;
    }

    const usesAuthoredRootMotion = Boolean(
      fighter.action &&
      fighter.definition.attacks[fighter.action.name].specialMovement?.kind ===
        "authored-root-motion",
    );
    if (!fighter.grounded && !fighter.floating && !usesAuthoredRootMotion) {
      const authoredSpecialVelocity = Boolean(
        fighter.action?.specialPhase === "active" &&
        fighter.definition.attacks[fighter.action.name].specialMovement,
      );
      const fallLimit = authoredSpecialVelocity
        ? Number.POSITIVE_INFINITY
        : fighter.fastFalling
          ? fighter.definition.fastFallSpeed
          : fighter.definition.maxFallSpeed;
      fighter.velocity.y = Math.max(
        fighter.velocity.y - fighter.definition.gravity * FIXED_DT,
        -fallLimit,
      );
    }

    const movementVelocity = this.fighterWorldVelocity(fighter);
    fighter.position.x += movementVelocity.x * FIXED_DT;
    fighter.position.y += movementVelocity.y * FIXED_DT;

    // Re-evaluate after horizontal movement as well. Otherwise a grounded
    // fighter can keep a sloped support for one frame beyond its endpoint,
    // clamp to the old edge height, then visibly snap to the adjacent roof.
    this.updateGroundSupport(fighter);
    const walkableGround = new Set<string>();
    if (fighter.grounded) {
      const footY = fighter.position.y - fighter.definition.size.height / 2;
      for (const platform of this.stage.platforms) {
        const top = platformTop(platform, fighter.position.x);
        const halfWidth = fighter.definition.size.width * 0.28;
        const bodyOverlaps =
          fighter.position.x + halfWidth >= platformLeft(platform) &&
          fighter.position.x - halfWidth <= platformRight(platform);
        if (
          bodyOverlaps &&
          top >= footY - 12 &&
          top <= footY + 28
        ) {
          walkableGround.add(platform.id);
        }
      }
    }
    this.resolveGroundVolumeCollision(fighter, walkableGround);

    if (fighter.grounded && fighter.supportPlatform) {
      const support = this.stage.platforms.find(
        (platform) => platform.id === fighter.supportPlatform,
      );
      if (support) {
        fighter.position.y =
          platformTop(support, fighter.position.x) + fighter.definition.size.height / 2;
      }
    }

    // Prefer a valid side grab over landing on the outer lip of the stage.
    // This is deliberately before one-way landing resolution.
    if (!fighter.grounded && this.tryGrabLedge(fighter, input)) return;

    const collisionVelocity = this.fighterWorldVelocity(fighter);
    if (!fighter.grounded && collisionVelocity.y <= 0) {
      const halfHeight = fighter.definition.size.height / 2;
      const previousBottom = fighter.previousPosition.y - halfHeight;
      const currentBottom = fighter.position.y - halfHeight;
      let landing: PlatformSnapshot | null = null;
      let highestTop = Number.NEGATIVE_INFINITY;

      for (const platform of this.stage.platforms) {
        if (platform.kind === "platform" && fighter.dropThroughFrames > 0) continue;
        const previousTop = platformTop(platform, fighter.previousPosition.x);
        const top = platformTop(platform, fighter.position.x);
        const withinHorizontal =
          fighter.position.x + fighter.definition.size.width * 0.26 >=
            platform.position.x - platform.width / 2 &&
          fighter.position.x - fighter.definition.size.width * 0.26 <=
            platform.position.x + platform.width / 2;
        if (
          withinHorizontal &&
          previousBottom >= previousTop - 3 &&
          currentBottom <= top &&
          top > highestTop
        ) {
          landing = platform;
          highestTop = top;
        }
      }

      if (landing) {
        const wasAirborne = !fighter.grounded;
        const impactSpeed = Math.abs(collisionVelocity.y);
        const landingAction = fighter.action;
        const wavedash = fighter.dodgeKind === "air" && fighter.dodgeFrames > 0;
        const teching =
          fighter.hitstunFrames > 0 &&
          fighter.techable &&
          fighter.techWindowFrames > 0;
        const lCancelled = Boolean(
          landingAction &&
          AERIAL_NORMALS.has(landingAction.name) &&
          fighter.lCancelFrames > 0,
        );
        fighter.position.y = platformTop(landing, fighter.position.x) + halfHeight;
        fighter.velocity.y = 0;
        fighter.launchVelocity.y = 0;
        if (fighter.hitstunFrames > 0 && !teching) {
          fighter.velocity.x *= GROUND_HITSTUN_LANDING_VELOCITY_RETENTION;
          fighter.launchVelocity.x *= GROUND_HITSTUN_LANDING_VELOCITY_RETENTION;
        }
        fighter.grounded = true;
        fighter.supportPlatform = landing.id;
        fighter.jumpsRemaining = fighter.definition.maxJumps;
        fighter.floatFramesRemaining = fighter.definition.floatDurationFrames ?? 0;
        fighter.floating = false;
        fighter.fastFalling = false;
        fighter.fastFallInputFrames = 0;
        fighter.shortHopReleaseFrames = 0;
        fighter.airUpSpecialUsed = false;
        fighter.airDodgeUsed = false;
        fighter.airDodgeHelpless = false;
        fighter.coyoteFrames = 0;
        if (teching) {
          this.startGroundTech(fighter, input);
        } else if (wavedash) {
          fighter.dodgeFrames = 0;
          fighter.dodgeKind = null;
          fighter.wavedashFrames = WAVEDASH_LANDING_LAG_FRAMES;
          fighter.landingLagFrames = WAVEDASH_LANDING_LAG_FRAMES;
          fighter.state = "crouch";
        } else if (landingAction && AERIAL_NORMALS.has(landingAction.name)) {
          const baseLandingLag = landingLagFramesForAttack(
            fighter.definition.attacks[landingAction.name],
          );
          fighter.landingLagFrames = lCancelled
            ? Math.floor(baseLandingLag / 2)
            : baseLandingLag;
          fighter.action = null;
          fighter.state = "crouch";
        }
        fighter.lCancelFrames = 0;
        if (wasAirborne) {
          if (
            landingAction &&
            fighter.definition.attacks[landingAction.name].specialMovement?.kind === "rise-then-dive"
          ) {
            landingAction.specialPhase = "landing";
          }
          this.emit({
            type: "land",
            slot: fighter.slot,
            position: cloneVec(fighter.position),
            impactSpeed,
            lCancelled,
            wavedash,
            sound: lCancelled ? "l-cancel" : wavedash ? "wavedash" : "land",
          });
        }
        if (
          !fighter.action &&
          fighter.landingLagFrames === 0 &&
          fighter.hitstunFrames === 0 &&
          fighter.dodgeFrames === 0
        ) {
          fighter.state = "idle";
        }
      }
    }

    if (!fighter.grounded && !fighter.action && fighter.hitstunFrames === 0 && fighter.dodgeFrames === 0) {
      fighter.state = this.fighterWorldVelocity(fighter).y > 0 ? "jump" : "fall";
    }

    fighter.launchVelocity = decayMeleeLaunchVelocity(fighter.launchVelocity);
  }

  private updateGroundSupport(fighter: FighterRuntime): void {
    if (!fighter.grounded) return;
    const footY = fighter.position.y - fighter.definition.size.height / 2;
    const currentSupport = fighter.supportPlatform
      ? this.stage.platforms.find((platform) => platform.id === fighter.supportPlatform)
      : undefined;
    const adjacent = this.stage.platforms
      .filter((platform) =>
        platformContainsX(platform, fighter.position.x) &&
        platformTop(platform, fighter.position.x) >= footY - 12 &&
        platformTop(platform, fighter.position.x) <= footY + 28,
      )
      .sort(
        (a, b) =>
          platformTop(b, fighter.position.x) - platformTop(a, fighter.position.x),
      )[0];
    if (adjacent) {
      fighter.supportPlatform = adjacent.id;
      fighter.position.y =
        platformTop(adjacent, fighter.position.x) + fighter.definition.size.height / 2;
      return;
    }

    // A grounded fighter follows the authored surface of its current support.
    // The fixed 12-unit downward step tolerance above is useful for choosing
    // between overlapping platforms, but a fast fighter can legitimately move
    // farther than that down a steep slope in one frame. Keep that support
    // until its actual horizontal endpoint instead of making speed launch the
    // fighter off an otherwise continuous roof.
    if (currentSupport && platformContainsX(currentSupport, fighter.position.x)) {
      fighter.position.y =
        platformTop(currentSupport, fighter.position.x) + fighter.definition.size.height / 2;
      return;
    }

    const leavingGroundInHitstun = fighter.hitstunFrames > 0;
    fighter.grounded = false;
    fighter.supportPlatform = null;
    fighter.coyoteFrames = 6;
    if (leavingGroundInHitstun) {
      fighter.velocity.x *= GROUND_HITSTUN_EDGE_VELOCITY_RETENTION;
      fighter.launchVelocity.x *= GROUND_HITSTUN_EDGE_VELOCITY_RETENTION;
    }
    if (fighter.landingLagFrames > 0) {
      fighter.landingLagFrames = 0;
      fighter.wavedashFrames = 0;
      if (fighter.state === "crouch") fighter.state = "fall";
    }
  }

  /**
   * `ground` is a closed trapezoidal volume: its authored surface is the top,
   * `height` extrudes a parallel underside, and the two endpoints are solid
   * walls. One-way `platform` geometry deliberately never enters this path.
   */
  private resolveGroundVolumeCollision(
    fighter: FighterRuntime,
    ignoredPlatformIds: ReadonlySet<string> = new Set(),
    _input: InputFrame = EMPTY_INPUT,
    allowTech = true,
  ): void {
    const halfWidth = fighter.definition.size.width * 0.28;
    const halfHeight = fighter.definition.size.height / 2;
    const collision = findGroundVolumeCollision(
      this.stage.platforms,
      fighter.previousPosition,
      fighter.position,
      halfWidth,
      halfHeight,
      ignoredPlatformIds,
    );
    if (!collision) return;

    if (collision.face === "bottom") {
      fighter.position.y = platformBottom(collision.platform, fighter.position.x) - halfHeight - 0.01;
      if (
        allowTech &&
        fighter.hitstunFrames > 0 &&
        fighter.techable &&
        fighter.techWindowFrames > 0
      ) {
        this.startWallTech(fighter, "ceiling");
        return;
      }
      fighter.velocity.y = Math.min(0, fighter.velocity.y);
      fighter.launchVelocity.y = Math.min(0, fighter.launchVelocity.y);
      return;
    }

    const edgeX =
      collision.face === "left"
        ? platformLeft(collision.platform)
        : platformRight(collision.platform);
    fighter.position.x =
      edgeX + (collision.face === "left" ? -halfWidth - 0.01 : halfWidth + 0.01);
    if (
      allowTech &&
      fighter.hitstunFrames > 0 &&
      fighter.techable &&
      fighter.techWindowFrames > 0
    ) {
      this.startWallTech(
        fighter,
        collision.face === "left" ? "wall-left" : "wall-right",
      );
      return;
    }
    fighter.velocity.x = 0;
    fighter.launchVelocity.x = 0;
  }

  private tryGrabLedge(fighter: FighterRuntime, input: InputFrame): boolean {
    const inputDirection = normalizedDirection(input);
    if (
      fighter.ledgeCooldownFrames > 0 ||
      (fighter.dodgeKind === "air" && fighter.dodgeFrames > 0) ||
      this.fighterWorldVelocity(fighter).y > 260 ||
      inputDirection.y < -0.7 ||
      fighter.state === "hitstun"
    ) {
      return false;
    }

    const halfHeight = fighter.definition.size.height / 2;
    const halfWidth = fighter.definition.size.width * 0.28;
    for (const ledge of this.stage.ledges) {
      const { side, position: { x, y: ledgeY } } = ledge;
      const outward = side === "left" ? -1 : 1;
      const outwardDistance = (fighter.position.x - x) * outward;
      const bottom = fighter.position.y - halfHeight;
      const top = fighter.position.y + halfHeight;
      const occupied = this.fighters.some(
        (other) => other.slot !== fighter.slot && other.state === "ledge" && other.ledge === side,
      );
      if (
        occupied ||
        outwardDistance < -halfWidth * 0.35 ||
        outwardDistance > halfWidth + LEDGE_HORIZONTAL_CATCH_BONUS ||
        bottom > ledgeY + 20 ||
        top < ledgeY - LEDGE_VERTICAL_CATCH_BONUS
      ) {
        continue;
      }
      fighter.ledge = side;
      fighter.state = "ledge";
      fighter.grounded = false;
      fighter.supportPlatform = null;
      fighter.action = null;
      fighter.airUpSpecialUsed = false;
      fighter.airDodgeUsed = false;
      fighter.airDodgeHelpless = false;
      fighter.velocity = { x: 0, y: 0 };
      this.clearLaunchVelocity(fighter);
      fighter.ledgeHangFrames = LEDGE_MAX_HANG_FRAMES;
      const towardStage = side === "left" ? inputDirection.x > 0.35 : inputDirection.x < -0.35;
      fighter.ledgeDirectionReleased = inputDirection.y <= 0.35 && !towardStage;
      fighter.facing = (-outward) as -1 | 1;
      fighter.position = {
        x: x + outward * (halfWidth + 2),
        y: ledgeY - halfHeight * 0.3,
      };
      fighter.invulnerableFrames = Math.max(fighter.invulnerableFrames, 35);
      this.emit({ type: "ledge", slot: fighter.slot, position: cloneVec(fighter.position), sound: "ledge" });
      return true;
    }
    return false;
  }

  private updateLedge(fighter: FighterRuntime, input: InputFrame): void {
    const side = fighter.ledge;
    if (!side) {
      fighter.state = "fall";
      return;
    }
    const direction = normalizedDirection(input);
    const towardStage = side === "left" ? direction.x > 0.35 : direction.x < -0.35;
    const ledge = this.stage.ledges.find((candidate) => candidate.side === side);
    const support = ledge
      ? this.stage.platforms.find((platform) => platform.id === ledge.platformId)
      : undefined;
    const fallback = this.mainPlatform();
    const ledgePlatform = support ?? fallback;
    const ledgeX = ledge?.position.x ??
      (side === "left" ? platformLeft(ledgePlatform) : platformRight(ledgePlatform));

    fighter.ledgeHangFrames = Math.max(0, fighter.ledgeHangFrames - 1);
    if (fighter.ledgeHangFrames === 0) {
      fighter.ledge = null;
      fighter.ledgeCooldownFrames = 35;
      fighter.position.y -= 8;
      fighter.velocity = { x: 0, y: -90 };
      fighter.jumpsRemaining = Math.max(fighter.jumpsRemaining, 1);
      fighter.state = "fall";
      return;
    }

    if (input.pressed.has("jump")) {
      this.consumeBufferedAction(fighter, "jump");
      fighter.ledge = null;
      fighter.ledgeHangFrames = 0;
      fighter.ledgeCooldownFrames = 30;
      fighter.velocity = { x: side === "left" ? 145 : -145, y: fighter.definition.jumpSpeed * 0.82 };
      fighter.state = "jump";
      this.emit({ type: "jump", slot: fighter.slot, position: cloneVec(fighter.position), sound: "ledge-jump" });
      return;
    }

    if (input.pressed.has("down") || (direction.y < -0.65 && input.pressed.has("shield"))) {
      fighter.ledge = null;
      fighter.ledgeHangFrames = 0;
      fighter.ledgeCooldownFrames = 35;
      fighter.position.y -= 8;
      fighter.velocity.y = -90;
      fighter.jumpsRemaining = Math.max(fighter.jumpsRemaining, 1);
      fighter.state = "fall";
      return;
    }

    const leaveLedgeOnStage = (): void => {
      fighter.ledge = null;
      fighter.ledgeHangFrames = 0;
      fighter.ledgeCooldownFrames = 25;
      fighter.grounded = true;
      fighter.supportPlatform = ledgePlatform.id;
      const landingX =
        ledgeX +
        (side === "left"
          ? fighter.definition.size.width * 0.62
          : -fighter.definition.size.width * 0.62);
      fighter.position = {
        x: landingX,
        y: platformTop(ledgePlatform, landingX) + fighter.definition.size.height / 2,
      };
      fighter.velocity = { x: 0, y: 0 };
      fighter.airUpSpecialUsed = false;
      fighter.state = "idle";
    };

    if (input.pressed.has("shield") || input.pressed.has("grab")) {
      this.consumeBufferedAction(
        fighter,
        input.pressed.has("shield") ? "shield" : "grab",
      );
      leaveLedgeOnStage();
      this.startDodge(fighter, { x: side === "left" ? 1 : -1, y: 0 });
      return;
    }

    if (input.pressed.has("attack")) {
      this.consumeBufferedAction(fighter, "attack");
      leaveLedgeOnStage();
      this.startMove(fighter, "forward-tilt", input);
      return;
    }

    const climbDirectionHeld = towardStage || direction.y > 0.35;
    if (!fighter.ledgeDirectionReleased) {
      if (!climbDirectionHeld) fighter.ledgeDirectionReleased = true;
      return;
    }
    if (climbDirectionHeld) {
      leaveLedgeOnStage();
    }
  }

  private consumeTechWindow(fighter: FighterRuntime): void {
    fighter.techWindowFrames = 0;
    fighter.techLockoutFrames = Math.max(
      fighter.techLockoutFrames,
      TECH_INPUT_LOCKOUT_FRAMES,
    );
    fighter.techable = false;
    fighter.hitstunFrames = 0;
    fighter.action = null;
    fighter.landingLagFrames = 0;
    fighter.wavedashFrames = 0;
    this.clearLaunchVelocity(fighter);
    if (fighter.bufferedAction === "shield") this.clearBufferedAction(fighter);
  }

  private startGroundTech(fighter: FighterRuntime, input: InputFrame): void {
    this.consumeTechWindow(fighter);
    const direction = normalizedDirection(input);
    const rollDirection = Math.abs(direction.x) >= 0.35 ? Math.sign(direction.x) : 0;
    fighter.state = "dodge";
    fighter.dodgeFrames = TECH_NEUTRAL_FRAMES;
    fighter.invulnerableFrames = Math.max(
      fighter.invulnerableFrames,
      TECH_INVULNERABLE_FRAMES,
    );
    let techKind: NonNullable<GameEvent["techKind"]> = "neutral";
    if (rollDirection === 0) {
      fighter.dodgeKind = "spot";
      fighter.velocity.x = 0;
    } else {
      fighter.dodgeKind = rollDirection * fighter.facing > 0 ? "forward" : "back";
      fighter.velocity.x = rollDirection * 390;
      techKind = rollDirection < 0 ? "roll-left" : "roll-right";
    }
    this.emit({
      type: "dodge",
      slot: fighter.slot,
      position: cloneVec(fighter.position),
      techKind,
      sound: "dodge",
    });
  }

  private startWallTech(
    fighter: FighterRuntime,
    techKind: "wall-left" | "wall-right" | "ceiling",
  ): void {
    this.consumeTechWindow(fighter);
    fighter.grounded = false;
    fighter.supportPlatform = null;
    fighter.state = "dodge";
    fighter.dodgeKind = "air";
    fighter.dodgeFrames = TECH_NEUTRAL_FRAMES;
    fighter.invulnerableFrames = Math.max(
      fighter.invulnerableFrames,
      TECH_INVULNERABLE_FRAMES,
    );
    if (techKind === "ceiling") {
      fighter.velocity = { x: fighter.velocity.x * 0.35, y: -180 };
    } else {
      const outward = techKind === "wall-left" ? -1 : 1;
      fighter.velocity = {
        x: outward * 220,
        y: Math.max(150, fighter.velocity.y * 0.25),
      };
    }
    this.emit({
      type: "dodge",
      slot: fighter.slot,
      position: cloneVec(fighter.position),
      techKind,
      sound: "dodge",
    });
  }

  private startDodge(fighter: FighterRuntime, direction: Vec2): void {
    const airborne = !fighter.grounded;
    fighter.state = "dodge";
    fighter.action = null;
    this.clearLaunchVelocity(fighter);
    fighter.dodgeFrames = airborne ? 49 : 25;
    fighter.invulnerableFrames = airborne ? 26 : 15;
    if (airborne) {
      fighter.dodgeKind = "air";
      fighter.airDodgeUsed = true;
      fighter.airDodgeHelpless = true;
      const magnitude = Math.hypot(direction.x, direction.y);
      const boost =
        fighter.definition.runSpeed * fighter.speedMultiplier * AIR_DODGE_SPEED_MULTIPLIER;
      fighter.velocity =
        magnitude > 0.2
          ? { x: direction.x * boost, y: direction.y * boost }
          : { x: 0, y: 0 };
      fighter.fastFalling = false;
    } else {
      if (Math.abs(direction.x) <= 0.15) {
        fighter.dodgeKind = "spot";
        fighter.velocity.x = 0;
      } else {
        const rollDirection = Math.sign(direction.x);
        fighter.dodgeKind = rollDirection * fighter.facing > 0 ? "forward" : "back";
        fighter.velocity.x = rollDirection * 455;
      }
    }
    this.emit({ type: "dodge", slot: fighter.slot, position: cloneVec(fighter.position), sound: "dodge" });
  }

  private startGrab(fighter: FighterRuntime): void {
    fighter.state = "grab";
    fighter.velocity.x *= 0.3;
    const target = this.fighters[slotOther(fighter.slot)];
    const horizontal = (target.position.x - fighter.position.x) * fighter.facing;
    const vertical = Math.abs(target.position.y - fighter.position.y);
    const grabbable =
      horizontal > -8 &&
      horizontal < 86 &&
      vertical < (fighter.definition.size.height + target.definition.size.height) * 0.46 &&
      target.invulnerableFrames === 0 &&
      target.state !== "ko" &&
      target.state !== "grabbed" &&
      target.state !== "ledge";

    if (!grabbable) {
      fighter.grabFrames = 23;
      return;
    }

    fighter.grabTarget = target.slot;
    fighter.grabFrames = 1;
    target.grabbedBy = fighter.slot;
    target.state = "grabbed";
    target.action = null;
    target.velocity = { x: 0, y: 0 };
    this.clearLaunchVelocity(target);
    target.grounded = false;
    target.supportPlatform = null;
    this.followGrabber(target);
    this.emit({
      type: "grab",
      slot: fighter.slot,
      target: target.slot,
      position: cloneVec(target.position),
      sound: "grab",
    });
  }

  private followGrabber(fighter: FighterRuntime): void {
    if (fighter.grabbedBy === null) {
      fighter.state = "fall";
      return;
    }
    const grabber = this.fighters[fighter.grabbedBy];
    if (grabber.grabTarget !== fighter.slot) {
      fighter.grabbedBy = null;
      fighter.state = "fall";
      return;
    }
    const grabDistance =
      (grabber.definition.size.width + fighter.definition.size.width) * 0.25;
    const grabberFeet = grabber.position.y - grabber.definition.size.height / 2;
    fighter.position = {
      x: grabber.position.x + grabber.facing * grabDistance,
      y: grabberFeet + fighter.definition.size.height / 2 + 4,
    };
    fighter.previousPosition = cloneVec(fighter.position);
    fighter.facing = grabber.facing === 1 ? -1 : 1;
  }

  private updateHeldGrab(
    fighter: FighterRuntime,
    input: InputFrame,
    targetInput: InputFrame,
  ): void {
    const targetSlot = fighter.grabTarget;
    if (targetSlot === null) return;
    const target = this.fighters[targetSlot];
    fighter.grabFrames += 1;
    fighter.state = "grab";
    fighter.velocity.x = 0;
    this.followGrabber(target);

    let throwName: ThrowName | null = null;
    if (fighter.grabFrames > 3) {
      if (input.pressed.has("up")) throwName = "up";
      else if (input.pressed.has("down")) throwName = "down";
      else if (input.pressed.has("left") || input.pressed.has("right")) {
        const pressedHorizontal = input.pressed.has("left") ? -1 : 1;
        throwName = pressedHorizontal * fighter.facing < 0 ? "back" : "forward";
      } else if (input.pressed.has("attack") || input.pressed.has("grab")) {
        throwName = "forward";
      } else if (fighter.grabFrames >= 65) {
        throwName = "forward";
      }
    }

    if (throwName) this.performThrow(fighter, target, throwName, targetInput);
  }

  private performThrow(
    fighter: FighterRuntime,
    target: FighterRuntime,
    name: ThrowName,
    targetInput: InputFrame,
  ): void {
    const throwDefinition = fighter.definition.throws[name];
    target.grabbedBy = null;
    fighter.grabTarget = null;
    fighter.grabFrames = 16;
    fighter.throwAnimation = name;
    fighter.state = "grab";
    const throwDirection = name === "forward"
      ? fighter.facing
      : name === "back"
        ? -fighter.facing
        : 0;
    if (throwDirection !== 0) {
      const separation =
        (fighter.definition.size.width + target.definition.size.width) * 0.34 + 2;
      target.position.x = fighter.position.x + throwDirection * separation;
      target.previousPosition = cloneVec(target.position);
    }
    const baseAngle = throwDefinition.angle;
    const angle = fighter.facing === 1 ? baseAngle : (180 - baseAngle + 360) % 360;
    this.applyLaunch(
      target,
      fighter,
      throwDefinition.damage * fighter.damageMultiplier,
      angle,
      throwDefinition.baseKnockback,
      throwDefinition.knockbackGrowth,
      6,
      targetInput,
    );
    this.emit({
      type: "throw",
      slot: fighter.slot,
      target: target.slot,
      position: cloneVec(target.position),
      value: throwDefinition.damage,
      damage: throwDefinition.damage,
      source: "throw",
      velocity: this.fighterWorldVelocity(target),
      sound: "throw",
    });
  }

  private breakShield(fighter: FighterRuntime): void {
    fighter.shield = fighter.definition.shieldHealth * 0.28;
    fighter.shieldLockFrames = 210;
    fighter.hitstunFrames = 135;
    fighter.techable = false;
    fighter.techWindowFrames = 0;
    fighter.state = "hitstun";
    fighter.grounded = false;
    fighter.supportPlatform = null;
    fighter.velocity = { x: 0, y: 430 };
    this.clearLaunchVelocity(fighter);
    this.emit({
      type: "shield-break",
      slot: fighter.slot,
      position: cloneVec(fighter.position),
      sound: "shield-break",
    });
  }

  private respawnFighter(fighter: FighterRuntime): void {
    const x = fighter.slot === 0 ? -150 : 150;
    fighter.position = { x, y: 390 };
    fighter.previousPosition = cloneVec(fighter.position);
    fighter.velocity = { x: 0, y: 0 };
    this.clearLaunchVelocity(fighter);
    fighter.percent = 0;
    fighter.state = "respawn";
    fighter.respawnFrames = 45;
    fighter.grounded = false;
    fighter.supportPlatform = null;
    fighter.jumpsRemaining = fighter.definition.maxJumps;
    fighter.fastFalling = false;
    fighter.fastFallInputFrames = 0;
    fighter.floatFramesRemaining = fighter.definition.floatDurationFrames ?? 0;
    fighter.floating = false;
    fighter.airUpSpecialUsed = false;
    fighter.airDodgeUsed = false;
    fighter.airDodgeHelpless = false;
    fighter.analogRunning = false;
    fighter.invulnerableFrames = 120;
    fighter.action = null;
    fighter.hitstopFrames = 0;
    fighter.hitstopElapsedFrames = 0;
    fighter.hitstunFrames = 0;
    fighter.launchBaseAngle = null;
    fighter.pendingHitstopDi = null;
    fighter.sdiRegion = null;
    fighter.asdiDirection = null;
    fighter.techWindowFrames = 0;
    fighter.techLockoutFrames = 0;
    fighter.techable = false;
    fighter.statusEffect = null;
    fighter.statusResistanceFrames = 0;
    fighter.lastHitMove = null;
    fighter.consecutiveHitMoveCount = 0;
    fighter.dodgeFrames = 0;
    fighter.dodgeKind = null;
    fighter.jumpSquatFrames = 0;
    fighter.fullHopRequested = true;
    fighter.shortHopReleaseFrames = 0;
    fighter.landingLagFrames = 0;
    fighter.wavedashFrames = 0;
    fighter.lCancelFrames = 0;
    this.clearBufferedAction(fighter);
    this.clearSmashDirection(fighter);
    fighter.dashFrames = 0;
    fighter.turnFrames = 0;
    fighter.tauntFrames = 0;
    fighter.attackLockFrames = 0;
    fighter.grabFrames = 0;
    fighter.throwAnimation = null;
    fighter.lastHitBy = null;
    fighter.lastHitFrames = 0;
    fighter.ledge = null;
    fighter.ledgeDirectionReleased = false;
    fighter.heldItem = null;
    fighter.itemUseFrames = 0;
    fighter.itemAction = null;
    fighter.damageMultiplier = 1;
    fighter.damageBuffFrames = 0;
    fighter.speedMultiplier = 1;
    fighter.speedBuffFrames = 0;
    fighter.jumpMultiplier = 1;
    fighter.jumpBuffFrames = 0;
    fighter.defenseMultiplier = 1;
    fighter.defenseBuffFrames = 0;
    fighter.projectileShieldFrames = 0;
    this.emit({ type: "respawn", slot: fighter.slot, position: cloneVec(fighter.position), sound: "respawn" });
  }

  private resolveFighterOverlap(): void {
    const first = this.fighters[0];
    const second = this.fighters[1];
    const rolling = (fighter: FighterRuntime): boolean =>
      fighter.state === "dodge" &&
      (fighter.dodgeKind === "forward" || fighter.dodgeKind === "back");
    if (
      first.state === "ko" ||
      second.state === "ko" ||
      first.state === "grabbed" ||
      second.state === "grabbed" ||
      first.state === "ledge" ||
      second.state === "ledge" ||
      rolling(first) ||
      rolling(second)
    ) {
      return;
    }
    const verticalDistance = Math.abs(first.position.y - second.position.y);
    const verticalLimit = (first.definition.size.height + second.definition.size.height) * 0.35;
    if (verticalDistance > verticalLimit) return;
    const minimumDistance = (first.definition.size.width + second.definition.size.width) * 0.34;
    const delta = second.position.x - first.position.x;
    if (Math.abs(delta) >= minimumDistance) return;
    const direction = delta === 0 ? 1 : Math.sign(delta);
    const correction = (minimumDistance - Math.abs(delta)) / 2;
    first.position.x -= direction * correction;
    second.position.x += direction * correction;
  }

  private activeWorldHitboxes(
    fighter: FighterRuntime,
    action: ActiveMove,
    move: AttackDefinition,
  ): Array<ActiveMeleeHitbox & { position: Vec2 }> {
    const activeFrame = action.frame - move.startup;
    return competitiveHitboxesForMove(action.name, move, activeFrame).map((hitbox) => ({
      ...hitbox,
      position: {
        x: fighter.position.x + hitbox.offset.x * fighter.facing,
        y: fighter.position.y + hitbox.offset.y,
      },
    }));
  }

  private attackCanClank(
    fighter: FighterRuntime,
    action: ActiveMove,
    move: AttackDefinition,
  ): boolean {
    const active = action.frame >= move.startup && action.frame < move.startup + move.active;
    return Boolean(
      active &&
      !action.charging &&
      fighter.grounded &&
      action.startedGrounded &&
      !action.name.endsWith("special") &&
      !move.commandGrab &&
      !move.counters &&
      (!move.projectile || move.alsoMelee),
    );
  }

  private cancelAttackForClank(fighter: FighterRuntime, reboundFrames: number): void {
    fighter.action = null;
    fighter.velocity.x *= 0.2;
    fighter.hitstopFrames = Math.max(fighter.hitstopFrames, 2);
    fighter.landingLagFrames = Math.max(fighter.landingLagFrames, reboundFrames);
    fighter.attackLockFrames = Math.max(fighter.attackLockFrames, reboundFrames);
    fighter.state = fighter.grounded ? "crouch" : "fall";
  }

  /** Melee ground attacks clank by post-multiplier damage, not a hidden priority stat. */
  private resolveAttackClank(): void {
    const first = this.fighters[0];
    const second = this.fighters[1];
    const firstAction = first.action;
    const secondAction = second.action;
    if (!firstAction || !secondAction) return;
    const firstMove = first.definition.attacks[firstAction.name];
    const secondMove = second.definition.attacks[secondAction.name];
    if (
      !this.attackCanClank(first, firstAction, firstMove) ||
      !this.attackCanClank(second, secondAction, secondMove)
    ) return;

    const firstHitboxes = this.activeWorldHitboxes(first, firstAction, firstMove)
      .sort((left, right) => right.priority - left.priority);
    const secondHitboxes = this.activeWorldHitboxes(second, secondAction, secondMove)
      .sort((left, right) => right.priority - left.priority);
    const collision = firstHitboxes.flatMap((firstHitbox) =>
      secondHitboxes.map((secondHitbox) => ({ firstHitbox, secondHitbox })))
      .find(({ firstHitbox, secondHitbox }) =>
        distanceSquared(firstHitbox.position, secondHitbox.position) <=
          (firstHitbox.radius + secondHitbox.radius) ** 2);
    if (!collision) return;

    const firstDamage = firstMove.damage *
      collision.firstHitbox.damageMultiplier *
      this.chargeScale(firstMove, firstAction.chargeFrames);
    const secondDamage = secondMove.damage *
      collision.secondHitbox.damageMultiplier *
      this.chargeScale(secondMove, secondAction.chargeFrames);
    const reboundDamage = Math.max(firstDamage, secondDamage);
    const reboundFrames = meleeClankReboundFrames(reboundDamage);
    const outcome = meleeClankOutcome(firstDamage, secondDamage);
    if (outcome === "both") {
      this.cancelAttackForClank(first, reboundFrames);
      this.cancelAttackForClank(second, reboundFrames);
    } else if (outcome === "first") {
      this.cancelAttackForClank(first, reboundFrames);
    } else {
      this.cancelAttackForClank(second, reboundFrames);
    }
    this.emit({
      type: "clank",
      position: {
        x: (collision.firstHitbox.position.x + collision.secondHitbox.position.x) / 2,
        y: (collision.firstHitbox.position.y + collision.secondHitbox.position.y) / 2,
      },
      value: reboundDamage,
      sound: "clank",
    });
  }

  private resolveMeleeHits(inputs: InputPair): void {
    this.resolveAttackClank();
    // Preserve attacks that were active at the start of collision resolution.
    // Otherwise player 1 would erase player 2's same-frame trade by applying
    // hitstun first, creating a hidden controller-port priority.
    const activeActions = [this.fighters[0].action, this.fighters[1].action] as const;
    for (const attacker of this.fighters) {
      const action = activeActions[attacker.slot];
      if (!action || action.charging) continue;
      const move = attacker.definition.attacks[action.name];
      if (
        (move.projectile && !move.alsoMelee) ||
        move.counters ||
        (
          move.damage <= 0 &&
          action.specialStoredDamage <= 0 &&
          (move.absorbsProjectiles || move.reflectsProjectiles)
        )
      ) continue;
      const firstActiveFrame = move.startup;
      const lastActiveFrame = move.startup + move.active - 1;
      if (action.frame < firstActiveFrame || action.frame > lastActiveFrame) continue;

      const target = this.fighters[slotOther(attacker.slot)];
      const effectiveMove: AttackDefinition = action.specialStoredDamage > 0
        ? {
            ...move,
            damage: Math.min(60, Math.max(8, action.specialStoredDamage * 1.5)),
            baseKnockback: Math.max(65, move.baseKnockback),
            knockbackGrowth: Math.max(1.02, move.knockbackGrowth),
            shieldDamage: Math.max(18, action.specialStoredDamage),
            radius: Math.max(68, move.radius),
          }
        : move;
      const maximumHits = Math.max(1, effectiveMove.multiHit ?? 1);
      const landedHits = action.hitCounts.get(target.slot) ?? 0;
      const lastHitFrame = action.lastHitFrame.get(target.slot);
      const rehitFrames = maximumHits > 1
        ? Math.max(1, Math.floor((move.active - 1) / (maximumHits - 1)))
        : move.active;
      if (
        landedHits >= maximumHits ||
        (maximumHits === 1 && action.hitTargets.has(target.slot)) ||
        (lastHitFrame !== undefined && action.frame - lastHitFrame < rehitFrames) ||
        target.state === "ko" ||
        target.state === "grabbed" ||
        target.invulnerableFrames > 0
      ) {
        continue;
      }

      if (
        effectiveMove.requiresFacingTarget &&
        target.facing !== (target.position.x < attacker.position.x ? 1 : -1)
      ) continue;
      const hitbox = this.activeWorldHitboxes(attacker, action, effectiveMove)
        .filter((candidate) =>
          circleIntersectsFighter(target, candidate.position, candidate.radius))
        .sort((left, right) => right.priority - left.priority)[0];
      if (!hitbox) continue;

      action.hitTargets.add(target.slot);
      action.hitCounts.set(target.slot, landedHits + 1);
      action.lastHitFrame.set(target.slot, action.frame);
      const chargeScale = this.chargeScale(move, action.chargeFrames);
      const isFinisher = landedHits + 1 >= maximumHits;
      const usesVariantDamage =
        (attacker.fighter === "mr-game-and-watch" && action.name === "side-special") ||
        (attacker.fighter === "luigi" && action.name === "side-special" && action.specialVariant === 1);
      const variantDamage =
        attacker.fighter === "mr-game-and-watch" && action.name === "side-special"
          ? ([2, 4, 6, 8, 10, 12, 14, 16, 32][(action.specialVariant ?? 1) - 1] ?? move.damage)
          : attacker.fighter === "luigi" && action.name === "side-special" && action.specialVariant === 1
            ? 25
          : move.damage;
      const damageScale =
        usesVariantDamage
          ? chargeScale * variantDamage / Math.max(1, move.damage) /
            maximumHits * (maximumHits > 1 ? 1 : hitbox.damageMultiplier)
          : chargeScale / maximumHits * (maximumHits > 1 ? 1 : hitbox.damageMultiplier);
      const launchScale = maximumHits > 1 && !isFinisher
        ? chargeScale * 0.16
        : chargeScale * (maximumHits > 1 ? 1 : hitbox.knockbackMultiplier);
      this.resolveAttackHit(
        attacker,
        target,
        effectiveMove,
        action.name,
        inputs[target.slot],
        damageScale,
        "melee",
        launchScale,
        maximumHits > 1 && !isFinisher,
        !move.commandGrab,
      );
    }
  }

  private chargeScale(move: AttackDefinition, chargeFrames: number): number {
    if (!move.chargeable) return 1;
    return 1 + clamp(chargeFrames / (move.maxChargeFrames ?? 1), 0, 1) * 0.5;
  }

  private refreshRecoveryAfterAirHit(target: FighterRuntime): void {
    if (target.grounded) return;
    // A defender knocked out of an aerial resource gets one route back to the
    // stage without replenishing every bonus jump owned by floaty fighters.
    target.jumpsRemaining = Math.max(target.jumpsRemaining, 1);
    target.airUpSpecialUsed = false;
  }

  private resolveAttackHit(
    attacker: FighterRuntime,
    target: FighterRuntime,
    move: AttackDefinition,
    moveName: MoveName,
    targetInput: InputFrame,
    damageScale = 1,
    source: GameEvent["source"] = "melee",
    launchScale = damageScale,
    intermediateMultiHit = false,
    canBeCountered = true,
    launchFacing: -1 | 1 = attacker.facing,
  ): void {
    if (canBeCountered) {
      const counterAction = target.action;
      const counterMove = counterAction
        ? target.definition.attacks[counterAction.name]
        : null;
      const counterActive = Boolean(
        counterAction &&
        counterMove?.counters &&
        !counterAction.hitTargets.has(attacker.slot) &&
        defensiveMoveActiveAtFrame(counterAction.frame, counterMove)
      );
      if (counterActive && counterAction && counterMove) {
        counterAction.hitTargets.add(attacker.slot);
        target.invulnerableFrames = Math.max(
          target.invulnerableFrames,
          counterMove.active + counterMove.recovery,
        );
        const incomingDamage = move.damage * damageScale;
        const counterScale = Math.max(
          1,
          incomingDamage * 1.2 / Math.max(1, counterMove.damage),
        );
        this.resolveAttackHit(
          target,
          attacker,
          counterMove,
          counterAction.name,
          EMPTY_INPUT,
          counterScale,
          "melee",
          counterScale,
          false,
          false,
        );
        return;
      }
    }
    if (attacker.fighter === "mario" && moveName === "down-special") {
      this.refreshRecoveryAfterAirHit(target);
      this.clearLaunchVelocity(target);
      target.velocity = {
        x: attacker.facing * (310 + Math.min(210, target.percent * 1.25)) * damageScale,
        y: Math.max(70, target.velocity.y),
      };
      target.grounded = false;
      target.supportPlatform = null;
      target.state = "hitstun";
      target.techable = false;
      target.techWindowFrames = 0;
      target.hitstunFrames = Math.max(target.hitstunFrames, 7);
      this.emit({
        type: "hit",
        slot: attacker.slot,
        target: target.slot,
        move: moveName,
        position: cloneVec(target.position),
        value: 0,
        damage: 0,
        source,
        velocity: this.fighterWorldVelocity(target),
        sound: "water-push",
      });
      return;
    }
    if (!move.commandGrab && target.state === "shield" && target.shield > 0) {
      const shieldDamage = move.shieldDamage * damageScale * attacker.damageMultiplier;
      target.shield = Math.max(0, target.shield - shieldDamage);
      target.shieldStunFrames = Math.max(target.shieldStunFrames, Math.round(4 + shieldDamage * 0.7));
      target.velocity.x += attacker.facing * Math.min(190, 35 + shieldDamage * 6);
      attacker.hitstopFrames = Math.max(attacker.hitstopFrames, Math.ceil(move.hitstop * 0.7));
      target.hitstopFrames = Math.max(target.hitstopFrames, Math.ceil(move.hitstop * 0.7));
      this.emit({
        type: "shield-hit",
        slot: attacker.slot,
        target: target.slot,
        move: moveName,
        position: cloneVec(target.position),
        value: shieldDamage,
        source,
        sound: "shield-hit",
      });
      if (target.shield <= 0) this.breakShield(target);
      return;
    }

    if (
      move.statusEffect &&
      target.statusEffect === null &&
      target.statusResistanceFrames === 0 &&
      (move.statusEffect !== "bury" || target.grounded)
    ) {
      this.refreshRecoveryAfterAirHit(target);
      const continuingSequence =
        target.hitstunFrames > 0 &&
        target.lastHitBy === attacker.slot &&
        target.lastHitMove === moveName;
      target.velocity = { x: 0, y: 0 };
      this.clearLaunchVelocity(target);
      target.launchBaseAngle = null;
      target.pendingHitstopDi = null;
      target.hitstopElapsedFrames = 0;
      target.sdiRegion = null;
      target.asdiDirection = null;
      target.techable = false;
      target.techWindowFrames = 0;
      target.action = null;
      target.state = "hitstun";
      target.hitstunFrames = Math.max(target.hitstunFrames, move.statusFrames ?? 60);
      target.statusEffect = move.statusEffect;
      target.lastHitBy = attacker.slot;
      target.lastHitMove = moveName;
      target.consecutiveHitMoveCount = continuingSequence
        ? target.consecutiveHitMoveCount + 1
        : 1;
      target.lastHitFrames = 600;
      const damage = move.damage * damageScale * attacker.damageMultiplier;
      target.percent = Math.max(0, target.percent + damage * target.defenseMultiplier);
      attacker.hitstopFrames = Math.max(attacker.hitstopFrames, move.hitstop);
      target.hitstopFrames = Math.max(target.hitstopFrames, move.hitstop + 1);
      this.emit({
        type: "hit",
        slot: attacker.slot,
        target: target.slot,
        move: moveName,
        position: cloneVec(target.position),
        value: damage,
        damage,
        source,
        velocity: this.fighterWorldVelocity(target),
        sound: "special",
      });
      return;
    }

    const damage = move.damage * damageScale * attacker.damageMultiplier;
    const baseAngle = launchFacing === 1 ? move.angle : (180 - move.angle + 360) % 360;
    const continuingSequence =
      (move.multiHit ?? 1) === 1 &&
      target.hitstunFrames > 0 &&
      target.lastHitBy === attacker.slot &&
      target.lastHitMove === moveName;
    const nextConsecutiveCount = continuingSequence
      ? target.consecutiveHitMoveCount + 1
      : 1;
    const repeatedLock =
      continuingSequence && nextConsecutiveCount >= SAME_MOVE_LOCK_BREAK_HIT;
    const starterBaseScale = comboStarterBaseKnockbackScale(moveName, target.percent);
    const repeatedLaunchScale = repeatedLock
      ? SAME_MOVE_LOCK_BREAK_LAUNCH_MULTIPLIER
      : 1;
    this.applyLaunch(
      target,
      attacker,
      damage,
      baseAngle,
      move.baseKnockback * starterBaseScale * launchScale *
        repeatedLaunchScale,
      move.knockbackGrowth * launchScale *
        repeatedLaunchScale,
      move.hitstun * (intermediateMultiHit ? 0.22 : repeatedLock ? 0.45 : 1),
      targetInput,
      intermediateMultiHit ? 8 : 0,
      intermediateMultiHit ? 3 : 7,
    );
    if (
      intermediateMultiHit &&
      moveName.endsWith("special") &&
      attacker.definition.attacks[moveName].specialMovement
    ) {
      // Traveling multi-hits carry their victim through the authored motion;
      // otherwise the first weak hit leaves the target behind before the
      // official finisher can connect (notably Screw Attack and rising spins).
      const carrySpeed = Math.hypot(attacker.velocity.x, attacker.velocity.y);
      const carryScale = carrySpeed > 0 ? Math.min(0.92, 220 / carrySpeed) : 0;
      target.velocity = {
        x: attacker.velocity.x * carryScale,
        y: attacker.velocity.y * carryScale,
      };
      this.clearLaunchVelocity(target);
      target.position = {
        x: attacker.position.x + move.offset.x * attacker.facing * 0.28,
        y: attacker.position.y + move.offset.y * 0.28,
      };
      target.previousPosition = cloneVec(target.position);
    }
    target.lastHitMove = moveName;
    target.consecutiveHitMoveCount = nextConsecutiveCount;
    const hitstop = intermediateMultiHit
      ? Math.max(1, Math.round(move.hitstop * 0.4))
      : move.hitstop;
    attacker.hitstopFrames = Math.max(attacker.hitstopFrames, hitstop);
    target.hitstopFrames = Math.max(
      target.hitstopFrames,
      intermediateMultiHit ? hitstop : hitstop + 1,
    );
    if (move.reversesFacing) {
      target.facing = target.facing === 1 ? -1 : 1;
    }
    this.emit({
      type: "hit",
      slot: attacker.slot,
      target: target.slot,
      move: moveName,
      position: cloneVec(target.position),
      value: damage,
      damage,
      source,
      velocity: this.fighterWorldVelocity(target),
      sound: !intermediateMultiHit && move.damage >= 15
        ? "hit-heavy"
        : !intermediateMultiHit && move.damage >= 8
          ? "hit-medium"
          : "hit-light",
    });
  }

  private directionalInfluenceAngle(baseAngle: number, direction: Vec2): number {
    if (Math.hypot(direction.x, direction.y) <= 0.25) return baseAngle;
    const desired = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
    const signedDifference = ((desired - baseAngle + 540) % 360) - 180;
    return baseAngle + clamp(signedDifference, -18, 18);
  }

  /** Move during hitlag without applying gravity or allowing a capsule through stage geometry. */
  private applyHitstopDisplacement(
    fighter: FighterRuntime,
    direction: Vec2,
    distance: number,
  ): void {
    const magnitude = Math.hypot(direction.x, direction.y);
    if (magnitude < 0.5 || distance <= 0) return;
    fighter.previousPosition = cloneVec(fighter.position);
    fighter.position = {
      x: fighter.position.x + direction.x / magnitude * distance,
      y: fighter.position.y + direction.y / magnitude * distance,
    };

    // Closed stage volumes protect their underside and side walls.
    this.resolveGroundVolumeCollision(fighter, new Set(), EMPTY_INPUT, false);

    // Their top surfaces and one-way platforms use the normal landing sweep.
    // Clamp only: grounding here would erase an upward launch on the next tick.
    if (fighter.position.y >= fighter.previousPosition.y) return;
    const halfHeight = fighter.definition.size.height / 2;
    const previousBottom = fighter.previousPosition.y - halfHeight;
    const currentBottom = fighter.position.y - halfHeight;
    let highestTop = Number.NEGATIVE_INFINITY;
    for (const platform of this.stage.platforms) {
      const previousTop = platformTop(platform, fighter.previousPosition.x);
      const top = platformTop(platform, fighter.position.x);
      const overlaps =
        fighter.position.x + fighter.definition.size.width * 0.26 >= platformLeft(platform) &&
        fighter.position.x - fighter.definition.size.width * 0.26 <= platformRight(platform);
      if (
        overlaps &&
        previousBottom >= previousTop - 0.01 &&
        currentBottom <= top &&
        top > highestTop
      ) {
        highestTop = top;
      }
    }
    if (highestTop !== Number.NEGATIVE_INFINITY) {
      fighter.position.y = highestTop + halfHeight;
    }
  }

  private finishHitstopDi(fighter: FighterRuntime): void {
    if (fighter.launchBaseAngle === null) {
      fighter.hitstopElapsedFrames = 0;
      fighter.sdiRegion = null;
      fighter.asdiDirection = null;
      return;
    }
    if (fighter.asdiDirection) {
      this.applyHitstopDisplacement(fighter, fighter.asdiDirection, ASDI_DISTANCE);
    }
    if (fighter.pendingHitstopDi) {
      const speed = Math.hypot(fighter.launchVelocity.x, fighter.launchVelocity.y);
      const angle = this.directionalInfluenceAngle(
        fighter.launchBaseAngle,
        fighter.pendingHitstopDi,
      );
      const radians = (angle * Math.PI) / 180;
      fighter.launchVelocity = {
        x: Math.cos(radians) * speed,
        y: Math.sin(radians) * speed,
      };
    }
    fighter.launchBaseAngle = null;
    fighter.pendingHitstopDi = null;
    fighter.hitstopElapsedFrames = 0;
    fighter.sdiRegion = null;
    fighter.asdiDirection = null;
  }

  private applyLaunch(
    target: FighterRuntime,
    attacker: FighterRuntime,
    damage: number,
    angleDegrees: number,
    baseKnockback: number,
    growth: number,
    _baseHitstun: number,
    targetInput: InputFrame,
    minimumKnockback = 0,
    minimumHitstun = 7,
  ): void {
    this.refreshRecoveryAfterAirHit(target);
    this.releaseGrabRelations(target);
    if (target.statusEffect) {
      target.statusResistanceFrames = Math.max(
        target.statusResistanceFrames,
        target.statusEffect === "bury" ? 90 : 45,
      );
      target.statusEffect = null;
    }
    const effectiveDamage = damage * target.defenseMultiplier;
    target.percent = Math.max(0, target.percent + effectiveDamage);
    const knockback = Math.max(
      minimumKnockback,
      calculateMeleeKnockback({
        postHitPercent: target.percent,
        damage: effectiveDamage,
        weight: target.definition.weight,
        baseKnockback,
        knockbackGrowth: growth,
        ratio: target.defenseMultiplier,
      }),
    );
    const di = normalizedDirection(targetInput);
    target.launchBaseAngle = angleDegrees;
    target.pendingHitstopDi = Math.hypot(di.x, di.y) > 0.25 ? cloneVec(di) : null;
    target.hitstopElapsedFrames = 0;
    target.sdiRegion = sdiRegionForDirection(di);
    target.asdiDirection = sdiRegionForDirection(di) === null ? null : cloneVec(di);
    const angle = this.directionalInfluenceAngle(angleDegrees, di);
    target.velocity = { x: 0, y: 0 };
    target.launchVelocity = meleeLaunchVelocity(knockback, angle);
    target.grounded = false;
    target.supportPlatform = null;
    target.fastFalling = false;
    target.shortHopReleaseFrames = 0;
    target.action = null;
    target.grabFrames = 0;
    target.landingLagFrames = 0;
    target.wavedashFrames = 0;
    target.state = "hitstun";
    target.techable = knockback >= MELEE_TUMBLE_KNOCKBACK_THRESHOLD;
    target.hitstunFrames = Math.max(
      minimumHitstun,
      meleeHitstunFrames(knockback),
    );
    target.lastHitBy = attacker.slot;
    target.lastHitFrames = 600;
  }

  private spawnProjectile(
    fighter: FighterRuntime,
    moveName: MoveName,
    attack: AttackDefinition,
  ): void {
    const definition = attack.projectile;
    if (!definition) return;
    if (definition.manualDetonation) {
      const existing = this.projectiles.find(
        (projectile) =>
          projectile.owner === fighter.slot &&
          projectile.move === moveName &&
          projectile.definition.manualDetonation,
      );
      if (existing) {
        existing.detonating = true;
        existing.remainingFrames = Math.max(1, existing.remainingFrames);
        existing.velocity = { x: 0, y: 0 };
        this.emit({
          type: "attack-active",
          slot: fighter.slot,
          move: moveName,
          position: cloneVec(existing.position),
        });
        return;
      }
    }
    const action = fighter.action;
    const chargeProgress = action && attack.chargeable
      ? clamp(action.chargeFrames / (attack.maxChargeFrames ?? 1), 0, 1)
      : 0;
    const storedChargeScaling = definition.storedChargeScaling;
    const scale = storedChargeScaling
      ? storedChargeScaling.minimumDamage / Math.max(1, attack.damage) +
        (1 - storedChargeScaling.minimumDamage / Math.max(1, attack.damage)) * chargeProgress
      : action
        ? this.chargeScale(attack, action.chargeFrames)
        : 1;
    const chargedSpeedScale = attack.chargeable
      ? 0.55 + chargeProgress * 0.45
      : 1;
    const projectileRadius = storedChargeScaling
      ? storedChargeScaling.minimumRadius +
        (definition.radius - storedChargeScaling.minimumRadius) * chargeProgress
      : definition.radius;
    const vertical = Boolean(definition.vertical);
    const position = vertical
      ? { x: fighter.position.x, y: fighter.position.y + 320 }
      : {
          x: fighter.position.x + fighter.facing *
            (fighter.definition.size.width * 0.55 + projectileRadius),
          y: definition.restsOnGround
            ? fighter.position.y - fighter.definition.size.height / 2 + projectileRadius + 2
            : fighter.position.y + attack.offset.y,
        };
    const velocity = vertical
      ? { x: 0, y: -definition.speed }
      : {
          x: definition.speed * chargedSpeedScale * fighter.facing,
          y: definition.launchVelocityY ?? (definition.kind === "bomb" ? 210 : 0),
        };
    const projectile: ProjectileRuntime = {
      id: this.nextEntityId,
      owner: fighter.slot,
      kind: definition.kind,
      position,
      velocity,
      radius: projectileRadius,
      remainingFrames: effectiveProjectileLifetime(definition),
      rotation: 0,
      definition,
      move: moveName,
      attack,
      age: 0,
      bouncesRemaining: definition.bounces ?? 0,
      hitTargets: new Set(),
      hitCounts: new Map(),
      lastHitFrame: new Map(),
      returning: false,
      powerScale: scale,
      detonating: false,
    };
    this.nextEntityId += 1;
    this.projectiles.push(projectile);
    this.emit({
      type: "projectile",
      slot: fighter.slot,
      move: moveName,
      position: cloneVec(position),
      projectileKind: definition.kind,
      entityId: projectile.id,
      sound: `projectile-${definition.kind}`,
    });
  }

  private projectileLaunchFacing(
    projectile: ProjectileRuntime,
    target: FighterRuntime,
  ): -1 | 1 {
    // The projectile trajectory is the stable source of truth at impact. With
    // fast projectiles the centre can advance a few pixels past the target in
    // one tick, so using position first could incorrectly reverse knockback.
    if (Math.abs(projectile.velocity.x) > 1) return projectile.velocity.x > 0 ? 1 : -1;
    const impactOffset = target.position.x - projectile.position.x;
    if (Math.abs(impactOffset) > 1) return impactOffset > 0 ? 1 : -1;
    const owner = this.fighters[projectile.owner];
    return owner.position.x <= target.position.x ? 1 : -1;
  }

  private reflectProjectile(
    projectile: ProjectileRuntime,
    reflector: FighterRuntime,
    speedScale: number,
    powerScale = 1,
  ): void {
    projectile.owner = reflector.slot;
    projectile.velocity = {
      x: -projectile.velocity.x * speedScale,
      y: -projectile.velocity.y * speedScale,
    };
    if (Math.hypot(projectile.velocity.x, projectile.velocity.y) < 1) {
      projectile.velocity.x = reflector.facing * projectile.definition.speed * speedScale;
    }
    projectile.powerScale *= powerScale;
    projectile.age = 0;
    projectile.remainingFrames = effectiveProjectileLifetime(projectile.definition);
    projectile.returning = false;
    projectile.detonating = false;
    projectile.bouncesRemaining = projectile.definition.bounces ?? 0;
    projectile.hitTargets.clear();
    projectile.hitCounts.clear();
    projectile.lastHitFrame.clear();
    const magnitude = Math.max(1, Math.hypot(projectile.velocity.x, projectile.velocity.y));
    projectile.position.x += projectile.velocity.x / magnitude * 28;
    projectile.position.y += projectile.velocity.y / magnitude * 12;
  }

  private updateProjectiles(inputs: InputPair): void {
    const survivors: ProjectileRuntime[] = [];
    for (const projectile of this.projectiles) {
      projectile.age += 1;
      projectile.remainingFrames -= 1;
      const owner = this.fighters[projectile.owner];
      const target = this.fighters[slotOther(projectile.owner)];

      if (
        projectile.definition.manualDetonation &&
        projectile.remainingFrames <= 0
      ) projectile.detonating = true;
      if (projectile.detonating) {
        projectile.velocity = { x: 0, y: 0 };
        const explosionScale = 1 + (projectile.powerScale - 1) * 0.45;
        projectile.radius = (projectile.definition.explosionRadius ?? projectile.radius) * explosionScale;
        projectile.remainingFrames = 0;
      }

      if (projectile.definition.controlledByOwner) {
        const direction = normalizedDirection(inputs[projectile.owner]);
        const magnitude = Math.hypot(direction.x, direction.y);
        if (magnitude > 0.25) {
          projectile.velocity = {
            x: direction.x / magnitude * projectile.definition.speed,
            y: direction.y / magnitude * projectile.definition.speed,
          };
        }
      }

      if (projectile.definition.returns && projectile.age > projectile.definition.lifetimeFrames * 0.48) {
        if (!projectile.returning) {
          projectile.returning = true;
          projectile.hitTargets.clear();
          projectile.hitCounts.clear();
          projectile.lastHitFrame.clear();
        }
        const dx = owner.position.x - projectile.position.x;
        const dy = owner.position.y - projectile.position.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const desiredVelocity = {
          x: (dx / length) * projectile.definition.speed,
          y: (dy / length) * projectile.definition.speed,
        };
        projectile.velocity.x = approach(
          projectile.velocity.x,
          desiredVelocity.x,
          PROJECTILE_RETURN_TURN_RATE,
        );
        projectile.velocity.y = approach(
          projectile.velocity.y,
          desiredVelocity.y,
          PROJECTILE_RETURN_TURN_RATE,
        );
        const returnSpeed = Math.hypot(projectile.velocity.x, projectile.velocity.y);
        if (returnSpeed > projectile.definition.speed) {
          projectile.velocity.x = projectile.velocity.x / returnSpeed * projectile.definition.speed;
          projectile.velocity.y = projectile.velocity.y / returnSpeed * projectile.definition.speed;
        }
        if (length < owner.definition.size.width * 0.6) continue;
      }

      if ((projectile.kind === "missile" || projectile.definition.homing) && target.state !== "ko") {
        const desired = Math.atan2(
          target.position.y - projectile.position.y,
          target.position.x - projectile.position.x,
        );
        const speed = projectile.definition.speed;
        const turnRate = projectile.definition.homing ?? 8;
        projectile.velocity.x = approach(projectile.velocity.x, Math.cos(desired) * speed, turnRate);
        projectile.velocity.y = approach(projectile.velocity.y, Math.sin(desired) * speed, turnRate);
      }

      projectile.velocity.y -= projectile.definition.gravity * FIXED_DT;
      const previousX = projectile.position.x;
      const previousY = projectile.position.y;
      projectile.position.x += projectile.velocity.x * FIXED_DT;
      projectile.position.y += projectile.velocity.y * FIXED_DT;
      projectile.rotation = Math.atan2(projectile.velocity.y, projectile.velocity.x);

      if (
        projectile.definition.ownerDischargeRadius &&
        distanceSquared(projectile.position, owner.position) <=
          (projectile.radius + Math.min(owner.definition.size.width, owner.definition.size.height) * 0.45) ** 2
      ) {
        projectile.position = cloneVec(owner.position);
        projectile.radius = projectile.definition.ownerDischargeRadius;
        projectile.velocity = { x: 0, y: 0 };
        projectile.remainingFrames = 0;
        this.emit({
          type: "attack-active",
          slot: owner.slot,
          move: projectile.move,
          position: cloneVec(owner.position),
        });
      }

      const ownerLaunch = projectile.definition.ownerLaunchOnContact;
      if (
        ownerLaunch &&
        projectile.age >= ownerLaunch.minimumAgeFrames &&
        distanceSquared(projectile.position, owner.position) <=
          (projectile.radius + Math.min(owner.definition.size.width, owner.definition.size.height) * 0.42) ** 2
      ) {
        const magnitude = Math.max(1, Math.hypot(projectile.velocity.x, projectile.velocity.y));
        owner.velocity = {
          x: projectile.velocity.x / magnitude * ownerLaunch.speed,
          y: projectile.velocity.y / magnitude * ownerLaunch.speed,
        };
        owner.grounded = false;
        owner.supportPlatform = null;
        owner.fastFalling = false;
        if (owner.action?.name === projectile.move) owner.action.specialPhase = "active";
        this.emit({
          type: "attack-active",
          slot: owner.slot,
          move: projectile.move,
          position: cloneVec(owner.position),
        });
        continue;
      }

      const groundVolumeCollision = findGroundVolumeCollision(
        this.stage.platforms,
        { x: previousX, y: previousY },
        projectile.position,
        projectile.radius,
        projectile.radius,
      );
      if (groundVolumeCollision) {
        if (groundVolumeCollision.face === "bottom") {
          projectile.position.y =
            platformBottom(groundVolumeCollision.platform, projectile.position.x) -
            projectile.radius -
            0.01;
          if (projectile.bouncesRemaining > 0) {
            projectile.velocity.y = -Math.abs(projectile.velocity.y) * 0.68;
            projectile.bouncesRemaining -= 1;
          } else {
            projectile.remainingFrames = 0;
          }
        } else {
          const edgeX =
            groundVolumeCollision.face === "left"
              ? platformLeft(groundVolumeCollision.platform)
              : platformRight(groundVolumeCollision.platform);
          projectile.position.x =
            edgeX +
            (groundVolumeCollision.face === "left"
              ? -projectile.radius - 0.01
              : projectile.radius + 0.01);
          if (projectile.bouncesRemaining > 0) {
            projectile.velocity.x =
              (groundVolumeCollision.face === "left" ? -1 : 1) *
              Math.abs(projectile.velocity.x) *
              0.68;
            projectile.bouncesRemaining -= 1;
          } else {
            projectile.remainingFrames = 0;
          }
        }
      } else if (projectile.velocity.y < 0 && projectile.bouncesRemaining >= 0) {
        for (const platform of this.stage.platforms) {
          if (platform.kind === "platform") continue;
          const previousTop = platformTop(platform, previousX);
          const top = platformTop(platform, projectile.position.x);
          const inX =
            projectile.position.x >= platform.position.x - platform.width / 2 &&
            projectile.position.x <= platform.position.x + platform.width / 2;
          if (inX && previousY - projectile.radius >= previousTop && projectile.position.y - projectile.radius <= top) {
            if (projectile.bouncesRemaining > 0) {
              projectile.position.y = top + projectile.radius;
              projectile.velocity.y = Math.abs(projectile.velocity.y) * 0.68;
              projectile.bouncesRemaining -= 1;
            } else if (projectile.kind === "bomb" || projectile.definition.restsOnGround) {
              projectile.position.y = top + projectile.radius;
              projectile.velocity = { x: 0, y: 0 };
            } else {
              projectile.remainingFrames = 0;
            }
            break;
          }
        }
      }

      const maximumHits = Math.max(1, projectile.attack.multiHit ?? 1);
      const landedHits = projectile.hitCounts.get(target.slot) ?? 0;
      const lastHitFrame = projectile.lastHitFrame.get(target.slot);
      const rehitFrames = maximumHits > 1
        ? Math.max(2, Math.floor(projectile.attack.active / maximumHits))
        : projectile.attack.active;
      const canHit =
        target.state !== "ko" &&
        target.state !== "grabbed" &&
        target.invulnerableFrames === 0 &&
        landedHits < maximumHits &&
        !projectile.hitTargets.has(target.slot) &&
        (!projectile.definition.manualDetonation || projectile.detonating) &&
        (lastHitFrame === undefined || projectile.age - lastHitFrame >= rehitFrames);
      if (
        canHit &&
        circleIntersectsFighter(target, projectile.position, projectile.radius)
      ) {
        const targetAction = target.action;
        const defensiveMove = targetAction
          ? target.definition.attacks[targetAction.name]
          : null;
        const defensiveMoveActive = Boolean(
          targetAction &&
          defensiveMove &&
          defensiveMoveActiveAtFrame(targetAction.frame, defensiveMove)
        );
        if (defensiveMoveActive && defensiveMove?.counters && targetAction) {
          targetAction.hitTargets.add(owner.slot);
          target.invulnerableFrames = Math.max(
            target.invulnerableFrames,
            defensiveMove.active + defensiveMove.recovery,
          );
          const counterHitbox = {
            x: target.position.x + defensiveMove.offset.x * target.facing,
            y: target.position.y + defensiveMove.offset.y,
          };
          if (circleIntersectsFighter(owner, counterHitbox, defensiveMove.radius)) {
            const counterScale = Math.max(
              1,
              projectile.attack.damage * projectile.powerScale * 1.2 /
                Math.max(1, defensiveMove.damage),
            );
            this.resolveAttackHit(
              target,
              owner,
              defensiveMove,
              targetAction.name,
              inputs[owner.slot],
              counterScale,
              "melee",
              counterScale,
              false,
              false,
            );
          }
          continue;
        }
        if (
          defensiveMoveActive &&
          defensiveMove?.absorbsProjectiles &&
          projectile.definition.absorbable
        ) {
          const absorbedDamage = projectile.attack.damage * projectile.powerScale;
          if (target.fighter === "mr-game-and-watch" && targetAction?.name === "down-special") {
            target.absorbedEnergy = Math.min(50, target.absorbedEnergy + absorbedDamage);
          } else {
            target.percent = Math.max(0, target.percent - absorbedDamage * 0.45);
          }
          this.emit({
            type: "shield-hit",
            slot: target.slot,
            target: owner.slot,
            position: cloneVec(projectile.position),
            sound: "shield-hit",
          });
          continue;
        }
        if (defensiveMoveActive && defensiveMove?.reflectsProjectiles) {
          this.reflectProjectile(projectile, target, 1.18, 1.16);
          this.emit({
            type: "shield-hit",
            slot: target.slot,
            target: owner.slot,
            position: cloneVec(projectile.position),
            sound: "franklin-reflect",
          });
          survivors.push(projectile);
          continue;
        }
        const linkShieldBlock =
          (target.fighter === "link" || target.fighter === "young-link") &&
          target.grounded &&
          !target.action &&
          (target.state === "idle" || target.state === "walk") &&
          projectile.velocity.x * target.facing < 0 &&
          Math.abs(projectile.position.y - target.position.y) < target.definition.size.height * 0.36;
        if (linkShieldBlock) {
          this.emit({
            type: "shield-hit",
            slot: target.slot,
            target: owner.slot,
            position: cloneVec(projectile.position),
            sound: "shield-hit",
          });
          continue;
        }
        if (target.projectileShieldFrames > 0) {
          this.reflectProjectile(projectile, target, 1.08);
          this.emit({ type: "shield-hit", slot: target.slot, target: owner.slot, position: cloneVec(projectile.position), sound: "franklin-reflect" });
          survivors.push(projectile);
          continue;
        }
        const hitNumber = landedHits + 1;
        const isFinisher = hitNumber >= maximumHits;
        projectile.hitCounts.set(target.slot, hitNumber);
        projectile.lastHitFrame.set(target.slot, projectile.age);
        if (isFinisher) projectile.hitTargets.add(target.slot);
        const damageScale = projectile.powerScale / maximumHits;
        const launchScale = maximumHits > 1 && !isFinisher
          ? projectile.powerScale * 0.16
          : projectile.powerScale;
        this.resolveAttackHit(
          owner,
          target,
          projectile.attack,
          projectile.move,
          inputs[target.slot],
          damageScale,
          "projectile",
          launchScale,
          maximumHits > 1 && !isFinisher,
          true,
          this.projectileLaunchFacing(projectile, target),
        );
        if (
          (!isFinisher || projectile.definition.returns) &&
          projectile.remainingFrames > 0
        ) survivors.push(projectile);
        continue;
      }

      const inWorld =
        projectile.position.x > this.stage.blastZone.left - 100 &&
        projectile.position.x < this.stage.blastZone.right + 100 &&
        projectile.position.y > this.stage.blastZone.bottom - 100 &&
        projectile.position.y < this.stage.blastZone.top + 100;
      if (projectile.remainingFrames > 0 && inWorld) survivors.push(projectile);
    }
    this.projectiles = survivors;
  }

  private itemIntervalFrames(): number {
    switch (this.config.itemFrequency) {
      case "low":
        return 860;
      case "high":
        return 340;
      case "medium":
        return 560;
    }
  }

  private maybeSpawnItem(): void {
    if (!this.config.items || this.frame < this.nextItemFrame || this.items.length >= 3) return;
    const kind = ITEM_KINDS[Math.floor(this.random.next() * ITEM_KINDS.length)] ?? "vitality-fruit";
    this.spawnItem(
      kind,
      { x: -360 + this.random.next() * 720, y: 470 },
      { x: (this.random.next() - 0.5) * 70, y: 0 },
    );
    const jitter = 0.8 + this.random.next() * 0.45;
    this.nextItemFrame = this.frame + Math.round(this.itemIntervalFrames() * jitter);
  }

  private tryPickupItem(fighter: FighterRuntime): boolean {
    if (fighter.heldItem) return false;
    const pickupRadius = Math.max(fighter.definition.size.width, fighter.definition.size.height) * 0.48;
    const index = this.items.findIndex(
      (item) =>
        item.mode === "world" &&
        !isAutomaticItem(item.kind) &&
        distanceSquared(item.position, fighter.position) <= (item.radius + pickupRadius) ** 2,
    );
    if (index < 0) return false;
    const [item] = this.items.splice(index, 1);
    if (!item) return false;
    const definition = ITEM_DEFINITIONS[item.kind];
    fighter.heldItem = { kind: item.kind, charges: definition.charges };
    fighter.state = "grab";
    fighter.itemUseFrames = 8;
    fighter.itemAction = "pickup";
    this.emit({
      type: "item-pickup",
      slot: fighter.slot,
      item: item.kind,
      position: cloneVec(fighter.position),
      sound: "item-pickup",
    });
    return true;
  }

  private useHeldItem(fighter: FighterRuntime, input: InputFrame, targetInput: InputFrame): void {
    const held = fighter.heldItem;
    if (!held) return;
    const definition = ITEM_DEFINITIONS[held.kind];
    const target = this.fighters[slotOther(fighter.slot)];
    fighter.itemUseFrames = definition.effect === "bat" ? 24 : 13;
    fighter.itemAction = "attack";
    fighter.state = "attack";
    const direction = normalizedDirection(input);

    switch (definition.effect) {
      case "sword":
        this.applyItemStrike(fighter, target, definition.amount, 155, 42, 0.78, targetInput, "plasma-blade");
        break;
      case "bat":
        this.applyItemStrike(fighter, target, definition.amount, 132, 86, 1.18, targetInput, "power-bat");
        break;
      case "ray": {
        const attack = getFighterDefinition("samus").attacks["neutral-special"];
        this.spawnProjectile(fighter, "neutral-special", attack);
        break;
      }
      case "flame": {
        const attack = getFighterDefinition("mario").attacks["neutral-special"];
        this.spawnProjectile(fighter, "neutral-special", attack);
        break;
      }
      case "bomb":
      case "shell":
      case "slip-trap":
      case "proximity-bomb":
      case "bumper":
      case "bury":
      case "stun":
      case "smoke":
        this.releaseActivatedItem(fighter, held.kind, direction);
        break;
      default:
        break;
    }

    held.charges -= 1;
    if (held.charges <= 0) fighter.heldItem = null;
    this.emit({
      type: "item-use",
      slot: fighter.slot,
      item: held.kind,
      position: cloneVec(fighter.position),
      value: definition.amount,
      sound: `item-${definition.effect}`,
    });
  }

  private applyItemStrike(
    attacker: FighterRuntime,
    target: FighterRuntime,
    damage: number,
    reach: number,
    baseKnockback: number,
    growth: number,
    targetInput: InputFrame,
    sound: string,
  ): void {
    const horizontal = (target.position.x - attacker.position.x) * attacker.facing;
    const vertical = Math.abs(target.position.y - attacker.position.y);
    if (horizontal < -18 || horizontal > reach || vertical > 105 || target.invulnerableFrames > 0) return;
    this.applyLaunch(target, attacker, damage, attacker.facing > 0 ? 36 : 144, baseKnockback, growth, 12, targetInput);
    this.emit({
      type: "hit",
      slot: attacker.slot,
      target: target.slot,
      position: cloneVec(target.position),
      value: damage,
      damage,
      source: "item",
      velocity: this.fighterWorldVelocity(target),
      sound,
    });
  }

  private releaseActivatedItem(fighter: FighterRuntime, kind: ItemKind, direction: Vec2): void {
    const definition = ITEM_DEFINITIONS[kind];
    const trap = definition.category === "trap";
    const horizontal = Math.abs(direction.x) > 0.25 ? Math.sign(direction.x) : fighter.facing;
    const item: ItemRuntime = {
      id: this.nextEntityId,
      kind,
      position: {
        x: fighter.position.x + horizontal * (fighter.definition.size.width * 0.5 + 28),
        y: fighter.position.y + 22,
      },
      velocity: trap
        ? { x: horizontal * 240, y: 160 }
        : { x: horizontal * (definition.effect === "shell" ? 460 : 360), y: 210 },
      radius: definition.effect === "bumper" ? 34 : 24,
      mode: trap ? "trap" : "thrown",
      owner: fighter.slot,
      age: 0,
      grounded: false,
      supportPlatform: null,
    };
    this.nextEntityId += 1;
    this.items.push(item);
  }

  private updateItems(inputs: InputPair): void {
    const survivors: ItemRuntime[] = [];
    for (const item of this.items) {
      item.age += 1;
      const previousX = item.position.x;
      const previousY = item.position.y;

      if (item.grounded) {
        const support = this.findItemSupport(item, item.position.x);
        if (support) {
          item.supportPlatform = support.id;
          item.position.y = platformTop(support, item.position.x) + item.radius;
          item.velocity.y = 0;
        } else {
          item.grounded = false;
          item.supportPlatform = null;
        }
      }

      if (!item.grounded) {
        item.velocity.y = Math.max(-600, item.velocity.y - 1_250 * FIXED_DT);
      }
      item.position.x += item.velocity.x * FIXED_DT;
      item.position.y += item.velocity.y * FIXED_DT;

      if (item.grounded) {
        const support = this.findItemSupport(item, item.position.x);
        if (support) {
          item.supportPlatform = support.id;
          item.position.y = platformTop(support, item.position.x) + item.radius;
        } else {
          // Do not let a supported item float for one frame after an edge.
          item.grounded = false;
          item.supportPlatform = null;
          item.velocity.y = Math.max(-600, item.velocity.y - 1_250 * FIXED_DT);
          item.position.y += item.velocity.y * FIXED_DT;
        }
      }

      let blockedByGroundVolume = false;
      const walkableGround = new Set<string>();
      if (item.grounded) {
        const footY = item.position.y - item.radius;
        for (const platform of this.stage.platforms) {
          const top = platformTop(platform, item.position.x);
          const overlaps =
            item.position.x + item.radius >= platformLeft(platform) &&
            item.position.x - item.radius <= platformRight(platform);
          if (overlaps && top >= footY - 12 && top <= footY + 30) {
            walkableGround.add(platform.id);
          }
        }
      }
      const collision = findGroundVolumeCollision(
        this.stage.platforms,
        { x: previousX, y: previousY },
        item.position,
        item.radius,
        item.radius,
        walkableGround,
      );
      if (collision) {
        blockedByGroundVolume = true;
        if (collision.face === "bottom") {
          item.position.y =
            platformBottom(collision.platform, item.position.x) - item.radius - 0.01;
          item.velocity.y = Math.min(0, item.velocity.y);
        } else {
          const edgeX =
            collision.face === "left"
              ? platformLeft(collision.platform)
              : platformRight(collision.platform);
          item.position.x =
            edgeX +
            (collision.face === "left" ? -item.radius - 0.01 : item.radius + 0.01);
          item.velocity.x *= -0.45;
        }
      }

      if (!item.grounded && !blockedByGroundVolume) {
        for (const platform of this.stage.platforms) {
          const previousTop = platformTop(platform, previousX);
          const top = platformTop(platform, item.position.x);
          const inX = platformContainsX(platform, item.position.x);
          if (inX && previousY - item.radius >= previousTop && item.position.y - item.radius <= top) {
            item.position.y = top + item.radius;
            if (item.mode === "trap") {
              item.velocity = { x: 0, y: 0 };
              item.grounded = true;
              item.supportPlatform = platform.id;
            } else if (item.kind === "ricochet-disc" && item.mode === "thrown") {
              item.velocity.y = 0;
              item.grounded = true;
              item.supportPlatform = platform.id;
            } else {
              const rebound = Math.abs(item.velocity.y) * 0.28;
              item.velocity.x *= 0.82;
              if (rebound < 28) {
                item.velocity.y = 0;
                item.grounded = true;
                item.supportPlatform = platform.id;
              } else {
                item.velocity.y = rebound;
                item.supportPlatform = null;
              }
            }
            break;
          }
        }
      }

      if (item.mode === "world" && isAutomaticItem(item.kind)) {
        let collector: FighterRuntime | null = null;
        for (const fighter of this.fighters) {
          if (fighter.state === "ko" || fighter.state === "grabbed") continue;
          const pickupRadius = Math.max(fighter.definition.size.width, fighter.definition.size.height) * 0.38;
          if (distanceSquared(item.position, fighter.position) <= (item.radius + pickupRadius) ** 2) {
            collector = fighter;
            break;
          }
        }
        if (collector) {
          this.applyAutomaticItem(collector, item);
          continue;
        }
      }

      if (item.mode !== "world" && item.owner !== null) {
        const target = this.fighters[slotOther(item.owner)];
        const hitsTarget = item.kind === "proximity-mine"
          ? distanceSquared(item.position, target.position) <= 95 ** 2
          : circleIntersectsFighter(target, item.position, item.radius);
        if (
          target.state !== "ko" &&
          target.invulnerableFrames === 0 &&
          hitsTarget
        ) {
          const consumed = this.applyActivatedItem(item, target, inputs[target.slot]);
          if (consumed) continue;
        }
      }

      const lifetime = ITEM_DEFINITIONS[item.kind].duration || 1_800;
      if (item.position.y > this.stage.blastZone.bottom && item.age < lifetime) survivors.push(item);
    }
    this.items = survivors;
  }

  private findItemSupport(item: ItemRuntime, worldX: number): PlatformSnapshot | null {
    const footY = item.position.y - item.radius;
    return this.stage.platforms
      .filter(
        (platform) =>
          platformContainsX(platform, worldX) &&
          platformTop(platform, worldX) >= footY - 12 &&
          platformTop(platform, worldX) <= footY + 30,
      )
      .sort(
        (a, b) => platformTop(b, worldX) - platformTop(a, worldX),
      )[0] ?? null;
  }

  private applyAutomaticItem(collector: FighterRuntime, item: ItemRuntime): void {
    const definition = ITEM_DEFINITIONS[item.kind];
    const target = this.fighters[slotOther(collector.slot)];
    switch (definition.effect) {
      case "heal-small":
      case "heal-large":
        collector.percent = Math.max(0, collector.percent - definition.amount);
        break;
      case "power-up":
        collector.damageMultiplier = definition.amount;
        collector.damageBuffFrames = definition.duration;
        break;
      case "speed-up":
        collector.speedMultiplier = definition.amount;
        collector.speedBuffFrames = definition.duration;
        collector.jumpMultiplier = 1.25;
        collector.jumpBuffFrames = definition.duration;
        break;
      case "armor":
        collector.defenseMultiplier = definition.amount;
        collector.defenseBuffFrames = definition.duration;
        break;
      case "invincibility":
        collector.invulnerableFrames = Math.max(collector.invulnerableFrames, definition.duration);
        break;
      case "projectile-shield":
        collector.projectileShieldFrames = definition.duration;
        break;
      case "slow-time":
        target.speedMultiplier = definition.amount;
        target.speedBuffFrames = definition.duration;
        break;
      default:
        return;
    }
    this.emit({
      type: "item-use",
      slot: collector.slot,
      item: item.kind,
      position: cloneVec(item.position),
      value: definition.amount,
      sound: `item-${definition.effect}`,
    });
  }

  private applyActivatedItem(item: ItemRuntime, target: FighterRuntime, targetInput: InputFrame): boolean {
    const definition = ITEM_DEFINITIONS[item.kind];
    const attacker = this.fighters[item.owner ?? 0];
    const direction = target.position.x >= item.position.x ? 1 : -1;
    this.releaseGrabRelations(target);
    switch (definition.effect) {
      case "bomb":
      case "proximity-bomb":
        this.applyLaunch(target, attacker, definition.amount, direction > 0 ? 48 : 132, 70, 1.02, 17, targetInput);
        break;
      case "shell":
        this.applyLaunch(target, attacker, definition.amount, direction > 0 ? 32 : 148, 54, 0.86, 13, targetInput);
        break;
      case "slip-trap":
        this.applyLaunch(target, attacker, definition.amount, direction > 0 ? 18 : 162, 24, 0.35, 24, targetInput);
        target.hitstunFrames = Math.max(target.hitstunFrames, 50);
        break;
      case "bumper":
        this.applyLaunch(target, attacker, definition.amount, direction > 0 ? 24 : 156, 72, 1.08, 18, targetInput);
        this.emit({
          type: "hit",
          slot: attacker.slot,
          target: target.slot,
          item: item.kind,
          position: cloneVec(target.position),
          value: definition.amount,
          damage: definition.amount,
          source: "item",
          velocity: this.fighterWorldVelocity(target),
          sound: "item-bumper",
        });
        item.owner = target.slot;
        return false;
      case "bury":
        this.refreshRecoveryAfterAirHit(target);
        target.percent += definition.amount * target.defenseMultiplier;
        target.velocity = { x: 0, y: 0 };
        this.clearLaunchVelocity(target);
        target.state = "hitstun";
        target.techable = false;
        target.techWindowFrames = 0;
        target.hitstunFrames = Math.max(target.hitstunFrames, 95);
        target.lastHitBy = attacker.slot;
        target.lastHitFrames = 600;
        break;
      case "stun":
        this.refreshRecoveryAfterAirHit(target);
        target.percent += definition.amount * target.defenseMultiplier;
        target.velocity = { x: 0, y: 0 };
        this.clearLaunchVelocity(target);
        target.state = "hitstun";
        target.techable = false;
        target.techWindowFrames = 0;
        target.hitstunFrames = Math.max(target.hitstunFrames, 105);
        target.lastHitBy = attacker.slot;
        target.lastHitFrames = 600;
        break;
      case "smoke":
        target.speedMultiplier = definition.amount;
        target.speedBuffFrames = definition.duration;
        break;
      default:
        return false;
    }
    this.emit({
      type: "hit",
      slot: attacker.slot,
      target: target.slot,
      item: item.kind,
      position: cloneVec(target.position),
      value: definition.amount,
      damage: definition.amount,
      source: "item",
      velocity: this.fighterWorldVelocity(target),
      sound: `item-${definition.effect}`,
    });
    return true;
  }

  private resolveKnockouts(): void {
    const knockedOut: FighterRuntime[] = [];
    for (const fighter of this.fighters) {
      if (fighter.state === "ko" || fighter.stocks <= 0) continue;
      const outside =
        fighter.position.x < this.stage.blastZone.left ||
        fighter.position.x > this.stage.blastZone.right ||
        fighter.position.y < this.stage.blastZone.bottom ||
        fighter.position.y > this.stage.blastZone.top;
      if (outside) knockedOut.push(fighter);
    }
    if (knockedOut.length === 0) return;

    for (const fighter of knockedOut) {
      const koVelocity = this.fighterWorldVelocity(fighter);
      this.releaseGrabRelations(fighter);
      fighter.stocks = Math.max(0, fighter.stocks - 1);
      if (fighter.lastHitBy !== null && fighter.lastHitBy !== fighter.slot) {
        this.kos[fighter.lastHitBy] += 1;
      }
      fighter.state = "ko";
      fighter.respawnFrames = 90;
      fighter.velocity = { x: 0, y: 0 };
      this.clearLaunchVelocity(fighter);
      fighter.action = null;
      fighter.hitstopFrames = 0;
      fighter.hitstopElapsedFrames = 0;
      fighter.hitstunFrames = 0;
      fighter.launchBaseAngle = null;
      fighter.pendingHitstopDi = null;
      fighter.sdiRegion = null;
      fighter.asdiDirection = null;
      fighter.techWindowFrames = 0;
      fighter.techable = false;
      fighter.ledge = null;
      this.dropHeldItem(fighter);
      this.emit({
        type: "ko",
        slot: fighter.slot,
        target: fighter.lastHitBy ?? undefined,
        position: cloneVec(fighter.position),
        value: fighter.stocks,
        velocity: koVelocity,
        sound: fighter.stocks === 0 ? "final-ko" : "ko",
      });
    }

    const firstOut = this.fighters[0].stocks <= 0;
    const secondOut = this.fighters[1].stocks <= 0;
    if (!firstOut && !secondOut) return;

    let winner: PlayerSlot;
    if (firstOut && !secondOut) winner = 1;
    else if (!firstOut && secondOut) winner = 0;
    else if (this.fighters[0].percent !== this.fighters[1].percent) {
      winner = this.fighters[0].percent < this.fighters[1].percent ? 0 : 1;
    } else {
      winner = this.kos[0] >= this.kos[1] ? 0 : 1;
    }
    this.finishMatch(winner);
  }

  private playingFrames(): number {
    return Math.max(0, this.frame - this.options.countdownFrames);
  }

  private resolveTimeLimit(): void {
    if (
      this.timeLimitFrames === null ||
      this.suddenDeath ||
      this.playingFrames() < this.timeLimitFrames
    ) return;

    const firstStocks = this.fighters[0].stocks;
    const secondStocks = this.fighters[1].stocks;
    if (firstStocks !== secondStocks) {
      this.finishMatch(firstStocks > secondStocks ? 0 : 1);
      return;
    }

    this.startSuddenDeath();
  }

  private startSuddenDeath(): void {
    this.suddenDeath = true;
    this.projectiles = [];
    this.items = [];
    const stageDefinition = getStageDefinition(this.config.stage);
    this.fighters = [
      this.createFighter(0, stageDefinition.spawns[0], true),
      this.createFighter(1, stageDefinition.spawns[1], true),
    ];
    for (const fighter of this.fighters) {
      fighter.stocks = 1;
      fighter.percent = 999;
    }
    this.emit({ type: "sudden-death", value: 999 });
  }

  private releaseGrabRelations(fighter: FighterRuntime): void {
    if (fighter.grabTarget !== null) {
      const target = this.fighters[fighter.grabTarget];
      target.grabbedBy = null;
      target.state = "fall";
      fighter.grabTarget = null;
    }
    if (fighter.grabbedBy !== null) {
      const grabber = this.fighters[fighter.grabbedBy];
      grabber.grabTarget = null;
      grabber.grabFrames = 14;
      fighter.grabbedBy = null;
    }
  }

  private dropHeldItem(fighter: FighterRuntime): void {
    const held = fighter.heldItem;
    if (!held) return;
    const item: ItemRuntime = {
      id: this.nextEntityId,
      kind: held.kind,
      position: cloneVec(fighter.position),
      velocity: { x: -fighter.facing * 110, y: 190 },
      radius: 24,
      mode: "world",
      owner: null,
      age: 0,
      grounded: false,
      supportPlatform: null,
    };
    this.nextEntityId += 1;
    this.items.push(item);
    fighter.heldItem = null;
  }

  private finishMatch(winner: PlayerSlot): void {
    this.phase = "finished";
    this.winner = winner;
    this.fighters[winner].state = "victory";
    this.result = {
      winner,
      durationMs: Math.max(0, (this.frame - this.options.countdownFrames) * FIXED_DT_MS),
      kos: [...this.kos] as [number, number],
    };
    this.emit({
      type: "match-end",
      slot: winner,
      winner,
      position: cloneVec(this.fighters[winner].position),
      sound: "victory",
    });
  }

  private snapshotFighter(fighter: FighterRuntime): FighterSnapshot {
    const action = fighter.action;
    const move = action ? fighter.definition.attacks[action.name] : null;
    return {
      slot: fighter.slot,
      fighter: fighter.fighter,
      skin: fighter.skin,
      name: fighter.name,
      position: cloneVec(fighter.position),
      velocity: this.fighterWorldVelocity(fighter),
      facing: fighter.facing,
      percent: fighter.percent,
      stocks: fighter.stocks,
      state: fighter.state,
      grounded: fighter.grounded,
      fastFalling: fighter.fastFalling,
      jumpsRemaining: fighter.jumpsRemaining,
      shield: fighter.shield,
      maxShield: fighter.definition.shieldHealth,
      invulnerableFrames: fighter.invulnerableFrames,
      currentMove: action?.name ?? null,
      moveFrame: action?.frame ?? 0,
      specialPhase: action?.specialPhase ?? null,
      visualRotation: specialVisualRotation(fighter),
      hitstunFrames: fighter.hitstunFrames,
      statusEffect: fighter.statusEffect,
      respawnFrames: fighter.respawnFrames,
      charge:
        action && move?.chargeable
          ? clamp(action.chargeFrames / (move.maxChargeFrames ?? 1), 0, 1)
          : 0,
      grabTarget: fighter.grabTarget,
      grabbedBy: fighter.grabbedBy,
      grabFrames: fighter.grabFrames,
      dodgeKind: fighter.dodgeKind,
      throwAnimation: fighter.throwAnimation,
      ledge: fighter.ledge,
      size: { ...fighter.definition.size },
      heldItem: fighter.heldItem ? { ...fighter.heldItem } : null,
      itemAction: fighter.itemAction,
      activeEffects: {
        damageMultiplier: fighter.damageMultiplier,
        speedMultiplier: fighter.speedMultiplier,
        jumpMultiplier: fighter.jumpMultiplier,
        defenseMultiplier: fighter.defenseMultiplier,
        projectileShieldFrames: fighter.projectileShieldFrames,
      },
    };
  }

  private emit(event: Omit<GameEvent, "frame">): void {
    this.events.push({ ...event, frame: this.frame });
  }
}

export function createGame(config: MatchConfig, options?: GameOptions | number): CombatGame {
  return new CombatGame(config, options);
}
