import type {
  AttackDefinition,
  MoveName,
  ProjectileDefinition,
  ThrowDefinition,
  ThrowName,
  Vec2,
} from "./roster";

export const MELEE_HORIZONTAL_WORLD_SCALE = 7.7991409242;
export const MELEE_VERTICAL_WORLD_SCALE = 6.7860696517;

export const meleeHorizontalSpeed = (unitsPerFrame: number): number =>
  Math.round(unitsPerFrame * MELEE_HORIZONTAL_WORLD_SCALE * 60);

export const meleeHorizontalAcceleration = (unitsPerFrameSquared: number): number =>
  Math.round(unitsPerFrameSquared * MELEE_HORIZONTAL_WORLD_SCALE * 60 * 60);

export const meleeVerticalSpeed = (unitsPerFrame: number): number =>
  Math.round(unitsPerFrame * MELEE_VERTICAL_WORLD_SCALE * 60);

export const meleeGravity = (unitsPerFrameSquared: number): number =>
  Math.round(unitsPerFrameSquared * MELEE_VERTICAL_WORLD_SCALE * 60 * 60);

export const move = (
  label: string,
  damage: number,
  angle: number,
  baseKnockback: number,
  knockbackGrowth: number,
  startup: number,
  active: number,
  recovery: number,
  radius: number,
  offset: Vec2,
  extra: Partial<AttackDefinition> = {},
): AttackDefinition => ({
  label,
  startup,
  active,
  recovery,
  damage,
  angle,
  baseKnockback,
  knockbackGrowth,
  hitstop: Math.max(3, Math.round(damage * 0.45)),
  hitstun: Math.max(7, Math.round(baseKnockback * 0.35)),
  radius,
  offset,
  shieldDamage: damage * 0.75 + 2,
  ...extra,
});

export const standardThrows = (power = 1): Record<ThrowName, ThrowDefinition> => ({
  forward: { damage: 7 * power, angle: 35, baseKnockback: 49, knockbackGrowth: 0.78 },
  back: { damage: 8 * power, angle: 145, baseKnockback: 52, knockbackGrowth: 0.83 },
  up: { damage: 6 * power, angle: 82, baseKnockback: 47, knockbackGrowth: 0.8 },
  down: { damage: 6 * power, angle: 68, baseKnockback: 34, knockbackGrowth: 0.65 },
});

export interface UltimateMoveProfile {
  fighterName: string;
  power?: number;
  speed?: number;
  reach?: number;
  specials: Readonly<Record<
    "neutral-special" | "side-special" | "up-special" | "down-special",
    {
      label: string;
      damage: number;
      angle?: number;
      startup?: number;
      active?: number;
      recovery?: number;
      radius?: number;
      offset?: Vec2;
      projectile?: ProjectileDefinition;
      movement?: Vec2;
      airMovement?: Vec2;
      specialMovement?: AttackDefinition["specialMovement"];
      selfDamage?: number;
      chargeable?: boolean;
      maxChargeFrames?: number;
      storesCharge?: boolean;
      multiHit?: number;
      reflectsProjectiles?: boolean;
      absorbsProjectiles?: boolean;
      counters?: boolean;
      commandGrab?: boolean;
      statusEffect?: "sleep" | "stun" | "bury";
      statusFrames?: number;
      requiresFacingTarget?: boolean;
      reversesFacing?: boolean;
    }
  >>;
}

const scaledFrames = (frames: number, speed: number): number =>
  Math.max(1, Math.round(frames / speed));

/**
 * Builds the common Ultimate normal-move families while preserving one typed,
 * fully differentiated special kit per fighter. The exact local NUANMB atlas
 * supplies the authored animation; this data owns the simplified combat hitbox.
 */
