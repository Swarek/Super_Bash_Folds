import type { OpenFighterId } from "./contracts";
import {
  buildUltimateAttacks,
  meleeGravity,
  meleeHorizontalAcceleration,
  meleeHorizontalSpeed,
  meleeVerticalSpeed,
  standardThrows,
  type UltimateMoveProfile,
} from "./fighterBuilders";
import { OPEN_FIGHTER_PACKS } from "./generated/openFighterRegistry";
import type { FighterDefinition } from "./roster";

interface OpenFighterSeed {
  id: OpenFighterId;
  displayName: string;
  archetype: string;
  playstyle: string;
  colors: FighterDefinition["colors"];
  size: FighterDefinition["size"];
  spriteReferenceHeight: number;
  weight: number;
  dash: number;
  dashFrames: number;
  run: number;
  air: number;
  gravity: number;
  fall: number;
  fastFall: number;
  jump: number;
  doubleJump: number;
  jumpSquat: number;
  shortHop: number;
  power?: number;
  speed?: number;
  reach?: number;
  specials: UltimateMoveProfile["specials"];
}

const createOpenFighter = (seed: OpenFighterSeed): FighterDefinition => ({
  id: seed.id,
  displayName: seed.displayName,
  archetype: seed.archetype,
  playstyle: seed.playstyle,
  colors: seed.colors,
  size: seed.size,
  spriteReferenceHeight: seed.spriteReferenceHeight,
  weight: seed.weight,
  initialDashSpeed: meleeHorizontalSpeed(seed.dash),
  initialDashFrames: seed.dashFrames,
  runSpeed: meleeHorizontalSpeed(seed.run),
  airSpeed: meleeHorizontalSpeed(seed.air),
  groundAcceleration: Math.min(
    3_300,
    Math.round(3_300 * Math.max(0.82, seed.run / 1.6)),
  ),
  airAcceleration: meleeHorizontalAcceleration(Math.max(0.035, seed.air * 0.05)),
  traction: meleeHorizontalAcceleration(seed.weight >= 115 ? 0.075 : 0.065),
  wavedashTraction: meleeHorizontalAcceleration(seed.weight >= 115 ? 0.075 : 0.065),
  gravity: meleeGravity(seed.gravity),
  maxFallSpeed: meleeVerticalSpeed(seed.fall),
  fastFallSpeed: meleeVerticalSpeed(seed.fastFall),
  jumpSpeed: meleeVerticalSpeed(seed.jump),
  doubleJumpSpeed: meleeVerticalSpeed(seed.doubleJump),
  jumpSquatFrames: seed.jumpSquat,
  shortHopSpeedMultiplier: seed.shortHop,
  maxJumps: 2,
  shieldHealth: Math.round(54 + Math.min(20, seed.weight / 7)),
  shieldRegen: Math.max(5.2, 8.2 - seed.weight / 55),
  attacks: buildUltimateAttacks({
    fighterName: seed.displayName,
    power: seed.power,
    speed: seed.speed,
    reach: seed.reach,
    specials: seed.specials,
  }),
  throws: standardThrows(seed.power ?? 1),
});

const seeds = OPEN_FIGHTER_PACKS.map(({ id, identity, gameplay }) => ({
  id,
  ...identity,
  ...gameplay,
})) as unknown as readonly OpenFighterSeed[];

export const OPEN_ROSTER = Object.fromEntries(
  seeds.map((seed) => [seed.id, createOpenFighter(seed)]),
) as Record<OpenFighterId, FighterDefinition>;
