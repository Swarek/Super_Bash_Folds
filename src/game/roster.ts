import {
  FIGHTER_IDS,
  MELEE_FIGHTER_ID_CATALOG,
  MELEE_FIGHTER_IDS,
  OPEN_2D_FIGHTER_IDS,
  OPEN_3D_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
  type FighterId,
} from "./contracts";
import {
  MELEE_HORIZONTAL_WORLD_SCALE,
  MELEE_VERTICAL_WORLD_SCALE,
  meleeGravity,
  meleeHorizontalAcceleration,
  meleeHorizontalSpeed,
  meleeVerticalSpeed,
  move,
  standardThrows,
} from "./fighterBuilders";
import { ADDITIONAL_MELEE_ROSTER } from "./meleeRoster";
import { OPEN_ROSTER } from "./openRoster";
import { EXACT_UP_SPECIAL_ROOT_MOTION } from "./exactSpecialAnimationMetadata";

export {
  FIGHTER_IDS,
  MELEE_FIGHTER_ID_CATALOG,
  MELEE_FIGHTER_IDS,
  OPEN_2D_FIGHTER_IDS,
  OPEN_3D_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
  MELEE_HORIZONTAL_WORLD_SCALE,
  MELEE_VERTICAL_WORLD_SCALE,
};

/** Visual model height relative to the gameplay hurtbox height. */
export const EXACT_MODEL_TO_BODY_HEIGHT_RATIO = 1.17;

export interface Vec2 {
  x: number;
  y: number;
}

export type MoveName =
  | "jab"
  | "dash-attack"
  | "forward-tilt"
  | "up-tilt"
  | "down-tilt"
  | "forward-smash"
  | "up-smash"
  | "down-smash"
  | "neutral-air"
  | "forward-air"
  | "back-air"
  | "up-air"
  | "down-air"
  | "neutral-special"
  | "side-special"
  | "up-special"
  | "down-special";

export type ThrowName = "forward" | "back" | "up" | "down";

export interface ProjectileDefinition {
  kind:
    | "fireball"
    | "arrow"
    | "boomerang"
    | "bomb"
    | "charge-shot"
    | "missile"
    | "thunder-jolt"
    | "thunder"
    | "capsule"
    | "egg"
    | "blaster"
    | "pk-fire"
    | "pk-flash"
    | "pk-thunder"
    | "ice-shot"
    | "needle"
    | "din-fire"
    | "turnip"
    | "shadow-ball"
    | "chef"
    | "phantom"
    | "fire-breath"
    | "ground-wave";
  speed: number;
  gravity: number;
  lifetimeFrames: number;
  radius: number;
  bounces?: number;
  returns?: boolean;
  vertical?: boolean;
  launchVelocityY?: number;
  homing?: number;
  /** Projectile steered by its owner's live directional input. */
  controlledByOwner?: boolean;
  /** Launch the owner along the projectile vector when it comes back into contact. */
  ownerLaunchOnContact?: {
    minimumAgeFrames: number;
    speed: number;
  };
  ownerDischargeRadius?: number;
  manualDetonation?: boolean;
  /** Spawn while charging and explode when the special button is released. */
  detonatesOnChargeRelease?: boolean;
  explosionRadius?: number;
  restsOnGround?: boolean;
  absorbable?: boolean;
  /**
   * Explicit min-to-max profile for projectiles whose stored charge changes
   * their real size and damage. Omit for arrows, needles and other charged
   * moves whose projectile body must stay constant.
   */
  storedChargeScaling?: {
    minimumDamage: number;
    minimumRadius: number;
  };
}