export const buildUltimateAttacks = (
  profile: UltimateMoveProfile,
): Record<MoveName, AttackDefinition> => {
  const power = profile.power ?? 1;
  const speed = profile.speed ?? 1;
  const reach = profile.reach ?? 1;
  const name = profile.fighterName;
  const normal = (
    label: string,
    damage: number,
    angle: number,
    baseKnockback: number,
    growth: number,
    startup: number,
    active: number,
    recovery: number,
    radius: number,
    offset: Vec2,
    extra: Partial<AttackDefinition> = {},
  ) => move(
    `${name} — ${label}`,
    Math.max(1, Math.round(damage * power * 10) / 10),
    angle,
    Math.round(baseKnockback * power),
    growth * power,
    scaledFrames(startup, speed),
    active,
    scaledFrames(recovery, speed),
    radius * reach,
    { x: offset.x * reach, y: offset.y },
    extra,
  );
  const special = (
    key: keyof UltimateMoveProfile["specials"],
  ): AttackDefinition => {
    const spec = profile.specials[key];
    return move(
      spec.label,
      spec.damage,
      spec.angle ?? 48,
      Math.round((spec.damage <= 0 ? 34 : 38 + spec.damage * 0.9) * power),
      (0.58 + spec.damage / 65) * power,
      scaledFrames(spec.startup ?? 10, speed),
      spec.active ?? Math.max(1, spec.multiHit ? spec.multiHit * 2 : 4),
      scaledFrames(spec.recovery ?? 22, speed),
      (spec.radius ?? 44) * reach,
      spec.offset ?? { x: 36 * reach, y: 4 },
      {
        projectile: spec.projectile,
        movement: spec.movement,
        airMovement: spec.airMovement,
        specialMovement: spec.specialMovement,
        selfDamage: spec.selfDamage,
        chargeable: spec.chargeable,
        maxChargeFrames: spec.maxChargeFrames,
        storesCharge: spec.storesCharge,
        multiHit: spec.multiHit,
        reflectsProjectiles: spec.reflectsProjectiles,
        absorbsProjectiles: spec.absorbsProjectiles,
        counters: spec.counters,
        commandGrab: spec.commandGrab,
        statusEffect: spec.statusEffect,
        statusFrames: spec.statusFrames,
        requiresFacingTarget: spec.requiresFacingTarget,
        reversesFacing: spec.reversesFacing,
      },
    );
  };

  return {
    jab: normal("neutral attack", 3, 40, 25, 0.48, 3, 2, 9, 31, { x: 33, y: 4 }),
    "dash-attack": normal("dash attack", 10, 48, 44, 0.8, 7, 6, 22, 48, { x: 44, y: 1 }, { movement: { x: 270, y: 0 } }),
    "forward-tilt": normal("forward tilt", 9, 38, 40, 0.76, 7, 4, 17, 43, { x: 42, y: 5 }),
    "up-tilt": normal("up tilt", 8, 88, 37, 0.72, 6, 5, 16, 42, { x: 3, y: 50 }),
    "down-tilt": normal("down tilt", 7, 67, 33, 0.64, 6, 4, 14, 40, { x: 39, y: -25 }),
    "forward-smash": normal("forward smash", 17, 40, 61, 1.08, 14, 5, 30, 54, { x: 50, y: 5 }, { chargeable: true, maxChargeFrames: 55 }),
    "up-smash": normal("up smash", 16, 87, 58, 1.04, 11, 6, 28, 51, { x: 3, y: 58 }, { chargeable: true, maxChargeFrames: 55 }),
    "down-smash": normal("down smash", 15, 31, 56, 1, 10, 7, 27, 52, { x: 0, y: -25 }, { chargeable: true, maxChargeFrames: 55 }),
    "neutral-air": normal("neutral aerial", 9, 48, 40, 0.75, 5, 9, 18, 43, { x: 0, y: 3 }),
    "forward-air": normal("forward aerial", 12, 42, 49, 0.9, 9, 6, 23, 48, { x: 43, y: 4 }),
    "back-air": normal("back aerial", 11, 143, 48, 0.88, 7, 5, 20, 45, { x: -41, y: 6 }),
    "up-air": normal("up aerial", 9, 83, 40, 0.78, 6, 6, 17, 43, { x: 2, y: 46 }),
    "down-air": normal("down aerial", 12, 270, 46, 0.86, 10, 7, 23, 46, { x: 0, y: -42 }),
    "neutral-special": special("neutral-special"),
    "side-special": special("side-special"),
    "up-special": special("up-special"),
    "down-special": special("down-special"),
  };
};
