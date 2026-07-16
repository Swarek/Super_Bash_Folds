import {
  FIGHTER_IDS,
  OPEN_2D_FIGHTER_IDS,
  OPEN_3D_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
  type FighterId,
} from "./contracts";
import { OPEN_ROSTER } from "./openRoster";

export {
  FIGHTER_IDS,
  OPEN_2D_FIGHTER_IDS,
  OPEN_3D_FIGHTER_IDS,
  OPEN_FIGHTER_IDS,
};

/** Visual model height relative to the gameplay hurtbox height. */
export const SPRITE_VISUAL_TO_BODY_HEIGHT_RATIO = 1.17;

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
    | "bomb"
    | "capsule"
    | "blaster"
    | "needle"
    | "energy-orb"
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
  /** Optional minimum profile for projectiles whose stored charge changes size and damage. */
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
  /** Optional authored local-space hitbox chain. */
  hitboxes?: readonly AttackHitboxDefinition[];
  shieldDamage: number;
  chargeable?: boolean;
  maxChargeFrames?: number;
  storesCharge?: boolean;
  movement?: Vec2;
  airMovement?: Vec2;
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
  activeStart?: number;
  activeEnd?: number;
  damageMultiplier?: number;
  knockbackMultiplier?: number;
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
  /** Average opaque idle height inside the authored animation atlas cell. */
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

export const ROSTER: Record<FighterId, FighterDefinition> = OPEN_ROSTER;

export function getFighterDefinition(id: FighterId): FighterDefinition {
  return ROSTER[id];
}