export interface AttackDefinition {
  label: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  angle: number;
  baseKnockback: number;
  knockbackGrowth: number;
  hitstop: number;
  hitstun: number;
  radius: number;
  offset: Vec2;
  /**
   * Optional authored local-space hitbox chain. Offsets face forward with the
   * fighter and may move linearly during their own active-frame interval.
   * When omitted, the engine builds a balanced Melee-style profile from the
   * move family, radius and offset.
   */
  hitboxes?: readonly AttackHitboxDefinition[];
  shieldDamage: number;
  chargeable?: boolean;
  maxChargeFrames?: number;
  storesCharge?: boolean;
  movement?: Vec2;
  airMovement?: Vec2;
  /** Multi-phase movement authored by a special rather than a single impulse. */
  specialMovement?:
    | {
        kind: "directional-bursts";
        frames: readonly number[];
        speed: number;
        rotateWithDirection?: boolean;
      }
    | {
        kind: "directional-launch";
        speed: number;
        rotateWithDirection?: boolean;
      }
    | {
        kind: "authored-root-motion";
        samples: readonly (readonly [forward: number, vertical: number])[];
        airVerticalMultiplier?: number;
      }
    | {
        kind: "steered-rise";
        riseSpeed: number;
        horizontalSpeed: number;
        steerFrames: number;
        staysGroundedWhenStartedGrounded?: boolean;
      }
    | {
        kind: "rise-then-dive";
        riseSpeed: number;
        riseFrames: number;
        diveSpeed: number;
      }
    | {
        kind: "air-dive";
        diveSpeed: number;
      }
    | {
        kind: "ground-steered";
        speed: number;
      };
  selfDamage?: number;
  multiHit?: number;
  projectile?: ProjectileDefinition;
  alsoMelee?: boolean;
  reflectsProjectiles?: boolean;
  absorbsProjectiles?: boolean;
  counters?: boolean;
  /** A special grab: bypasses shield and cannot be countered like a strike. */
  commandGrab?: boolean;
  statusEffect?: "sleep" | "stun" | "bury";
  statusFrames?: number;
  requiresFacingTarget?: boolean;
  reversesFacing?: boolean;
}

export interface AttackHitboxDefinition {
  offset: Vec2;
  endOffset?: Vec2;
  radius: number;
  /** Inclusive frames relative to the move's first active frame. */
  activeStart?: number;
  activeEnd?: number;
  damageMultiplier?: number;
  knockbackMultiplier?: number;
  /** Higher zones resolve first when more than one overlaps the same hurtbox. */
  priority?: number;
  kind?: "sweet" | "normal" | "sour";
}

export interface ThrowDefinition {
  damage: number;
  angle: number;
  baseKnockback: number;
  knockbackGrowth: number;
}

export interface FighterDefinition {
  id: FighterId;
  displayName: string;
  archetype: string;
  playstyle: string;
  colors: { primary: string; secondary: string; accent: string };
  size: { width: number; height: number };
  /** Average opaque idle height inside a 192 px exact-animation atlas cell. */
  spriteReferenceHeight: number;
  weight: number;
  initialDashSpeed: number;
  initialDashFrames: number;
  runSpeed: number;
  airSpeed: number;
  groundAcceleration: number;
  airAcceleration: number;
  traction: number;
  wavedashTraction: number;
  gravity: number;
  maxFallSpeed: number;
  fastFallSpeed: number;
  jumpSpeed: number;
  doubleJumpSpeed: number;
  jumpSquatFrames: number;
  shortHopSpeedMultiplier: number;
  maxJumps: number;
  floatDurationFrames?: number;
  shieldHealth: number;
  shieldRegen: number;
  attacks: Record<MoveName, AttackDefinition>;
  throws: Record<ThrowName, ThrowDefinition>;
}


