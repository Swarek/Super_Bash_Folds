import type { MeleeFighterId } from "./contracts";
import {
  buildUltimateAttacks,
  meleeGravity,
  meleeHorizontalAcceleration,
  meleeHorizontalSpeed,
  meleeVerticalSpeed,
  standardThrows,
  type UltimateMoveProfile,
} from "./fighterBuilders";
import type {
  FighterDefinition,
  ProjectileDefinition,
} from "./roster";
import { EXACT_UP_SPECIAL_ROOT_MOTION } from "./exactSpecialAnimationMetadata";

type OriginalFighterId = "mario" | "link" | "samus" | "pikachu" | "donkey-kong";
type AdditionalFighterId = Exclude<MeleeFighterId, OriginalFighterId>;

interface FighterSeed {
  id: AdditionalFighterId;
  displayName: string;
  archetype: string;
  playstyle: string;
  colors: FighterDefinition["colors"];
  size: FighterDefinition["size"];
  weight: number;
  run: number;
  dash?: number;
  dashFrames: number;
  air: number;
  gravity: number;
  fall: number;
  fastFall: number;
  jump: number;
  doubleJump: number;
  jumpSquat: number;
  shortHop: number;
  maxJumps?: number;
  floatDurationFrames?: number;
  power?: number;
  speed?: number;
  reach?: number;
  specials: UltimateMoveProfile["specials"];
}

const ABSORBABLE_PROJECTILE_KINDS = new Set<ProjectileDefinition["kind"]>([
  "fireball",
  "blaster",
  "pk-fire",
  "pk-flash",
  "pk-thunder",
  "ice-shot",
  "din-fire",
  "shadow-ball",
  "fire-breath",
  "thunder-jolt",
  "thunder",
]);

const shot = (
  kind: ProjectileDefinition["kind"],
  speed: number,
  gravity: number,
  lifetimeFrames: number,
  radius: number,
  extra: Partial<ProjectileDefinition> = {},
): ProjectileDefinition => ({
  kind,
  speed,
  gravity,
  lifetimeFrames,
  radius,
  absorbable: ABSORBABLE_PROJECTILE_KINDS.has(kind),
  ...extra,
});