const marioAttacks: Record<MoveName, AttackDefinition> = {
  jab: move("Hero Combo", 3, 38, 25, 0.46, 2, 2, 9, 30, { x: 32, y: 4 }),
  "dash-attack": move("Sliding Kick", 10, 52, 41, 0.76, 6, 5, 22, 43, { x: 41, y: -2 }, { movement: { x: 250, y: 0 } }),
  "forward-tilt": move("Boot Kick", 8, 36, 38, 0.73, 5, 3, 14, 37, { x: 38, y: 4 }),
  "up-tilt": move("Spinning Uppercut", 6, 94, 31, 0.66, 4, 4, 12, 37, { x: 6, y: 52 }),
  "down-tilt": move("Sweep", 7, 67, 30, 0.61, 5, 3, 13, 35, { x: 36, y: -28 }),
  "forward-smash": move("Meteor Fist", 17, 39, 58, 1.12, 12, 4, 27, 48, { x: 48, y: 5 }, { chargeable: true, maxChargeFrames: 50 }),
  "up-smash": move("Headbutt", 16, 88, 57, 1.08, 10, 5, 26, 49, { x: 4, y: 58 }, { chargeable: true, maxChargeFrames: 50 }),
  "down-smash": move("Spin", 15, 28, 55, 1.04, 9, 5, 25, 48, { x: 0, y: -23 }, { chargeable: true, maxChargeFrames: 50 }),
  "neutral-air": move("Twirl", 9, 50, 40, 0.74, 3, 9, 16, 43, { x: 0, y: 4 }),
  "forward-air": move("Aerial Hammer", 13, 292, 48, 0.95, 11, 4, 24, 44, { x: 42, y: 4 }),
  "back-air": move("Heel Kick", 11, 145, 48, 0.91, 6, 4, 17, 42, { x: -39, y: 7 }),
  "up-air": move("Scissors Kick", 8, 78, 37, 0.75, 4, 5, 14, 39, { x: 5, y: 43 }),
  "down-air": move("Descending Tornado", 10, 270, 38, 0.76, 7, 8, 22, 43, { x: 0, y: -39 }, { multiHit: 3 }),
  "neutral-special": move("Fireball", 6, 42, 28, 0.48, 11, 1, 18, 22, { x: 35, y: 6 }, {
    projectile: { kind: "fireball", speed: 430, gravity: 520, lifetimeFrames: 110, radius: 17, bounces: 3, absorbable: true },
  }),
  "side-special": move("Reversing Cape", 8, 52, 36, 0.62, 7, 5, 20, 43, { x: 39, y: 6 }, { reflectsProjectiles: true, reversesFacing: true }),
  "up-special": move("Super Jump", 7, 76, 43, 0.68, 3, 10, 27, 38, { x: 14, y: 42 }, {
    specialMovement: {
      kind: "authored-root-motion",
      samples: EXACT_UP_SPECIAL_ROOT_MOTION["mario/up-special"],
      airVerticalMultiplier: 1.08,
    },
    multiHit: 4,
  }),
  "down-special": move("Water Push", 0, 35, 53, 0.42, 8, 9, 23, 49, { x: 34, y: 2 }, {
    chargeable: true,
    maxChargeFrames: 90,
    storesCharge: true,
  }),
};

const linkAttacks: Record<MoveName, AttackDefinition> = {
  jab: move("Thrust", 4, 38, 27, 0.51, 4, 2, 10, 38, { x: 42, y: 4 }),
  "dash-attack": move("Leaping Slash", 14, 46, 52, 0.91, 9, 5, 27, 55, { x: 50, y: 5 }, { movement: { x: 230, y: 0 } }),
  "forward-tilt": move("Horizontal Slash", 10, 38, 42, 0.79, 8, 4, 18, 53, { x: 48, y: 8 }),
  "up-tilt": move("Rising Arc", 9, 89, 39, 0.76, 7, 5, 17, 50, { x: 4, y: 55 }),
  "down-tilt": move("Low Slash", 8, 72, 36, 0.69, 7, 4, 15, 48, { x: 43, y: -27 }),
  "forward-smash": move("Sacred Blade", 19, 42, 64, 1.12, 15, 5, 32, 59, { x: 55, y: 7 }, { chargeable: true, maxChargeFrames: 55 }),
  "up-smash": move("Triple Crescent", 17, 86, 60, 1.04, 12, 8, 30, 57, { x: 6, y: 61 }, { chargeable: true, maxChargeFrames: 55, multiHit: 3 }),
  "down-smash": move("Double Reap", 16, 31, 58, 1, 11, 7, 29, 55, { x: 0, y: -25 }, { chargeable: true, maxChargeFrames: 55 }),
  "neutral-air": move("Roundhouse Kick", 10, 47, 43, 0.78, 5, 8, 18, 43, { x: 0, y: 2 }),
  "forward-air": move("Double Blade", 14, 41, 52, 0.96, 12, 7, 27, 56, { x: 48, y: 3 }, { multiHit: 2 }),
  "back-air": move("Double Heel", 11, 142, 45, 0.82, 6, 6, 18, 43, { x: -40, y: 5 }, { multiHit: 2 }),
  "up-air": move("Sky Thrust", 13, 84, 51, 0.92, 9, 7, 22, 51, { x: 2, y: 51 }),
  "down-air": move("Diving Blade", 15, 270, 52, 0.98, 13, 12, 31, 50, { x: 0, y: -47 }),
  "neutral-special": move("Traveler Bow", 8, 39, 35, 0.63, 14, 1, 22, 20, { x: 42, y: 12 }, {
    chargeable: true,
    maxChargeFrames: 60,
    projectile: { kind: "arrow", speed: 720, gravity: 80, lifetimeFrames: 105, radius: 12 },
  }),
  "side-special": move("Storm Boomerang", 7, 32, 35, 0.58, 10, 1, 22, 24, { x: 39, y: 7 }, {
    projectile: { kind: "boomerang", speed: 500, gravity: 0, lifetimeFrames: 165, radius: 20, returns: true },
  }),
  "up-special": move("Blade Tornado", 12, 82, 51, 0.91, 6, 12, 34, 51, { x: 0, y: 21 }, {
    specialMovement: {
      kind: "steered-rise",
      riseSpeed: 680,
      horizontalSpeed: 235,
      steerFrames: 22,
      staysGroundedWhenStartedGrounded: true,
    },
    multiHit: 5,
  }),
  "down-special": move("Runic Bomb", 9, 70, 43, 0.75, 13, 1, 19, 25, { x: 30, y: -5 }, {
    projectile: {
      kind: "bomb",
      speed: 230,
      gravity: 780,
      lifetimeFrames: 145,
      radius: 24,
      bounces: 2,
      manualDetonation: true,
      explosionRadius: 76,
    },
  }),
};

const samusAttacks: Record<MoveName, AttackDefinition> = {
  jab: move("Armored Jab", 3, 42, 25, 0.45, 3, 2, 9, 31, { x: 34, y: 5 }),
  "dash-attack": move("Boosted Shoulder", 12, 48, 48, 0.86, 8, 6, 24, 50, { x: 45, y: 4 }, { movement: { x: 260, y: 0 } }),
  "forward-tilt": move("Plasma Heel", 9, 39, 40, 0.74, 7, 4, 17, 45, { x: 43, y: 8 }),
  "up-tilt": move("Orbital Axe", 11, 82, 44, 0.83, 9, 5, 20, 47, { x: 2, y: 55 }),
  "down-tilt": move("Ground Cannon", 10, 70, 39, 0.78, 6, 4, 18, 41, { x: 41, y: -27 }),
  "forward-smash": move("Heavy Cannon", 18, 40, 62, 1.09, 14, 5, 31, 58, { x: 54, y: 7 }, { chargeable: true, maxChargeFrames: 60 }),
  "up-smash": move("Volcanic Arc", 17, 87, 58, 1.02, 13, 10, 31, 53, { x: 8, y: 58 }, { chargeable: true, maxChargeFrames: 60, multiHit: 5 }),
  "down-smash": move("Photon Sweep", 15, 32, 55, 0.98, 11, 6, 28, 51, { x: 0, y: -26 }, { chargeable: true, maxChargeFrames: 60 }),
  "neutral-air": move("Armored Spin", 10, 46, 42, 0.76, 5, 10, 18, 45, { x: 0, y: 4 }),
  "forward-air": move("Orbital Flames", 12, 43, 43, 0.72, 8, 11, 23, 51, { x: 43, y: 5 }, { multiHit: 5 }),
  "back-air": move("Back Thruster", 13, 143, 52, 0.97, 9, 4, 22, 47, { x: -44, y: 8 }),
  "up-air": move("Sky Drill", 11, 84, 42, 0.71, 6, 9, 21, 43, { x: 1, y: 48 }, { multiHit: 4 }),
  "down-air": move("Meteor Cannon", 14, 275, 49, 0.91, 12, 5, 26, 48, { x: 0, y: -44 }),
  "neutral-special": move("Charge Shot", 25, 38, 48, 0.94, 18, 1, 25, 30, { x: 42, y: 8 }, {
    chargeable: true,
    maxChargeFrames: 125,
    storesCharge: true,
    projectile: {
      kind: "charge-shot",
      speed: 650,
      gravity: 0,
      lifetimeFrames: 110,
      radius: 27,
      absorbable: true,
      storedChargeScaling: { minimumDamage: 3, minimumRadius: 8 },
    },
  }),
  "side-special": move("Homing Missile", 10, 44, 42, 0.72, 13, 1, 25, 25, { x: 42, y: 8 }, {
    projectile: { kind: "missile", speed: 390, gravity: 0, lifetimeFrames: 140, radius: 20 },
  }),
  "up-special": move("Electric Spin", 11, 84, 45, 0.78, 4, 12, 31, 46, { x: 0, y: 33 }, {
    specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["samus/up-special"] },
    multiHit: 7,
  }),
  "down-special": move("Morph Bomb", 8, 74, 38, 0.68, 9, 1, 18, 22, { x: 0, y: -28 }, {
    projectile: { kind: "bomb", speed: 35, gravity: 350, lifetimeFrames: 85, radius: 22, bounces: 1 },
  }),
};