const createFighter = (seed: FighterSeed): FighterDefinition => ({
  id: seed.id,
  displayName: seed.displayName,
  archetype: seed.archetype,
  playstyle: seed.playstyle,
  colors: seed.colors,
  size: seed.size,
  spriteReferenceHeight: ({
    "dr-mario": 120.15,
    luigi: 120.15,
    bowser: 98,
    peach: 106.4,
    yoshi: 112.9,
    "captain-falcon": 100.7,
    ganondorf: 95.5,
    falco: 106.4,
    fox: 109.6,
    ness: 120.15,
    "ice-climbers": 120.15,
    kirby: 128.4,
    zelda: 103.5,
    sheik: 103.5,
    "young-link": 112.9,
    pichu: 133,
    jigglypuff: 133,
    mewtwo: 98,
    "mr-game-and-watch": 112.9,
    marth: 98,
    roy: 98,
  } satisfies Record<AdditionalFighterId, number>)[seed.id],
  weight: seed.weight,
  initialDashSpeed: meleeHorizontalSpeed(seed.dash ?? seed.run * 1.08),
  initialDashFrames: seed.dashFrames,
  runSpeed: meleeHorizontalSpeed(seed.run),
  airSpeed: meleeHorizontalSpeed(seed.air),
  // Fast characters keep their authored top speed, but a 100 ms digital tap
  // must remain steerable instead of crossing a large fraction of the stage.
  groundAcceleration: Math.min(
    3_300,
    Math.round(3_500 * Math.max(0.78, seed.run / 1.5)),
  ),
  airAcceleration: meleeHorizontalAcceleration(Math.max(0.03, seed.air * 0.05)),
  traction: meleeHorizontalAcceleration(seed.weight >= 115 ? 0.075 : 0.065),
  wavedashTraction: meleeHorizontalAcceleration(seed.weight >= 115 ? 0.075 : 0.065),
  gravity: meleeGravity(seed.gravity),
  maxFallSpeed: meleeVerticalSpeed(seed.fall),
  fastFallSpeed: meleeVerticalSpeed(seed.fastFall),
  jumpSpeed: meleeVerticalSpeed(seed.jump),
  doubleJumpSpeed: meleeVerticalSpeed(seed.doubleJump),
  jumpSquatFrames: seed.jumpSquat,
  shortHopSpeedMultiplier: seed.shortHop,
  maxJumps: seed.maxJumps ?? 2,
  floatDurationFrames: seed.floatDurationFrames,
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

const seeds: readonly FighterSeed[] = [
  {
    id: "dr-mario", displayName: "Dr. Mario", archetype: "Methodical Brawler",
    playstyle: "Capsules, heavy strikes, and deliberate defense",
    colors: { primary: "#f4f5f8", secondary: "#d33a3f", accent: "#58c7e8" },
    size: { width: 62, height: 82 }, weight: 98, run: 1.5, dashFrames: 10,
    air: 0.86, gravity: 0.095, fall: 1.7, fastFall: 2.3, jump: 2.395,
    doubleJump: 2.3, jumpSquat: 4, shortHop: 0.624, power: 1.08, speed: 0.94,
    specials: {
      "neutral-special": { label: "Megavitamins", damage: 6, projectile: shot("capsule", 430, 470, 120, 17, { bounces: 4 }) },
      "side-special": { label: "Super Sheet", damage: 7, reflectsProjectiles: true, reversesFacing: true },
      "up-special": { label: "Super Jump Punch", damage: 13, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["dr-mario/up-special"] }, multiHit: 4 },
      "down-special": { label: "Dr. Tornado", damage: 12, multiHit: 5, movement: { x: 110, y: 280 } },
    },
  },
  {
    id: "luigi", displayName: "Luigi", archetype: "Slippery Improviser",
    playstyle: "Unpredictable combos, missile, and explosive recovery",
    colors: { primary: "#39a852", secondary: "#f4f4ee", accent: "#76f0a0" },
    size: { width: 63, height: 88 }, weight: 97, run: 1.34, dash: 1.6, dashFrames: 10,
    air: 0.68, gravity: 0.069, fall: 1.6, fastFall: 2, jump: 2.6,
    doubleJump: 2.45, jumpSquat: 3, shortHop: 0.65, speed: 1.02,
    specials: {
      "neutral-special": { label: "Fireball", damage: 6, projectile: shot("fireball", 400, 360, 125, 17, { bounces: 4 }) },
      "side-special": { label: "Green Missile", damage: 14, movement: { x: 650, y: 80 }, chargeable: true, maxChargeFrames: 55 },
      "up-special": { label: "Super Jump Punch", damage: 15, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["luigi/up-special"] } },
      "down-special": { label: "Luigi Cyclone", damage: 10, multiHit: 5, movement: { x: 95, y: 315 } },
    },
  },
  {
    id: "bowser", displayName: "Bowser", archetype: "Living Fortress",
    playstyle: "Armor, flames, and grabs that finish early",
    colors: { primary: "#7ab43e", secondary: "#d98b36", accent: "#ff5a38" },
    size: { width: 98, height: 121 }, weight: 135, run: 1.5, dash: 1.4, dashFrames: 12,
    air: 0.8, gravity: 0.13, fall: 1.9, fastFall: 2.4, jump: 2.4,
    doubleJump: 2.2, jumpSquat: 8, shortHop: 0.55, power: 1.24, speed: 0.78, reach: 1.18,
    specials: {
      "neutral-special": { label: "Fire Breath", damage: 11, active: 14, multiHit: 5, projectile: shot("fire-breath", 260, 0, 45, 28) },
      "side-special": { label: "Flying Slam", damage: 18, movement: { x: 260, y: 180 }, radius: 62, commandGrab: true },
      "up-special": { label: "Whirling Fortress", damage: 13, multiHit: 7, specialMovement: { kind: "steered-rise", riseSpeed: 500, horizontalSpeed: 355, steerFrames: 27, staysGroundedWhenStartedGrounded: true }, radius: 66 },
      "down-special": {
        label: "Bowser Bomb",
        damage: 20,
        angle: 270,
        radius: 68,
        specialMovement: {
          kind: "rise-then-dive",
          riseSpeed: 650,
          riseFrames: 13,
          diveSpeed: 930,
        },
      },
    },
  },
  {
    id: "peach", displayName: "Peach", archetype: "Royal Aerialist",
    playstyle: "Float, turnips, and precise aerial pressure",
    colors: { primary: "#f39ac1", secondary: "#f8d866", accent: "#8ed8ff" },
    size: { width: 65, height: 91 }, weight: 89, run: 1.5, dashFrames: 11,
    air: 1.1, gravity: 0.08, fall: 1.4, fastFall: 2, jump: 2.35,
    doubleJump: 2.2, jumpSquat: 5, shortHop: 0.65, floatDurationFrames: 150, speed: 1.02, reach: 1.05,
    specials: {
      "neutral-special": { label: "Toad", damage: 9, active: 12, multiHit: 4, counters: true },
      "side-special": { label: "Peach Bomber", damage: 12, movement: { x: 510, y: 95 } },
      "up-special": { label: "Peach Parasol", damage: 11, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["peach/up-special"] }, multiHit: 4 },
      "down-special": { label: "Vegetable Pull", damage: 9, projectile: shot("turnip", 300, 620, 150, 20, { bounces: 1, launchVelocityY: 250 }) },
    },
  },
  {
    id: "yoshi", displayName: "Yoshi", archetype: "Armored Acrobat",
    playstyle: "Strong double jump, eggs, and circular attacks",
    colors: { primary: "#59bd55", secondary: "#f3f1de", accent: "#ef5350" },
    size: { width: 72, height: 90 }, weight: 108, run: 1.6, dash: 1.33, dashFrames: 14,
    air: 1.15, gravity: 0.093, fall: 1.93, fastFall: 2.9, jump: 2.6,
    doubleJump: 2.4, jumpSquat: 6, shortHop: 0.66, power: 1.05, reach: 1.08,
    specials: {
      "neutral-special": { label: "Egg Lay", damage: 7, radius: 50, commandGrab: true, statusEffect: "stun", statusFrames: 72 },
      "side-special": { label: "Egg Roll", damage: 12, specialMovement: { kind: "ground-steered", speed: 570 }, active: 12 },
      "up-special": { label: "Egg Throw", damage: 8, specialMovement: { kind: "steered-rise", riseSpeed: 360, horizontalSpeed: 105, steerFrames: 10, staysGroundedWhenStartedGrounded: true }, projectile: shot("egg", 480, 510, 120, 20, { bounces: 1, launchVelocityY: 320 }) },
      "down-special": {
        label: "Yoshi Bomb",
        damage: 16,
        angle: 270,
        radius: 58,
        specialMovement: {
          kind: "rise-then-dive",
          riseSpeed: 570,
          riseFrames: 10,
          diveSpeed: 860,
        },
      },
    },
  },
  {
    id: "captain-falcon", displayName: "Captain Falcon", archetype: "Explosive Rushdown",
    playstyle: "Extreme speed, reads, and a decisive knee",
    colors: { primary: "#3b3a87", secondary: "#d6b447", accent: "#ff5642" },
    size: { width: 68, height: 99 }, weight: 104, run: 2.3, dash: 2, dashFrames: 8,
    air: 1.12, gravity: 0.13, fall: 2.9, fastFall: 3.5, jump: 2.65,
    doubleJump: 2.3, jumpSquat: 4, shortHop: 0.62, power: 1.08, speed: 1.16, reach: 1.06,
    specials: {
      "neutral-special": { label: "Falcon Punch", damage: 25, startup: 34, recovery: 34, radius: 60 },
      "side-special": { label: "Raptor Boost", damage: 10, movement: { x: 570, y: 35 } },
      "up-special": { label: "Falcon Dive", damage: 12, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["captain-falcon/up-special"] }, radius: 55, commandGrab: true },
      "down-special": {
        label: "Falcon Kick",
        damage: 15,
        movement: { x: 650, y: 0 },
        airMovement: { x: 520, y: -620 },
      },
    },
  },
  {
    id: "ganondorf", displayName: "Ganondorf", archetype: "Warlord",
    playstyle: "Slow strikes, dark reach, and maximum power",
    colors: { primary: "#473753", secondary: "#8f6c45", accent: "#b06cff" },
    size: { width: 80, height: 108 }, weight: 118, run: 1.35, dash: 1.4, dashFrames: 15,
    air: 0.78, gravity: 0.13, fall: 2, fastFall: 2.8, jump: 2.4,
    doubleJump: 2.2, jumpSquat: 6, shortHop: 0.55, power: 1.3, speed: 0.72, reach: 1.15,
    specials: {
      "neutral-special": { label: "Warlock Punch", damage: 30, startup: 42, recovery: 38, radius: 66 },
      "side-special": { label: "Flame Choke", damage: 12, movement: { x: 470, y: 20 }, radius: 58, commandGrab: true },
      "up-special": { label: "Dark Dive", damage: 14, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["ganondorf/up-special"] }, radius: 60, commandGrab: true },
      "down-special": {
        label: "Wizard’s Foot",
        damage: 18,
        movement: { x: 610, y: 0 },
        airMovement: { x: 500, y: -680 },
        radius: 60,
      },
    },
  },
  {
    id: "falco", displayName: "Falco", archetype: "Aerial Combo",
    playstyle: "Lasers, explosive height, and a lateral phantasm",
    colors: { primary: "#357bb2", secondary: "#e5d7bd", accent: "#e84c55" },
    size: { width: 61, height: 88 }, weight: 82, run: 1.5, dash: 1.9, dashFrames: 12,
    air: 0.83, gravity: 0.17, fall: 3.1, fastFall: 3.5, jump: 3.2,
    doubleJump: 2.6, jumpSquat: 5, shortHop: 0.7, speed: 1.1,
    specials: {
      "neutral-special": { label: "Blaster", damage: 4, startup: 7, projectile: shot("blaster", 900, 0, 65, 11) },
      "side-special": { label: "Falco Phantasm", damage: 8, movement: { x: 760, y: 25 } },
      "up-special": { label: "Fire Bird", damage: 13, specialMovement: { kind: "directional-launch", speed: 780, rotateWithDirection: true }, multiHit: 6 },
      "down-special": { label: "Reflector", damage: 5, reflectsProjectiles: true, startup: 2, radius: 52 },
    },
  },
  {
    id: "fox", displayName: "Fox", archetype: "Technical Pressure",
    playstyle: "Fast blaster, mobility, and relentless attacks",
    colors: { primary: "#d9823d", secondary: "#e8e2d2", accent: "#6fe3ff" },
    size: { width: 60, height: 84 }, weight: 75, run: 2, dash: 2.02, dashFrames: 8,
    air: 0.83, gravity: 0.23, fall: 2.8, fastFall: 3.4, jump: 3.2,
    doubleJump: 2.6, jumpSquat: 3, shortHop: 0.62, speed: 1.2,
    specials: {
      "neutral-special": { label: "Blaster", damage: 3, startup: 6, recovery: 9, projectile: shot("blaster", 980, 0, 60, 10) },
      "side-special": { label: "Fox Illusion", damage: 8, movement: { x: 810, y: 20 } },
      "up-special": { label: "Fire Fox", damage: 14, specialMovement: { kind: "directional-launch", speed: 800, rotateWithDirection: true }, multiHit: 6 },
      "down-special": { label: "Reflector", damage: 4, reflectsProjectiles: true, startup: 2, radius: 50 },
    },
  },
  {
    id: "ness", displayName: "Ness", archetype: "Tactical PSI",
    playstyle: "Psychic traps, projectiles, and powerful aerials",
    colors: { primary: "#e54743", secondary: "#3159a8", accent: "#ffd447" },
    size: { width: 58, height: 78 }, weight: 94, run: 1.4, dashFrames: 10,
    air: 0.93, gravity: 0.09, fall: 1.83, fastFall: 2.2, jump: 2.45,
    doubleJump: 2.5, jumpSquat: 3, shortHop: 0.65, power: 1.04,
    specials: {
      "neutral-special": {
        label: "PK Flash",
        damage: 19,
        chargeable: true,
        maxChargeFrames: 70,
        projectile: shot("pk-flash", 250, 35, 110, 28, {
          controlledByOwner: true,
          manualDetonation: true,
          detonatesOnChargeRelease: true,
          explosionRadius: 76,
        }),
      },
      "side-special": { label: "PK Fire", damage: 10, multiHit: 5, projectile: shot("pk-fire", 470, 260, 100, 18, { restsOnGround: true }) },
      "up-special": {
        label: "PK Thunder",
        damage: 11,
        projectile: shot("pk-thunder", 620, 0, 85, 18, {
          controlledByOwner: true,
          ownerLaunchOnContact: { minimumAgeFrames: 8, speed: 940 },
        }),
      },
      "down-special": { label: "PSI Magnet", damage: 0, active: 18, absorbsProjectiles: true, radius: 54 },
    },
  },
  {
    id: "ice-climbers", displayName: "Ice Climbers", archetype: "Synchronized Duo",
    playstyle: "Two hammers, ice, and coordinated pressure",
    colors: { primary: "#62aeea", secondary: "#f0d9c8", accent: "#b8f4ff" },
    size: { width: 68, height: 82 }, weight: 92, run: 1.5, dash: 1.68, dashFrames: 12,
    air: 0.7, gravity: 0.1, fall: 1.6, fastFall: 2.2, jump: 2.55,
    doubleJump: 2.35, jumpSquat: 4, shortHop: 0.62, power: 1.08, reach: 1.08,
    specials: {
      "neutral-special": { label: "Ice Shot", damage: 7, projectile: shot("ice-shot", 410, 430, 120, 18, { bounces: 3 }) },
      "side-special": { label: "Squall Hammer", damage: 12, multiHit: 6, movement: { x: 360, y: 120 } },
      "up-special": { label: "Belay", damage: 9, specialMovement: { kind: "steered-rise", riseSpeed: 740, horizontalSpeed: 145, steerFrames: 16 } },
      "down-special": { label: "Blizzard", damage: 11, multiHit: 6, active: 14, radius: 58 },
    },
  },
  {
    id: "kirby", displayName: "Kirby", archetype: "Aerial Copycat",
    playstyle: "Five jumps, hammer, and tempo changes",
    colors: { primary: "#ef93b8", secondary: "#d54d59", accent: "#79dfff" },
    size: { width: 56, height: 62 }, weight: 79, run: 1.4, dashFrames: 10,
    air: 0.78, gravity: 0.08, fall: 1.6, fastFall: 2, jump: 2.3,
    doubleJump: 2.1, jumpSquat: 3, shortHop: 0.65, maxJumps: 6, speed: 1.04,
    specials: {
      "neutral-special": { label: "Inhale", damage: 5, active: 14, radius: 55, commandGrab: true },
      "side-special": { label: "Hammer Flip", damage: 20, chargeable: true, maxChargeFrames: 65, movement: { x: 180, y: 35 } },
      "up-special": { label: "Final Cutter", damage: 12, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["kirby/up-special"] }, multiHit: 3 },
      "down-special": { label: "Stone", damage: 18, angle: 270, specialMovement: { kind: "air-dive", diveSpeed: 720 }, radius: 55 },
    },
  },
  {
    id: "zelda", displayName: "Zelda", archetype: "Control Mage",
    playstyle: "Reflective magic, traps, and teleportation",
    colors: { primary: "#c99ae4", secondary: "#f1d9b0", accent: "#ffd86d" },
    size: { width: 63, height: 92 }, weight: 85, run: 1.4, dashFrames: 12,
    air: 0.95, gravity: 0.073, fall: 1.4, fastFall: 1.9, jump: 2.3,
    doubleJump: 2.2, jumpSquat: 6, shortHop: 0.6, power: 1.08, speed: 0.94, reach: 1.06,
    specials: {
      "neutral-special": { label: "Nayru’s Love", damage: 10, multiHit: 5, reflectsProjectiles: true, radius: 56 },
      "side-special": {
        label: "Din’s Fire",
        damage: 14,
        chargeable: true,
        maxChargeFrames: 45,
        projectile: shot("din-fire", 370, 0, 120, 26, {
          controlledByOwner: true,
          manualDetonation: true,
          detonatesOnChargeRelease: true,
          explosionRadius: 68,
        }),
      },
      "up-special": { label: "Farore’s Wind", damage: 12, specialMovement: { kind: "directional-launch", speed: 815 } },
      "down-special": {
        label: "Phantom Slash",
        damage: 18,
        startup: 24,
        chargeable: true,
        maxChargeFrames: 60,
        projectile: shot("phantom", 330, 0, 75, 34),
      },
    },
  },
  {
    id: "sheik", displayName: "Sheik", archetype: "Technical Ninja",
    playstyle: "Needles, quick strings, and safe mobility",
    colors: { primary: "#6c79a9", secondary: "#d8d4c7", accent: "#70d5ff" },
    size: { width: 60, height: 89 }, weight: 78, run: 2, dash: 2.1, dashFrames: 8,
    air: 0.95, gravity: 0.12, fall: 2.13, fastFall: 3, jump: 2.7,
    doubleJump: 2.4, jumpSquat: 3, shortHop: 0.65, speed: 1.2,
    specials: {
      "neutral-special": { label: "Needle Storm", damage: 7, chargeable: true, maxChargeFrames: 55, storesCharge: true, projectile: shot("needle", 900, 0, 65, 9) },
      "side-special": { label: "Burst Grenade", damage: 12, multiHit: 4, projectile: shot("bomb", 360, 410, 100, 22, { launchVelocityY: 180 }) },
      "up-special": { label: "Vanish", damage: 13, specialMovement: { kind: "directional-launch", speed: 825 } },
      "down-special": { label: "Bouncing Fish", damage: 12, movement: { x: 570, y: 260 } },
    },
  },
  {
    id: "young-link", displayName: "Young Link", archetype: "Agile Swordsman",
    playstyle: "Fire arrows, bombs, and close-range pressure",
    colors: { primary: "#4aa34d", secondary: "#d9bd75", accent: "#ff7845" },
    size: { width: 58, height: 78 }, weight: 88, run: 1.6, dash: 1.8, dashFrames: 12,
    air: 1, gravity: 0.11, fall: 2.13, fastFall: 3, jump: 2.7,
    doubleJump: 2.3, jumpSquat: 4, shortHop: 0.62, speed: 1.08, reach: 1.02,
    specials: {
      "neutral-special": { label: "Fire Arrow", damage: 8, chargeable: true, maxChargeFrames: 55, projectile: shot("arrow", 720, 70, 105, 12) },
      "side-special": { label: "Boomerang", damage: 8, projectile: shot("boomerang", 520, 0, 165, 18, { returns: true }) },
      "up-special": { label: "Spin Attack", damage: 12, multiHit: 5, specialMovement: { kind: "steered-rise", riseSpeed: 650, horizontalSpeed: 245, steerFrames: 22, staysGroundedWhenStartedGrounded: true } },
      "down-special": { label: "Bomb", damage: 10, projectile: shot("bomb", 250, 780, 145, 22, { bounces: 2, launchVelocityY: 220 }) },
    },
  },
  {
    id: "pichu", displayName: "Pichu", archetype: "Glass Lightning",
    playstyle: "Maximum speed and high-risk electricity",
    colors: { primary: "#f5df55", secondary: "#2d2926", accent: "#f39aaf" },
    size: { width: 45, height: 55 }, weight: 62, run: 1.72, dash: 1.8, dashFrames: 12,
    air: 0.85, gravity: 0.11, fall: 1.9, fastFall: 2.7, jump: 2.7,
    doubleJump: 2.6, jumpSquat: 3, shortHop: 0.67, power: 0.88, speed: 1.18,
    specials: {
      "neutral-special": { label: "Thunder Jolt", damage: 6, selfDamage: 0.7, projectile: shot("thunder-jolt", 450, 450, 125, 15, { bounces: 5 }) },
      "side-special": { label: "Skull Bash", damage: 15, selfDamage: 1.5, movement: { x: 690, y: 70 }, chargeable: true, maxChargeFrames: 45 },
      "up-special": {
        label: "Agility",
        damage: 5,
        selfDamage: 1,
        multiHit: 2,
        specialMovement: { kind: "directional-bursts", frames: [2, 10], speed: 940, rotateWithDirection: true },
      },
      "down-special": {
        label: "Thunder",
        damage: 13,
        selfDamage: 3.5,
        projectile: shot("thunder", 720, 0, 55, 24, {
          vertical: true,
          ownerDischargeRadius: 64,
        }),
      },
    },
  },
  {
    id: "jigglypuff", displayName: "Jigglypuff", archetype: "Master of the Air",
    playstyle: "Five jumps, aerial drift, and a devastating Rest",
    colors: { primary: "#ef9fc2", secondary: "#5d9ec7", accent: "#fff28a" },
    size: { width: 55, height: 55 }, weight: 68, run: 1.1, dash: 1.3, dashFrames: 10,
    air: 1.35, gravity: 0.064, fall: 1.3, fastFall: 1.6, jump: 2.1,
    doubleJump: 2, jumpSquat: 5, shortHop: 0.7, maxJumps: 6, speed: 1.08,
    specials: {
      "neutral-special": { label: "Rollout", damage: 16, specialMovement: { kind: "ground-steered", speed: 700 }, chargeable: true, maxChargeFrames: 65 },
      "side-special": { label: "Pound", damage: 11, movement: { x: 330, y: 160 } },
      "up-special": { label: "Sing", damage: 0, active: 24, radius: 68, statusEffect: "sleep", statusFrames: 90 },
      "down-special": { label: "Rest", damage: 25, startup: 2, active: 2, recovery: 55, radius: 38 },
    },
  },
  {
    id: "mewtwo", displayName: "Mewtwo", archetype: "Ranged Psychic",
    playstyle: "Shadow Ball, teleportation, and mental control",
    colors: { primary: "#ddd9df", secondary: "#8055a5", accent: "#c670ff" },
    size: { width: 65, height: 101 }, weight: 79, run: 1.4, dash: 1.45, dashFrames: 11,
    air: 1.2, gravity: 0.082, fall: 1.5, fastFall: 2.1, jump: 2.5,
    doubleJump: 2.5, jumpSquat: 6, shortHop: 0.65, power: 1.06, reach: 1.12,
    specials: {
      "neutral-special": {
        label: "Shadow Ball",
        damage: 25,
        chargeable: true,
        maxChargeFrames: 100,
        storesCharge: true,
        projectile: shot("shadow-ball", 610, 0, 115, 28, {
          storedChargeScaling: { minimumDamage: 3, minimumRadius: 9 },
        }),
      },
      "side-special": { label: "Confusion", damage: 8, reflectsProjectiles: true, radius: 54 },
      "up-special": { label: "Teleport", damage: 1, specialMovement: { kind: "directional-launch", speed: 865 } },
      "down-special": {
        label: "Disable",
        damage: 6,
        angle: 80,
        radius: 48,
        statusEffect: "stun",
        statusFrames: 70,
        requiresFacingTarget: true,
      },
    },
  },
  {
    id: "mr-game-and-watch", displayName: "Mr. Game & Watch", archetype: "Trickster 2D",
    playstyle: "Unpredictable attacks, Chef, and Oil Panic",
    colors: { primary: "#151515", secondary: "#4e4e4e", accent: "#fff06b" },
    size: { width: 58, height: 78 }, weight: 75, run: 1.5, dashFrames: 10,
    air: 1, gravity: 0.095, fall: 1.7, fastFall: 2.4, jump: 2.5,
    doubleJump: 2.35, jumpSquat: 4, shortHop: 0.65, speed: 1.08,
    specials: {
      "neutral-special": { label: "Chef", damage: 6, recovery: 12, projectile: shot("chef", 360, 480, 105, 16, { launchVelocityY: 250 }) },
      "side-special": { label: "Judge", damage: 18, radius: 50 },
      "up-special": { label: "Fire", damage: 9, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["mr-game-and-watch/up-special"] } },
      "down-special": {
        label: "Oil Panic",
        damage: 0,
        active: 24,
        absorbsProjectiles: true,
        reflectsProjectiles: true,
        radius: 54,
      },
    },
  },
  {
    id: "marth", displayName: "Marth", archetype: "Blade Dancer",
    playstyle: "Spacing, sword tipper, and elegant pressure",
    colors: { primary: "#3155a4", secondary: "#e6d8bb", accent: "#7fd7ff" },
    size: { width: 63, height: 95 }, weight: 87, run: 1.8, dash: 1.9, dashFrames: 9,
    air: 0.9, gravity: 0.085, fall: 2.2, fastFall: 2.9, jump: 2.55,
    doubleJump: 2.25, jumpSquat: 4, shortHop: 0.62, speed: 1.08, reach: 1.25,
    specials: {
      "neutral-special": { label: "Shield Breaker", damage: 17, chargeable: true, maxChargeFrames: 70, radius: 58 },
      "side-special": { label: "Dancing Blade", damage: 13, multiHit: 4, movement: { x: 250, y: 15 }, radius: 58 },
      "up-special": { label: "Dolphin Slash", damage: 11, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["marth/up-special"] }, radius: 54 },
      "down-special": { label: "Counter", damage: 14, startup: 5, active: 12, radius: 56, counters: true },
    },
  },
  {
    id: "roy", displayName: "Roy", archetype: "Blazing Swordsman",
    playstyle: "Close pressure and a blade strongest at the hilt",
    colors: { primary: "#c53c35", secondary: "#496caf", accent: "#ffb24c" },
    size: { width: 65, height: 95 }, weight: 95, run: 1.61, dash: 1.8, dashFrames: 13,
    air: 0.9, gravity: 0.114, fall: 2.4, fastFall: 3.2, jump: 2.5,
    doubleJump: 2.2, jumpSquat: 5, shortHop: 0.62, power: 1.12, speed: 1.02, reach: 1.17,
    specials: {
      "neutral-special": { label: "Flare Blade", damage: 24, chargeable: true, maxChargeFrames: 80, radius: 60 },
      "side-special": { label: "Double-Edge Dance", damage: 15, multiHit: 4, movement: { x: 280, y: 15 }, radius: 60 },
      "up-special": { label: "Blazer", damage: 13, specialMovement: { kind: "authored-root-motion", samples: EXACT_UP_SPECIAL_ROOT_MOTION["roy/up-special"] }, multiHit: 4, radius: 56 },
      "down-special": { label: "Counter", damage: 16, startup: 5, active: 12, radius: 58, counters: true },
    },
  },
];

export const ADDITIONAL_MELEE_ROSTER = Object.fromEntries(
  seeds.map((seed) => [seed.id, createFighter(seed)]),
) as Record<AdditionalFighterId, FighterDefinition>;