const pikachuAttacks: Record<MoveName, AttackDefinition> = {
  jab: move("Lightning Jab", 2, 44, 20, 0.38, 2, 2, 6, 28, { x: 29, y: 2 }),
  "dash-attack": move("Running Headbutt", 11, 48, 44, 0.82, 6, 5, 20, 41, { x: 38, y: 1 }, { movement: { x: 300, y: 0 } }),
  "forward-tilt": move("Double Paw", 8, 35, 35, 0.7, 5, 4, 13, 38, { x: 37, y: 3 }),
  "up-tilt": move("Arc Tail", 6, 96, 29, 0.59, 4, 5, 11, 38, { x: 1, y: 43 }),
  "down-tilt": move("Low Tail", 6, 65, 28, 0.55, 4, 4, 10, 36, { x: 36, y: -21 }),
  "forward-smash": move("Discharge", 16, 37, 57, 1.07, 11, 6, 25, 48, { x: 47, y: 2 }, { chargeable: true, maxChargeFrames: 48 }),
  "up-smash": move("Volt Tail", 15, 87, 54, 1.05, 9, 5, 23, 45, { x: 3, y: 48 }, { chargeable: true, maxChargeFrames: 48 }),
  "down-smash": move("Circular Storm", 14, 30, 50, 0.94, 8, 9, 24, 45, { x: 0, y: -18 }, { chargeable: true, maxChargeFrames: 48, multiHit: 4 }),
  "neutral-air": move("Electric Field", 8, 51, 35, 0.67, 3, 10, 13, 39, { x: 0, y: 1 }, { multiHit: 3 }),
  "forward-air": move("Spark Twirl", 11, 43, 42, 0.78, 6, 9, 17, 42, { x: 36, y: 2 }, { multiHit: 4 }),
  "back-air": move("Back Whirl", 10, 145, 40, 0.77, 5, 8, 15, 39, { x: -34, y: 4 }, { multiHit: 3 }),
  "up-air": move("Sky Tail", 7, 81, 32, 0.63, 3, 5, 11, 36, { x: 1, y: 38 }),
  "down-air": move("Diving Bolt", 12, 270, 45, 0.87, 9, 7, 20, 42, { x: 0, y: -36 }),
  "neutral-special": move("Thunder Wave", 7, 48, 32, 0.58, 9, 1, 16, 19, { x: 30, y: -2 }, {
    projectile: { kind: "thunder-jolt", speed: 420, gravity: 430, lifetimeFrames: 125, radius: 16, bounces: 5, absorbable: true },
  }),
  "side-special": move("Skull Bash", 14, 36, 53, 0.95, 14, 8, 27, 43, { x: 37, y: 1 }, { movement: { x: 660, y: 65 }, chargeable: true, maxChargeFrames: 45 }),
  "up-special": move("Quick Attack", 6, 70, 33, 0.51, 2, 8, 22, 35, { x: 0, y: 7 }, {
    multiHit: 2,
    specialMovement: { kind: "directional-bursts", frames: [2, 10], speed: 910, rotateWithDirection: true },
  }),
  "down-special": move("Thunder", 12, 72, 50, 0.88, 15, 1, 25, 25, { x: 0, y: 110 }, {
    projectile: {
      kind: "thunder",
      speed: 690,
      gravity: 0,
      lifetimeFrames: 55,
      radius: 25,
      vertical: true,
      absorbable: true,
      ownerDischargeRadius: 68,
    },
  }),
};

const donkeyKongAttacks: Record<MoveName, AttackDefinition> = {
  jab: move("Gorilla Fist", 5, 41, 31, 0.52, 4, 3, 11, 39, { x: 43, y: 5 }),
  "dash-attack": move("Kong Roll", 12, 43, 50, 0.87, 8, 7, 25, 58, { x: 51, y: -3 }, { movement: { x: 285, y: 0 } }),
  "forward-tilt": move("Swinging Arm", 11, 37, 46, 0.82, 8, 5, 19, 59, { x: 55, y: 5 }),
  "up-tilt": move("Upward Slap", 10, 91, 43, 0.8, 7, 5, 18, 55, { x: 5, y: 65 }),
  "down-tilt": move("Low Slap", 8, 61, 37, 0.69, 6, 4, 16, 50, { x: 48, y: -31 }),
  "forward-smash": move("Double Hammer", 22, 38, 70, 1.2, 18, 6, 36, 68, { x: 62, y: 3 }, { chargeable: true, maxChargeFrames: 65 }),
  "up-smash": move("Titan Slap", 21, 87, 68, 1.16, 16, 6, 34, 64, { x: 3, y: 68 }, { chargeable: true, maxChargeFrames: 65 }),
  "down-smash": move("Seismic Fists", 20, 30, 65, 1.11, 14, 7, 33, 66, { x: 0, y: -30 }, { chargeable: true, maxChargeFrames: 65 }),
  "neutral-air": move("Spinning Body", 12, 48, 49, 0.86, 6, 11, 22, 55, { x: 0, y: 5 }),
  "forward-air": move("Meteor Fist", 17, 285, 59, 1.02, 14, 5, 31, 57, { x: 51, y: -3 }),
  "back-air": move("Heel Strike", 14, 143, 57, 1.01, 8, 5, 22, 50, { x: -49, y: 6 }),
  "up-air": move("Hard Head", 13, 84, 52, 0.94, 7, 5, 20, 50, { x: 1, y: 55 }),
  "down-air": move("Giant Stomp", 16, 270, 56, 0.99, 12, 6, 27, 53, { x: 0, y: -49 }),
  "neutral-special": move("Giant Punch", 20, 38, 66, 1.14, 16, 6, 32, 61, { x: 55, y: 4 }, {
    chargeable: true,
    maxChargeFrames: 90,
    storesCharge: true,
  }),
  "side-special": move("Headbutt", 12, 65, 48, 0.81, 10, 5, 25, 57, { x: 49, y: 2 }, {
    movement: { x: 185, y: 0 },
    statusEffect: "bury",
    statusFrames: 68,
  }),
  "up-special": move("Spinning Kong", 13, 42, 49, 0.85, 7, 14, 35, 63, { x: 0, y: 9 }, {
    specialMovement: {
      kind: "steered-rise",
      riseSpeed: 330,
      horizontalSpeed: 430,
      steerFrames: 30,
      staysGroundedWhenStartedGrounded: true,
    },
    multiHit: 6,
  }),
  "down-special": move("Ground Drum", 14, 78, 54, 0.92, 11, 6, 29, 72, { x: 0, y: -35 }, {
    projectile: {
      kind: "ground-wave",
      speed: 460,
      gravity: 0,
      lifetimeFrames: 42,
      radius: 26,
      restsOnGround: true,
    },
    alsoMelee: true,
  }),
};

export const ROSTER: Record<FighterId, FighterDefinition> = {
  mario: {
    id: "mario",
    displayName: "Mario",
    archetype: "Polyvalent",
    playstyle: "Close-range pressure, combos, and fireballs",
    colors: { primary: "#e63338", secondary: "#2468d8", accent: "#ffd85a" },
    size: { width: 62, height: 82 },
    spriteReferenceHeight: 120.45,
    weight: 98,
    initialDashSpeed: meleeHorizontalSpeed(1.5),
    initialDashFrames: 10,
    runSpeed: meleeHorizontalSpeed(1.5),
    airSpeed: meleeHorizontalSpeed(0.86),
    groundAcceleration: 3_500,
    airAcceleration: meleeHorizontalAcceleration(0.045),
    traction: meleeHorizontalAcceleration(0.06),
    wavedashTraction: meleeHorizontalAcceleration(0.06),
    gravity: meleeGravity(0.095),
    maxFallSpeed: meleeVerticalSpeed(1.7),
    fastFallSpeed: meleeVerticalSpeed(2.3),
    // Engine-equivalent impulses reproduce Melee's measured 29u / 11.025u hops.
    jumpSpeed: meleeVerticalSpeed(2.395),
    doubleJumpSpeed: meleeVerticalSpeed(2.3),
    jumpSquatFrames: 4,
    shortHopSpeedMultiplier: 0.6242,
    maxJumps: 2,
    shieldHealth: 60,
    shieldRegen: 7,
    attacks: marioAttacks,
    throws: standardThrows(),
  },
  link: {
    id: "link",
    displayName: "Link",
    archetype: "Tactical Swordsman",
    playstyle: "Reach, projectiles, and space control",
    colors: { primary: "#2f9b5f", secondary: "#d8ba71", accent: "#62c8ff" },
    size: { width: 64, height: 91 },
    spriteReferenceHeight: 103.275,
    weight: 104,
    initialDashSpeed: meleeHorizontalSpeed(1.3),
    initialDashFrames: 12,
    runSpeed: meleeHorizontalSpeed(1.3),
    airSpeed: meleeHorizontalSpeed(1),
    groundAcceleration: 3_050,
    airAcceleration: meleeHorizontalAcceleration(0.06),
    traction: meleeHorizontalAcceleration(0.1),
    wavedashTraction: meleeHorizontalAcceleration(0.1),
    gravity: meleeGravity(0.11),
    maxFallSpeed: meleeVerticalSpeed(2.13),
    fastFallSpeed: meleeVerticalSpeed(3),
    jumpSpeed: meleeVerticalSpeed(2.61),
    doubleJumpSpeed: meleeVerticalSpeed(2.2),
    jumpSquatFrames: 6,
    shortHopSpeedMultiplier: 0.6169,
    maxJumps: 2,
    shieldHealth: 64,
    shieldRegen: 6.5,
    attacks: linkAttacks,
    throws: standardThrows(1.05),
  },
  samus: {
    id: "samus",
    displayName: "Samus",
    archetype: "Heavy Artillery",
    playstyle: "Charge shots, missiles, and ranged coverage",
    colors: { primary: "#e9792f", secondary: "#c72f35", accent: "#68f0c1" },
    size: { width: 69, height: 96 },
    spriteReferenceHeight: 117.825,
    weight: 108,
    initialDashSpeed: meleeHorizontalSpeed(1.86),
    initialDashFrames: 8,
    runSpeed: meleeHorizontalSpeed(1.4),
    airSpeed: meleeHorizontalSpeed(0.89),
    groundAcceleration: 3_300,
    airAcceleration: meleeHorizontalAcceleration(0.0325),
    traction: meleeHorizontalAcceleration(0.06),
    wavedashTraction: meleeHorizontalAcceleration(0.06),
    gravity: meleeGravity(0.066),
    maxFallSpeed: meleeVerticalSpeed(1.4),
    fastFallSpeed: meleeVerticalSpeed(2.3),
    jumpSpeed: meleeVerticalSpeed(2.166),
    doubleJumpSpeed: meleeVerticalSpeed(1.89),
    jumpSquatFrames: 3,
    shortHopSpeedMultiplier: 0.8153,
    maxJumps: 2,
    shieldHealth: 66,
    shieldRegen: 6,
    attacks: samusAttacks,
    throws: standardThrows(1.02),
  },
  pikachu: {
    id: "pikachu",
    displayName: "Pikachu",
    archetype: "Electric Rushdown",
    playstyle: "Speed, combos, and lightning-fast recovery",
    colors: { primary: "#f2ce36", secondary: "#272531", accent: "#f45d53" },
    size: { width: 50, height: 62 },
    spriteReferenceHeight: 97.05,
    weight: 79,
    initialDashSpeed: meleeHorizontalSpeed(1.8),
    initialDashFrames: 13,
    runSpeed: meleeHorizontalSpeed(1.8),
    airSpeed: meleeHorizontalSpeed(0.85),
    groundAcceleration: 4_200,
    airAcceleration: meleeHorizontalAcceleration(0.05),
    traction: meleeHorizontalAcceleration(0.09),
    wavedashTraction: meleeHorizontalAcceleration(0.09),
    gravity: meleeGravity(0.11),
    maxFallSpeed: meleeVerticalSpeed(1.9),
    fastFallSpeed: meleeVerticalSpeed(2.7),
    jumpSpeed: meleeVerticalSpeed(2.71),
    doubleJumpSpeed: meleeVerticalSpeed(2.6),
    jumpSquatFrames: 3,
    shortHopSpeedMultiplier: 0.6679,
    maxJumps: 2,
    shieldHealth: 54,
    shieldRegen: 7.5,
    attacks: pikachuAttacks,
    throws: standardThrows(0.9),
  },
  "donkey-kong": {
    id: "donkey-kong",
    displayName: "Donkey Kong",
    archetype: "Heavy Grappler",
    playstyle: "Power, grabs, and early KOs",
    colors: { primary: "#7b432d", secondary: "#ad6a3d", accent: "#e92e38" },
    size: { width: 94, height: 112 },
    spriteReferenceHeight: 87.675,
    weight: 127,
    initialDashSpeed: meleeHorizontalSpeed(1.6),
    initialDashFrames: 15,
    runSpeed: meleeHorizontalSpeed(1.6),
    airSpeed: meleeHorizontalSpeed(1),
    groundAcceleration: 3_750,
    airAcceleration: meleeHorizontalAcceleration(0.04),
    traction: meleeHorizontalAcceleration(0.08),
    wavedashTraction: meleeHorizontalAcceleration(0.08),
    gravity: meleeGravity(0.1),
    maxFallSpeed: meleeVerticalSpeed(2.4),
    fastFallSpeed: meleeVerticalSpeed(2.96),
    jumpSpeed: meleeVerticalSpeed(2.8),
    doubleJumpSpeed: meleeVerticalSpeed(2.457),
    jumpSquatFrames: 5,
    shortHopSpeedMultiplier: 0.5395,
    maxJumps: 2,
    shieldHealth: 72,
    shieldRegen: 5.5,
    attacks: donkeyKongAttacks,
    throws: standardThrows(1.22),
  },
  ...ADDITIONAL_MELEE_ROSTER,
  ...OPEN_ROSTER,
};

export function getFighterDefinition(id: FighterId): FighterDefinition {
  return ROSTER[id];
}
