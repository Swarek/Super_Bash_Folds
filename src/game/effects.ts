import type {
  FighterSnapshot,
  GameEvent,
  GameSnapshot,
  ProjectileSnapshot,
} from "./engine";
import {
  FIGHTER_IDS,
  isOpenFighterId,
  type FighterId,
  type PlayerSlot,
} from "./contracts";
import {
  getFighterDefinition,
  type AttackDefinition,
  type MoveName,
  type ProjectileDefinition,
  type Vec2,
} from "./roster";
import { OPEN_FIGHTER_PACKS } from "./generated/openFighterRegistry";
import { UltimateEffectSpriteLibrary } from "./ultimateEffectAssets";

export const MAX_EFFECT_PARTICLES = 384;
export const MAX_TRANSIENT_EFFECTS = 64;
const MAX_PROJECTILE_TRAILS = 24;
const DEFAULT_EFFECT_ASSET_FAMILY: "private" | "open" =
  __PRIVATE_CONTENT_MODE__ ? "private" : "open";

type EffectLayer = "behind" | "front" | "screen";
type ParticleKind =
  | "dust"
  | "smoke"
  | "spark"
  | "streak"
  | "electric"
  | "star"
  | "debris"
  | "ember";
type TransientKind =
  | "ring"
  | "shockwave"
  | "impact"
  | "shield"
  | "grab"
  | "throw"
  | "ledge"
  | "ko-beam"
  | "respawn";

export type AttackEffectMaterial =
  | "physical"
  | "blade"
  | "fire"
  | "electric"
  | "energy"
  | "water"
  | "wind"
  | "heavy";

export type AttackArcShape = "thrust" | "sweep" | "upper" | "lower" | "spin" | "burst";

export interface AttackEffectProfile {
  material: AttackEffectMaterial;
  shape: AttackArcShape;
  color: string;
  coreColor: string;
  width: number;
  reach: number;
}

export type ImpactTier = "light" | "medium" | "heavy";

export interface EffectView {
  worldToScreen(position: Vec2): Vec2;
  zoom: number;
  width: number;
  height: number;
}

export interface EffectFeedback {
  shake: number;
  flash: number;
  flashColor: string;
}

export interface AttackArcGeometry {
  start: number;
  end: number;
  counterclockwise: boolean;
}

interface EffectParticle {
  position: Vec2;
  velocity: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  layer: EffectLayer;
  rotation: number;
  spin: number;
  drag: number;
  gravity: number;
  priority: number;
  assetFamily: "private" | "open";
}

interface TransientEffect {
  kind: TransientKind;
  position: Vec2;
  direction: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  secondary: string;
  layer: EffectLayer;
  priority: number;
  tier: ImpactTier;
  assetFamily: "private" | "open";
}

interface FighterEffectState {
  position: Vec2;
  velocity: Vec2;
  grounded: boolean;
  state: FighterSnapshot["state"];
  facing: -1 | 1;
  runDistance: number;
  trailDistance: number;
}

interface ProjectileEffectState {
  position: Vec2;
  distance: number;
  points: Vec2[];
  kind: ProjectileDefinition["kind"];
  assetFamily: "private" | "open";
}

type FutureEvent = GameEvent & {
  velocity?: Vec2;
  impactSpeed?: number;
  source?: "melee" | "projectile" | "throw" | "item";
  projectileKind?: ProjectileDefinition["kind"];
  entityId?: number;
};

const FIGHTER_ACCENTS = Object.fromEntries(
  FIGHTER_IDS.map((fighter) => [fighter, getFighterDefinition(fighter).colors.accent]),
) as Readonly<Record<FighterId, string>>;

const MATERIAL_COLORS: Readonly<Record<AttackEffectMaterial, string>> = {
  physical: "#fff1bd",
  blade: "#8deaff",
  fire: "#ff713c",
  electric: "#ffe94a",
  energy: "#72f3dc",
  water: "#67dcff",
  wind: "#d9f7ff",
  heavy: "#ffbf57",
};

const PROJECTILE_COLORS: Readonly<Record<ProjectileDefinition["kind"], string>> = {
  fireball: "#ff6f36",
  arrow: "#d8f5ff",
  boomerang: "#80eaff",
  bomb: "#ff9c45",
  "charge-shot": "#61f8dc",
  missile: "#ff8754",
  "thunder-jolt": "#ffe34e",
  thunder: "#a7f2ff",
  capsule: "#ef6d71",
  egg: "#f7f0bd",
  blaster: "#d95cff",
  "pk-fire": "#ff7245",
  "pk-flash": "#c5a7ff",
  "pk-thunder": "#7de9ff",
  "ice-shot": "#b7f7ff",
  needle: "#dbeaff",
  "din-fire": "#ff8b39",
  turnip: "#d8f0a4",
  "shadow-ball": "#b253ff",
  chef: "#ffdf7a",
  phantom: "#c9a8ff",
  "fire-breath": "#ff5a32",
  "ground-wave": "#ffd07a",
};

const PRIVATE_SPECIAL_MATERIALS: Readonly<
  Partial<Record<FighterId, Readonly<Partial<Record<MoveName, AttackEffectMaterial>>>>>
> = {
  mario: {
    "neutral-special": "fire",
    "side-special": "wind",
    "up-special": "fire",
    "down-special": "water",
  },
  link: {
    "neutral-special": "wind",
    "side-special": "wind",
    "up-special": "blade",
    "down-special": "fire",
  },
  samus: {
    "forward-smash": "energy",
    "up-smash": "fire",
    "down-tilt": "fire",
    "neutral-special": "energy",
    "side-special": "fire",
    "up-special": "energy",
    "down-special": "fire",
  },
  pikachu: {
    jab: "electric",
    "forward-smash": "electric",
    "down-smash": "electric",
    "neutral-air": "electric",
    "forward-air": "electric",
    "neutral-special": "electric",
    "side-special": "electric",
    "up-special": "electric",
    "down-special": "electric",
  },
  "donkey-kong": {
    "forward-smash": "heavy",
    "up-smash": "heavy",
    "down-smash": "heavy",
    "neutral-special": "heavy",
    "down-special": "heavy",
  },
  "dr-mario": {
    "neutral-special": "energy",
    "side-special": "wind",
    "up-special": "physical",
    "down-special": "wind",
  },
  luigi: {
    "neutral-special": "fire",
    "side-special": "fire",
    "up-special": "physical",
    "down-special": "wind",
  },
  bowser: {
    "neutral-special": "fire",
    "side-special": "heavy",
    "up-special": "wind",
    "down-special": "heavy",
  },
  peach: {
    "neutral-special": "energy",
    "side-special": "energy",
    "up-special": "wind",
    "down-special": "physical",
  },
  yoshi: {
    "side-special": "wind",
    "up-special": "energy",
    "down-special": "heavy",
  },
  "captain-falcon": {
    "neutral-special": "fire",
    "side-special": "fire",
    "up-special": "fire",
    "down-special": "fire",
  },
  ganondorf: {
    "forward-smash": "blade",
    "up-smash": "blade",
    "down-smash": "blade",
    "neutral-special": "energy",
    "side-special": "energy",
    "up-special": "electric",
    "down-special": "energy",
  },
  falco: {
    "neutral-special": "energy",
    "side-special": "energy",
    "up-special": "fire",
    "down-special": "energy",
  },
  fox: {
    "neutral-special": "energy",
    "side-special": "energy",
    "up-special": "fire",
    "down-special": "energy",
  },
  ness: {
    "forward-smash": "energy",
    "up-smash": "energy",
    "down-smash": "energy",
    "neutral-air": "energy",
    "forward-air": "energy",
    "up-air": "energy",
    "neutral-special": "energy",
    "side-special": "fire",
    "up-special": "electric",
    "down-special": "energy",
  },
  "ice-climbers": {
    "neutral-special": "water",
    "side-special": "wind",
    "up-special": "wind",
    "down-special": "water",
  },
  kirby: {
    "neutral-special": "wind",
    "side-special": "heavy",
    "up-special": "blade",
    "down-special": "heavy",
  },
  zelda: {
    "forward-smash": "energy",
    "up-smash": "energy",
    "down-smash": "energy",
    "neutral-air": "energy",
    "forward-air": "electric",
    "back-air": "electric",
    "up-air": "energy",
    "neutral-special": "energy",
    "side-special": "fire",
    "up-special": "wind",
    "down-special": "energy",
  },
  sheik: {
    "neutral-special": "blade",
    "side-special": "fire",
    "up-special": "energy",
    "down-special": "physical",
  },
  "young-link": {
    "neutral-special": "fire",
    "side-special": "wind",
    "up-special": "blade",
    "down-special": "fire",
  },
  jigglypuff: {
    "neutral-special": "wind",
    "side-special": "physical",
    "up-special": "energy",
    "down-special": "energy",
  },
  mewtwo: {
    "forward-air": "energy",
    "neutral-special": "energy",
    "side-special": "energy",
    "up-special": "energy",
    "down-special": "energy",
  },
  "mr-game-and-watch": {
    "neutral-special": "fire",
    "side-special": "physical",
    "up-special": "wind",
    "down-special": "energy",
  },
  roy: {
    "forward-smash": "fire",
    "neutral-special": "fire",
    "side-special": "fire",
    "up-special": "fire",
    "down-special": "fire",
  },
};

const OPEN_SPECIAL_MATERIALS = Object.fromEntries(
  OPEN_FIGHTER_PACKS.map((pack) => [pack.id, pack.effects.materials]),
) as unknown as Readonly<
  Partial<Record<FighterId, Readonly<Partial<Record<MoveName, AttackEffectMaterial>>>>>
>;

const SPECIAL_MATERIALS: Readonly<
  Partial<Record<FighterId, Readonly<Partial<Record<MoveName, AttackEffectMaterial>>>>>
> = {
  ...PRIVATE_SPECIAL_MATERIALS,
  ...OPEN_SPECIAL_MATERIALS,
};

const LINK_PHYSICAL_MOVES = new Set<MoveName>(["neutral-air", "back-air"]);
const BLADE_FIGHTERS = new Set<FighterId>([
  "link",
  "young-link",
  "marth",
  "roy",
  ...OPEN_FIGHTER_PACKS
    .filter((pack) => (pack.effects.traits as readonly string[]).includes("blade"))
    .map((pack) => pack.id),
]);
const ELECTRIC_FIGHTERS = new Set<FighterId>([
  "pikachu",
  "pichu",
  ...OPEN_FIGHTER_PACKS
    .filter((pack) => (pack.effects.traits as readonly string[]).includes("electric"))
    .map((pack) => pack.id),
]);
const HEAVY_FIGHTERS = new Set<FighterId>([
  "donkey-kong",
  "bowser",
  "ganondorf",
  ...OPEN_FIGHTER_PACKS
    .filter((pack) => (pack.effects.traits as readonly string[]).includes("heavy"))
    .map((pack) => pack.id),
]);

const moveShape = (move: MoveName, attack: AttackDefinition): AttackArcShape => {
  if (attack.projectile) return "burst";
  if (move === "neutral-air" || move === "down-smash" || move === "down-special") return "spin";
  if (move.startsWith("up-")) return "upper";
  if (move.startsWith("down-")) return "lower";
  if (move === "jab" || move === "neutral-special") return "thrust";
  return "sweep";
};

export const resolveAttackEffectProfile = (
  fighter: FighterId,
  move: MoveName,
): AttackEffectProfile => {
  const attack = getFighterDefinition(fighter).attacks[move];
  let material = SPECIAL_MATERIALS[fighter]?.[move];
  if (!material) {
    if (BLADE_FIGHTERS.has(fighter) && !LINK_PHYSICAL_MOVES.has(move)) material = "blade";
    else if (ELECTRIC_FIGHTERS.has(fighter)) material = "electric";
    else if (HEAVY_FIGHTERS.has(fighter)) material = "heavy";
    else if (attack.projectile?.kind === "pk-flash" || attack.projectile?.kind === "pk-thunder" || attack.projectile?.kind === "shadow-ball") material = "energy";
    else if (attack.projectile?.kind === "fireball" || attack.projectile?.kind === "pk-fire" || attack.projectile?.kind === "din-fire" || attack.projectile?.kind === "fire-breath") material = "fire";
    else material = "physical";
  }
  return {
    material,
    shape: moveShape(move, attack),
    color: MATERIAL_COLORS[material],
    coreColor: material === "physical" || material === "wind" ? "#ffffff" : "#fffde8",
    width: material === "heavy" ? 1.35 : material === "blade" ? 0.82 : 1,
    reach: Math.max(attack.radius, Math.hypot(attack.offset.x, attack.offset.y) * 0.72),
  };
};

export const impactTierForDamage = (damage: number): ImpactTier =>
  damage >= 15 ? "heavy" : damage >= 8 ? "medium" : "light";

export const impactStrength = (damage: number): number =>
  Math.max(0.32, Math.min(1.45, 0.26 + Math.max(0, damage) / 16));

/** Small deterministic hash used by tests and by event-driven particle bursts. */
export const seededEffectUnit = (seed: number, index: number): number => {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalize = (value: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 => {
  const length = Math.hypot(value.x, value.y);
  return length > 0.0001 ? { x: value.x / length, y: value.y / length } : fallback;
};

const eventPosition = (event: GameEvent): Vec2 => {
  const position = event.position;
  return position && Number.isFinite(position.x) && Number.isFinite(position.y)
    ? position
    : { x: 0, y: 80 };
};

const fighterFeet = (fighter: FighterSnapshot): Vec2 => ({
  x: fighter.position.x,
  y: fighter.position.y - fighter.size.height / 2 + 2,
});

/** Resolves a ground event from the fighter centre to the feet at event time. */
export const groundEffectOrigin = (event: GameEvent, snapshot: GameSnapshot): Vec2 => {
  const position = eventPosition(event);
  if (event.slot === undefined) return position;
  const fighter = snapshot.fighters[event.slot];
  return {
    x: position.x,
    y: position.y - fighter.size.height / 2 + 2,
  };
};

/**
 * Canvas angles grow clockwise because its Y axis points down. Define the
 * right-facing arc once, then mirror it around the vertical axis for left
 * facing attacks. Mirroring both endpoints is what keeps the short arc short.
 */
export const resolveAttackArcGeometry = (
  shape: AttackArcShape,
  facing: -1 | 1,
  progress: number,
): AttackArcGeometry => {
  let start: number;
  let end: number;
  switch (shape) {
    case "thrust":
      [start, end] = [-0.42, 0.42];
      break;
    case "upper":
      [start, end] = [-2.65 - progress * 0.25, -0.78];
      break;
    case "lower":
      [start, end] = [0.18 - progress * 0.22, 2.25];
      break;
    case "spin":
      [start, end] = [-Math.PI * 0.92, Math.PI * (0.65 + progress * 0.32)];
      break;
    case "burst":
      [start, end] = [0, Math.PI * 2];
      break;
    case "sweep":
      [start, end] = [-1.15, 0.9 + progress * 0.24];
      break;
  }
  if (facing > 0) return { start, end, counterclockwise: false };
  return {
    start: Math.PI - start,
    end: Math.PI - end,
    counterclockwise: true,
  };
};

/** Projects an off-screen KO origin back to the viewport along its launch ray. */
export const projectKoBeamOrigin = (
  position: Vec2,
  direction: Vec2,
  width: number,
  height: number,
  inset = 6,
): Vec2 => {
  const minX = Math.min(inset, width / 2);
  const maxX = Math.max(minX, width - inset);
  const minY = Math.min(inset, height / 2);
  const maxY = Math.max(minY, height - inset);
  if (position.x >= minX && position.x <= maxX && position.y >= minY && position.y <= maxY) {
    return position;
  }

  const ray = normalize(direction);
  const candidates: Array<{ point: Vec2; distance: number }> = [];
  if (Math.abs(ray.x) > 0.0001) {
    for (const x of [minX, maxX]) {
      const distance = (position.x - x) / ray.x;
      const y = position.y - ray.y * distance;
      if (distance >= 0 && y >= minY && y <= maxY) {
        candidates.push({ point: { x, y }, distance });
      }
    }
  }
  if (Math.abs(ray.y) > 0.0001) {
    for (const y of [minY, maxY]) {
      const distance = (position.y - y) / ray.y;
      const x = position.x - ray.x * distance;
      if (distance >= 0 && x >= minX && x <= maxX) {
        candidates.push({ point: { x, y }, distance });
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.point ?? {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  };
};

const projectileColor = (kind: ProjectileDefinition["kind"]): string =>
  PROJECTILE_COLORS[kind];

const inferredProjectileKind = (event: FutureEvent): ProjectileDefinition["kind"] | null => {
  if (event.projectileKind) return event.projectileKind;
  const sound = event.sound ?? "";
  const match = Object.keys(PROJECTILE_COLORS).find((kind) => sound.includes(kind));
  return (match as ProjectileDefinition["kind"] | undefined) ?? null;
};

export class CombatEffects {
  private readonly officialSprites = new UltimateEffectSpriteLibrary();
  private readonly particles: EffectParticle[] = [];
  private readonly transients: TransientEffect[] = [];
  private readonly fighterStates: [FighterEffectState | null, FighterEffectState | null] = [null, null];
  private readonly projectileStates = new Map<number, ProjectileEffectState>();
  private lastSimulationFrame = -1;
  private droppedParticles = 0;
  private droppedTransients = 0;
  private eventSeed = 0x51f15e;
  private activeAssetFamily: "private" | "open" = DEFAULT_EFFECT_ASSET_FAMILY;

  reset(): void {
    this.particles.length = 0;
    this.transients.length = 0;
    this.fighterStates[0] = null;
    this.fighterStates[1] = null;
    this.projectileStates.clear();
    this.lastSimulationFrame = -1;
    this.droppedParticles = 0;
    this.droppedTransients = 0;
    this.eventSeed = 0x51f15e;
    this.activeAssetFamily = DEFAULT_EFFECT_ASSET_FAMILY;
  }

  debugStats(): {
    particles: number;
    transients: number;
    projectileTrails: number;
    droppedParticles: number;
    droppedTransients: number;
    openParticles: number;
    openTransients: number;
    openProjectileTrails: number;
  } {
    return {
      particles: this.particles.length,
      transients: this.transients.length,
      projectileTrails: this.projectileStates.size,
      droppedParticles: this.droppedParticles,
      droppedTransients: this.droppedTransients,
      openParticles: this.particles.filter(({ assetFamily }) => assetFamily === "open").length,
      openTransients: this.transients.filter(({ assetFamily }) => assetFamily === "open").length,
      openProjectileTrails: [...this.projectileStates.values()]
        .filter(({ assetFamily }) => assetFamily === "open").length,
    };
  }

  consume(events: readonly GameEvent[], snapshot: GameSnapshot): EffectFeedback {
    let shake = 0;
    let flash = 0;
    let flashColor = "#ffffff";

    for (const baseEvent of events) {
      const event = baseEvent as FutureEvent;
      const position = eventPosition(event);
      const projectileFamily = event.entityId === undefined
        ? undefined
        : this.projectileStates.get(event.entityId)?.assetFamily;
      this.activeAssetFamily = projectileFamily ??
        (event.slot === undefined
          ? DEFAULT_EFFECT_ASSET_FAMILY
          : this.assetFamilyForFighter(snapshot.fighters[event.slot]));
      this.eventSeed = (Math.imul(event.frame + 1, 0x45d9f3b) ^ ((event.slot ?? 0) << 11)) >>> 0;
      if ((event.type as string) === "projectile-impact") {
        const kind = inferredProjectileKind(event);
        const color = kind ? projectileColor(kind) : "#9defff";
        const damage = Number(event.damage ?? event.value ?? (kind === "bomb" ? 14 : 7));
        const tier = impactTierForDamage(damage);
        this.addTransient("impact", position, normalize(event.velocity ?? { x: 1, y: 0 }), 38 + damage * 1.4, color, "#ffffff", "front", 0.3, 3, tier);
        this.spawnRadial(position, tier === "heavy" ? 18 : 10, color, kind === "thunder" || kind === "thunder-jolt" ? "electric" : "spark", impactStrength(damage) * 0.72, 2);
        shake = Math.max(shake, tier === "heavy" ? 12 : 5);
        continue;
      }
      switch (event.type) {
        case "match-start":
          flash = Math.max(flash, 0.35);
          flashColor = "#fff6b5";
          break;
        case "attack": {
          if (!event.move || event.slot === undefined) break;
          const fighter = snapshot.fighters[event.slot];
          const profile = resolveAttackEffectProfile(fighter.fighter, event.move);
          if (profile.material === "electric" || profile.material === "fire" || profile.material === "energy") {
            this.spawnRadial(position, 5, profile.color, profile.material === "electric" ? "electric" : "ember", 0.32, 1);
          }
          break;
        }
        case "attack-active": {
          if (!event.move || event.slot === undefined) break;
          const fighter = snapshot.fighters[event.slot];
          const attack = getFighterDefinition(fighter.fighter).attacks[event.move];
          const profile = resolveAttackEffectProfile(fighter.fighter, event.move);
          const facing = fighter.facing;
          const direction = profile.shape === "upper"
            ? { x: facing, y: 1 }
            : profile.shape === "lower"
              ? { x: facing, y: -1 }
              : { x: facing, y: 0 };
          const life = clamp(attack.active / 60 + 0.05, 0.1, 0.24);
          if (profile.shape === "spin" || profile.shape === "burst") {
            this.addTransient(
              "ring",
              position,
              direction,
              profile.reach,
              profile.color,
              profile.coreColor,
              "front",
              life,
              2,
              "light",
            );
          } else {
            // A short-lived event arc survives fixed-step catch-up frames where
            // the final fighter snapshot has already left the active window.
            this.addTransient(
              "throw",
              position,
              direction,
              profile.reach,
              profile.color,
              profile.coreColor,
              "front",
              life,
              2,
              "light",
            );
          }
          break;
        }
        case "hit": {
          if (event.sound === "water-push") {
            this.addTransient("ring", position, { x: 1, y: 0 }, 55, "#63ddff", "#e5fbff", "front", 0.38, 3, "medium");
            this.spawnRadial(position, 14, "#b8f4ff", "smoke", 0.6, 2);
            shake = Math.max(shake, 4);
            break;
          }
          const damage = Number(event.damage ?? event.value ?? 8);
          const tier = impactTierForDamage(damage);
          const power = impactStrength(damage);
          const direction = normalize(event.velocity ?? this.targetVelocity(snapshot, event.target));
          const attacker = event.slot === undefined ? undefined : snapshot.fighters[event.slot];
          const color = attacker ? FIGHTER_ACCENTS[attacker.fighter] : "#ffcf64";
          this.addTransient("impact", position, direction, 38 + power * 30, color, "#ffffff", "front", 0.2 + power * 0.08, 4, tier);
          this.spawnDirectional(position, direction, 8 + Math.round(power * 9), tier === "heavy" ? "#ffe071" : "#ffffff", "spark", power, 3);
          this.spawnRadial(position, 3 + Math.round(power * 3), color, "smoke", power * 0.55, 1);
          shake = Math.max(shake, tier === "heavy" ? 22 : tier === "medium" ? 12 : 6);
          flash = Math.max(flash, tier === "heavy" ? 0.44 : tier === "medium" ? 0.25 : 0.12);
          flashColor = tier === "heavy" ? "#fff2b7" : "#ffffff";
          break;
        }
        case "shield-hit": {
          const direction = normalize(event.velocity ?? { x: event.slot === 0 ? 1 : -1, y: 0 });
          this.addTransient("shield", position, direction, 58, "#6ee7ff", "#ffffff", "front", 0.34, 3, "medium");
          this.spawnDirectional(position, direction, 8, "#b7f5ff", "spark", 0.58, 2);
          shake = Math.max(shake, 5);
          break;
        }
        case "clank":
          this.addTransient("shockwave", position, { x: 1, y: 0 }, 48, "#ffffff", "#fff2b7", "front", 0.2, 3, "medium");
          this.spawnRadial(position, 10, "#ffffff", "spark", 0.7, 3);
          shake = Math.max(shake, 4);
          flash = Math.max(flash, 0.12);
          break;
        case "shield-break":
          this.addTransient("shockwave", position, { x: 1, y: 0 }, 92, "#8cecff", "#ffffff", "front", 0.58, 4, "heavy");
          this.spawnRadial(position, 28, "#dff8ff", "star", 1.15, 4);
          shake = Math.max(shake, 23);
          flash = Math.max(flash, 0.52);
          flashColor = "#8cecff";
          break;
        case "jump": {
          const doubleJump = event.sound === "double-jump" || event.sound === "ledge-jump";
          if (doubleJump) {
            this.addTransient("ring", position, { x: 1, y: 0 }, 42, "#d9f4ff", "#ffffff", "behind", 0.3, 2, "light");
            this.spawnRadial(position, 7, "#f2fbff", "star", 0.42, 1);
          } else {
            this.spawnGroundDust(groundEffectOrigin(event, snapshot), 8, 0.56, 1);
          }
          break;
        }
        case "land": {
          const impactSpeed = Number(event.impactSpeed ?? event.value ?? 360);
          const power = clamp(impactSpeed / 720, 0.35, 1.25);
          const groundPosition = groundEffectOrigin(event, snapshot);
          this.spawnGroundDust(groundPosition, 7 + Math.round(power * 7), power, 2);
          if (event.lCancelled) {
            this.addTransient("ring", groundPosition, { x: 1, y: 0 }, 44, "#b9fff0", "#ffffff", "front", 0.22, 3, "light");
            this.spawnRadial(groundPosition, 5, "#eafff9", "star", 0.3, 2);
          }
          if (event.wavedash) {
            const facing = this.slotFacing(snapshot, event.slot);
            this.spawnDirectional(groundPosition, facing, 14, "#d9efff", "streak", 0.72, 2);
            this.addTransient("shockwave", groundPosition, facing, 52, "#d4e9f7", "#ffffff", "behind", 0.25, 2, "light");
          }
          if (power > 0.72) {
            this.addTransient("shockwave", groundPosition, { x: 1, y: 0 }, 38 + power * 30, "#e8edf5", "#ffffff", "behind", 0.32, 2, power > 1 ? "heavy" : "medium");
          }
          shake = Math.max(shake, Math.max(0, power - 0.55) * 5);
          break;
        }
        case "dodge":
          this.spawnDirectional(position, this.slotFacing(snapshot, event.slot, -1), 12, "#9ef1ff", "streak", 0.75, 2);
          break;
        case "grab":
          this.addTransient("grab", position, this.slotFacing(snapshot, event.slot), 45, "#ffe36c", "#ffffff", "front", 0.28, 3, "medium");
          this.spawnRadial(position, 8, "#fff4b0", "spark", 0.42, 2);
          break;
        case "throw": {
          const direction = normalize(event.velocity ?? this.targetVelocity(snapshot, event.target));
          this.addTransient("throw", position, direction, 64, "#fff0a0", "#ffffff", "front", 0.28, 3, "medium");
          this.spawnDirectional(position, direction, 10, "#ffffff", "streak", 0.78, 2);
          shake = Math.max(shake, 6);
          break;
        }
        case "projectile": {
          const kind = inferredProjectileKind(event);
          const color = kind ? projectileColor(kind) : "#93f4ff";
          this.addTransient("ring", position, this.slotFacing(snapshot, event.slot), 34, color, "#ffffff", "behind", 0.22, 2, "light");
          this.spawnDirectional(position, this.slotFacing(snapshot, event.slot), 7, color, kind === "thunder" || kind === "thunder-jolt" ? "electric" : "spark", 0.46, 1);
          break;
        }
        case "item-spawn":
          this.addTransient("ring", position, { x: 1, y: 0 }, 38, "#b7ffcf", "#ffffff", "behind", 0.34, 1, "light");
          break;
        case "item-pickup":
          this.spawnRadial(position, 9, "#b9ffd1", "star", 0.45, 1);
          break;
        case "item-use": {
          const damage = Number(event.value ?? 8);
          const tier = impactTierForDamage(damage);
          this.addTransient("ring", position, { x: 1, y: 0 }, 42 + damage, "#9effc5", "#ffffff", "front", 0.34, 2, tier);
          this.spawnRadial(position, 12, "#9effc5", "spark", 0.7, 2);
          break;
        }
        case "ledge":
          this.addTransient("ledge", position, this.slotFacing(snapshot, event.slot), 35, "#dff4ff", "#ffffff", "front", 0.24, 1, "light");
          this.spawnGroundDust(position, 4, 0.32, 1);
          break;
        case "ko": {
          const direction = normalize(event.velocity ?? this.targetVelocity(snapshot, event.slot), { x: event.slot === 0 ? -1 : 1, y: 0.25 });
          this.addTransient("ko-beam", position, direction, 120, "#ffd95f", "#ffffff", "screen", 0.72, 5, "heavy");
          this.spawnRadial(position, 34, "#ffe16d", "star", 1.35, 4);
          shake = Math.max(shake, 32);
          flash = Math.max(flash, 0.8);
          flashColor = "#ffffff";
          break;
        }
        case "respawn":
          this.addTransient("respawn", position, { x: 0, y: 1 }, 86, "#b9ecff", "#ffffff", "front", 0.8, 4, "medium");
          this.spawnRadial(position, 18, "#ffffff", "star", 0.78, 2);
          break;
        default:
          break;
      }
    }

    this.activeAssetFamily = DEFAULT_EFFECT_ASSET_FAMILY;

    return { shake, flash, flashColor };
  }

  update(snapshot: GameSnapshot, dt: number): void {
    const safeDt = clamp(dt, 0, 1 / 15);
    this.updateParticles(safeDt);
    this.updateTransients(safeDt);
    if (snapshot.frame !== this.lastSimulationFrame) {
      for (const fighter of snapshot.fighters) this.updateFighterMotion(fighter);
      this.updateProjectileMotion(snapshot.projectiles, snapshot.fighters);
      this.activeAssetFamily = DEFAULT_EFFECT_ASSET_FAMILY;
      this.lastSimulationFrame = snapshot.frame;
    }
  }

  drawBehind(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot, view: EffectView): void {
    this.drawProjectileTrails(ctx, view);
    this.drawParticles(ctx, view, "behind");
    this.drawTransients(ctx, view, "behind");
    this.drawAttackArcs(ctx, snapshot, view, false);
  }

  drawFront(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot, view: EffectView): void {
    this.drawAttackArcs(ctx, snapshot, view, true);
    this.drawParticles(ctx, view, "front");
    this.drawTransients(ctx, view, "front");
  }

  drawScreen(ctx: CanvasRenderingContext2D, view: EffectView): void {
    this.drawParticles(ctx, view, "screen");
    this.drawTransients(ctx, view, "screen");
  }

  private targetVelocity(snapshot: GameSnapshot, slot: PlayerSlot | undefined): Vec2 {
    return slot === undefined ? { x: 1, y: 0 } : snapshot.fighters[slot].velocity;
  }

  private assetFamilyForFighter(fighter: FighterSnapshot): "private" | "open" {
    return !__PRIVATE_CONTENT_MODE__ || isOpenFighterId(fighter.fighter)
      ? "open"
      : "private";
  }

  private slotFacing(snapshot: GameSnapshot, slot: PlayerSlot | undefined, multiplier = 1): Vec2 {
    const facing = slot === undefined ? 1 : snapshot.fighters[slot].facing;
    return { x: facing * multiplier, y: 0 };
  }

  private addParticle(particle: Omit<EffectParticle, "assetFamily">): void {
    const sourcedParticle: EffectParticle = {
      ...particle,
      assetFamily: this.activeAssetFamily,
    };
    if (this.particles.length < MAX_EFFECT_PARTICLES) {
      this.particles.push(sourcedParticle);
      return;
    }
    let replacement = -1;
    let lowestPriority = sourcedParticle.priority;
    for (let index = 0; index < this.particles.length; index += 1) {
      const candidate = this.particles[index];
      if (candidate && candidate.priority < lowestPriority) {
        replacement = index;
        lowestPriority = candidate.priority;
      }
    }
    if (replacement >= 0) this.particles[replacement] = sourcedParticle;
    else this.droppedParticles += 1;
  }

  private addTransient(
    kind: TransientKind,
    position: Vec2,
    direction: Vec2,
    size: number,
    color: string,
    secondary: string,
    layer: EffectLayer,
    life: number,
    priority: number,
    tier: ImpactTier,
  ): void {
    const effect: TransientEffect = {
      kind,
      position: { ...position },
      direction: normalize(direction),
      life,
      maxLife: life,
      size,
      color,
      secondary,
      layer,
      priority,
      tier,
      assetFamily: this.activeAssetFamily,
    };
    if (this.transients.length < MAX_TRANSIENT_EFFECTS) {
      this.transients.push(effect);
      return;
    }
    let replacement = -1;
    let lowestPriority = priority;
    for (let index = 0; index < this.transients.length; index += 1) {
      const candidate = this.transients[index];
      if (candidate && candidate.priority < lowestPriority) {
        replacement = index;
        lowestPriority = candidate.priority;
      }
    }
    if (replacement >= 0) this.transients[replacement] = effect;
    else this.droppedTransients += 1;
  }

  private spawnGroundDust(position: Vec2, count: number, power: number, priority: number): void {
    for (let index = 0; index < count; index += 1) {
      const horizontal = seededEffectUnit(this.eventSeed, index * 3) * 2 - 1;
      const upward = 0.25 + seededEffectUnit(this.eventSeed, index * 3 + 1) * 0.75;
      const life = 0.22 + seededEffectUnit(this.eventSeed, index * 3 + 2) * 0.28;
      this.addParticle({
        position: { x: position.x + horizontal * 7, y: position.y + 2 },
        velocity: { x: horizontal * (80 + 170 * power), y: upward * (55 + 100 * power) },
        life,
        maxLife: life,
        size: (6 + seededEffectUnit(this.eventSeed, index + 80) * 10) * power,
        color: index % 3 === 0 ? "#ffffff" : "#d9dce5",
        kind: "dust",
        layer: "behind",
        rotation: 0,
        spin: 0,
        drag: 3.8,
        gravity: -85,
        priority,
      });
    }
  }

  private spawnRadial(
    position: Vec2,
    count: number,
    color: string,
    kind: ParticleKind,
    power: number,
    priority: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + seededEffectUnit(this.eventSeed, index) * 0.5;
      const speed = (90 + seededEffectUnit(this.eventSeed, index + 50) * 330) * power;
      const life = 0.2 + seededEffectUnit(this.eventSeed, index + 100) * 0.42;
      this.addParticle({
        position: { ...position },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life,
        maxLife: life,
        size: (3 + seededEffectUnit(this.eventSeed, index + 150) * 7) * Math.max(0.4, power),
        color,
        kind,
        layer: "front",
        rotation: angle,
        spin: (seededEffectUnit(this.eventSeed, index + 200) - 0.5) * 9,
        drag: kind === "smoke" || kind === "dust" ? 3.2 : 1.8,
        gravity: kind === "star" || kind === "debris" ? -180 : -65,
        priority,
      });
    }
  }

  private spawnDirectional(
    position: Vec2,
    direction: Vec2,
    count: number,
    color: string,
    kind: ParticleKind,
    power: number,
    priority: number,
    layer: EffectLayer = "front",
  ): void {
    const normalized = normalize(direction);
    const baseAngle = Math.atan2(normalized.y, normalized.x);
    for (let index = 0; index < count; index += 1) {
      const spread = (seededEffectUnit(this.eventSeed, index) - 0.5) * 1.15;
      const angle = baseAngle + spread;
      const speed = (160 + seededEffectUnit(this.eventSeed, index + 40) * 430) * power;
      const life = 0.16 + seededEffectUnit(this.eventSeed, index + 80) * 0.28;
      this.addParticle({
        position: { ...position },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life,
        maxLife: life,
        size: (4 + seededEffectUnit(this.eventSeed, index + 120) * 8) * Math.max(0.45, power),
        color,
        kind,
        layer,
        rotation: angle,
        spin: 0,
        drag: 2.25,
        gravity: -40,
        priority,
      });
    }
  }

  private updateFighterMotion(fighter: FighterSnapshot): void {
    this.activeAssetFamily = this.assetFamilyForFighter(fighter);
    const previous = this.fighterStates[fighter.slot];
    const next: FighterEffectState = {
      position: { ...fighter.position },
      velocity: { ...fighter.velocity },
      grounded: fighter.grounded,
      state: fighter.state,
      facing: fighter.facing,
      runDistance: previous?.runDistance ?? 0,
      trailDistance: previous?.trailDistance ?? 0,
    };
    if (!previous) {
      this.fighterStates[fighter.slot] = next;
      return;
    }

    const dx = fighter.position.x - previous.position.x;
    const dy = fighter.position.y - previous.position.y;
    const distance = Math.hypot(dx, dy);
    if (fighter.grounded && (fighter.state === "run" || fighter.state === "dash")) {
      next.runDistance += Math.abs(dx);
      const spacing = fighter.state === "dash" ? 23 : 34;
      while (next.runDistance >= spacing) {
        next.runDistance -= spacing;
        const feet = fighterFeet(fighter);
        const eventOffset = Math.round(next.runDistance * 17);
        this.eventSeed = (Math.imul(this.lastSimulationFrame + 3, 0x45d9f3b) ^ (fighter.slot << 13) ^ eventOffset) >>> 0;
        this.spawnGroundDust({ x: feet.x - fighter.facing * fighter.size.width * 0.22, y: feet.y }, fighter.state === "dash" ? 5 : 3, fighter.state === "dash" ? 0.52 : 0.36, 0);
      }
    } else {
      next.runDistance = 0;
    }

    const turned = fighter.state === "turn" && previous.state !== "turn";
    const reversed = fighter.facing !== previous.facing && Math.abs(previous.velocity.x) > 80;
    if (fighter.grounded && (turned || reversed)) {
      this.eventSeed = (Math.imul(this.lastSimulationFrame + 7, 0x27d4eb2d) ^ (fighter.slot << 15)) >>> 0;
      const feet = fighterFeet(fighter);
      this.spawnGroundDust({ x: feet.x + previous.facing * fighter.size.width * 0.28, y: feet.y }, 11, 0.78, 1);
      this.spawnDirectional(feet, { x: previous.facing, y: 0.15 }, 5, "#e9ebef", "debris", 0.46, 1);
    }

    const hitstunTrail = fighter.hitstunFrames > 0 && Math.hypot(fighter.velocity.x, fighter.velocity.y) > 260;
    const fastFallTrail = fighter.fastFalling && !fighter.grounded;
    if ((hitstunTrail || fastFallTrail) && distance > 0) {
      next.trailDistance += distance;
      const spacing = hitstunTrail ? 30 : 38;
      while (next.trailDistance >= spacing) {
        next.trailDistance -= spacing;
        const direction = normalize({ x: -fighter.velocity.x, y: -fighter.velocity.y });
        this.eventSeed = (Math.imul(this.lastSimulationFrame + 11, 0x165667b1) ^ (fighter.slot << 9)) >>> 0;
        this.spawnDirectional(fighter.position, direction, hitstunTrail ? 3 : 2, hitstunTrail ? "#f7d6d2" : "#ddecff", hitstunTrail ? "smoke" : "streak", hitstunTrail ? 0.34 : 0.44, 1);
      }
    } else {
      next.trailDistance = 0;
    }

    this.fighterStates[fighter.slot] = next;
  }

  private updateProjectileMotion(
    projectiles: readonly ProjectileSnapshot[],
    fighters: GameSnapshot["fighters"],
  ): void {
    const active = new Set<number>();
    for (const projectile of projectiles) {
      const assetFamily = this.assetFamilyForFighter(fighters[projectile.owner]);
      this.activeAssetFamily = assetFamily;
      active.add(projectile.id);
      const previous = this.projectileStates.get(projectile.id);
      if (!previous) {
        this.projectileStates.set(projectile.id, {
          position: { ...projectile.position },
          distance: 0,
          points: [{ ...projectile.position }],
          kind: projectile.kind,
          assetFamily,
        });
        continue;
      }
      previous.assetFamily = assetFamily;
      const distance = Math.hypot(
        projectile.position.x - previous.position.x,
        projectile.position.y - previous.position.y,
      );
      previous.distance += distance;
      previous.position = { ...projectile.position };
      if (distance > 0.5) {
        previous.points.push({ ...projectile.position });
        if (previous.points.length > MAX_PROJECTILE_TRAILS) previous.points.shift();
      }
      const spacing = projectile.kind === "missile" || projectile.kind === "fireball" ? 24 : 36;
      while (previous.distance >= spacing) {
        previous.distance -= spacing;
        this.eventSeed = (Math.imul(this.lastSimulationFrame + projectile.id, 0x27d4eb2d)) >>> 0;
        const kind: ParticleKind = projectile.kind === "thunder" || projectile.kind === "thunder-jolt"
          ? "electric"
          : projectile.kind === "fireball" || projectile.kind === "missile" || projectile.kind === "bomb"
            ? "ember"
            : "streak";
        const direction = normalize({ x: -projectile.velocity.x, y: -projectile.velocity.y });
        this.spawnDirectional(projectile.position, direction, 1, projectileColor(projectile.kind), kind, 0.42, 0, "behind");
      }
    }
    for (const id of this.projectileStates.keys()) {
      if (!active.has(id)) this.projectileStates.delete(id);
    }
  }

  private updateParticles(dt: number): void {
    let write = 0;
    for (let read = 0; read < this.particles.length; read += 1) {
      const particle = this.particles[read];
      if (!particle) continue;
      particle.life -= dt;
      if (particle.life <= 0) continue;
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      const damping = Math.exp(-particle.drag * dt);
      particle.velocity.x *= damping;
      particle.velocity.y = particle.velocity.y * damping + particle.gravity * dt;
      particle.rotation += particle.spin * dt;
      this.particles[write] = particle;
      write += 1;
    }
    this.particles.length = write;
  }

  private updateTransients(dt: number): void {
    let write = 0;
    for (let read = 0; read < this.transients.length; read += 1) {
      const effect = this.transients[read];
      if (!effect) continue;
      effect.life -= dt;
      if (effect.life <= 0) continue;
      this.transients[write] = effect;
      write += 1;
    }
    this.transients.length = write;
  }

  private drawProjectileTrails(ctx: CanvasRenderingContext2D, view: EffectView): void {
    for (const state of this.projectileStates.values()) {
      if (state.points.length < 2) continue;
      for (let index = 1; index < state.points.length; index += 2) {
        const point = state.points[index];
        const previous = state.points[index - 1];
        if (!point || !previous) continue;
        const screen = view.worldToScreen(point);
        const rotation = Math.atan2(-(point.y - previous.y), point.x - previous.x);
        const electric = state.kind === "thunder" || state.kind === "thunder-jolt";
        const width = (state.kind === "charge-shot" ? 34 : 22) * view.zoom;
        const height = (state.kind === "charge-shot" ? 18 : 10) * view.zoom;
        if (state.assetFamily === "open") {
          ctx.save();
          ctx.translate(screen.x, screen.y);
          ctx.rotate(rotation);
          ctx.globalAlpha = 0.48;
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = projectileColor(state.kind);
          ctx.lineWidth = Math.max(2, height * 0.34);
          ctx.beginPath();
          ctx.moveTo(-width / 2, 0);
          ctx.lineTo(width / 2, 0);
          ctx.stroke();
          ctx.restore();
        } else {
          this.officialSprites.drawParticle(ctx, electric ? "electric" : "streak", {
            x: screen.x,
            y: screen.y,
            width,
            height,
            rotation,
            alpha: 0.48,
          });
        }
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, view: EffectView, layer: EffectLayer): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const additive of [false, true]) {
      ctx.globalCompositeOperation = "source-over";
      for (const particle of this.particles) {
        if (particle.layer !== layer) continue;
        const isAdditive = particle.kind !== "dust" && particle.kind !== "smoke" && particle.kind !== "debris";
        if (isAdditive !== additive) continue;
        const screen = layer === "screen" ? particle.position : view.worldToScreen(particle.position);
        if (screen.x < -120 || screen.x > view.width + 120 || screen.y < -120 || screen.y > view.height + 120) continue;
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        const size = particle.size * (layer === "screen" ? 1 : view.zoom) * (0.62 + alpha * 0.38);
        if (particle.assetFamily === "open") {
          this.drawOpenParticle(ctx, particle, screen, size, alpha);
          continue;
        }
        this.officialSprites.drawParticle(ctx, particle.kind, {
          x: screen.x,
          y: screen.y,
          width: size * (particle.kind === "streak" ? 4.2 : 2.8),
          height: size * (particle.kind === "streak" ? 1.35 : 2.8),
          rotation: -particle.rotation,
          alpha: alpha * (particle.kind === "dust" || particle.kind === "smoke" ? 0.62 : 0.92),
        });
      }
    }
    ctx.restore();
  }

  private drawTransients(ctx: CanvasRenderingContext2D, view: EffectView, layer: EffectLayer): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const effect of this.transients) {
      if (effect.layer !== layer) continue;
      const progress = 1 - effect.life / effect.maxLife;
      const alpha = Math.sin(Math.PI * clamp(progress, 0, 1));
      const screen = view.worldToScreen(effect.position);
      const size = effect.size * (layer === "screen" ? 1 : view.zoom);
      if (effect.assetFamily === "open") {
        this.drawOpenTransient(ctx, effect, screen, size, alpha);
        continue;
      }
      this.officialSprites.drawTransient(ctx, effect.kind, effect.tier, {
        x: screen.x,
        y: screen.y,
        width: size * (1.25 + progress * 0.55),
        height: effect.kind === "shockwave" ? size * 0.52 : size * (1.25 + progress * 0.55),
        rotation: Math.atan2(-effect.direction.y, effect.direction.x),
        alpha,
      });
    }
    ctx.restore();
  }

  private drawOpenParticle(
    ctx: CanvasRenderingContext2D,
    particle: EffectParticle,
    screen: Vec2,
    size: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(-particle.rotation);
    ctx.globalAlpha = alpha *
      (particle.kind === "dust" || particle.kind === "smoke" ? 0.58 : 0.9);
    ctx.globalCompositeOperation =
      particle.kind === "dust" || particle.kind === "smoke" || particle.kind === "debris"
        ? "source-over"
        : "lighter";
    ctx.fillStyle = particle.color;
    ctx.strokeStyle = particle.color;
    ctx.lineCap = "round";
    if (particle.kind === "streak" || particle.kind === "electric") {
      ctx.lineWidth = Math.max(1.5, size * (particle.kind === "electric" ? 0.34 : 0.48));
      ctx.beginPath();
      ctx.moveTo(-size * 2, particle.kind === "electric" ? -size * 0.25 : 0);
      if (particle.kind === "electric") {
        ctx.lineTo(-size * 0.45, size * 0.3);
        ctx.lineTo(size * 0.35, -size * 0.28);
      }
      ctx.lineTo(size * 2, 0);
      ctx.stroke();
    } else if (particle.kind === "star" || particle.kind === "spark") {
      ctx.lineWidth = Math.max(1.3, size * 0.28);
      ctx.beginPath();
      ctx.moveTo(-size, 0);
      ctx.lineTo(size, 0);
      ctx.moveTo(0, -size);
      ctx.lineTo(0, size);
      if (particle.kind === "star") {
        ctx.moveTo(-size * 0.7, -size * 0.7);
        ctx.lineTo(size * 0.7, size * 0.7);
        ctx.moveTo(size * 0.7, -size * 0.7);
        ctx.lineTo(-size * 0.7, size * 0.7);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.25, size * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawOpenTransient(
    ctx: CanvasRenderingContext2D,
    effect: TransientEffect,
    screen: Vec2,
    size: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(Math.atan2(-effect.direction.y, effect.direction.x));
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(3, size * (effect.tier === "heavy" ? 0.1 : 0.065));
    if (effect.kind === "ko-beam" || effect.kind === "respawn") {
      ctx.beginPath();
      ctx.moveTo(-size * 1.35, 0);
      ctx.lineTo(size * 1.35, 0);
      ctx.stroke();
    } else if (effect.kind === "impact" || effect.kind === "grab" || effect.kind === "throw") {
      for (let ray = 0; ray < 6; ray += 1) {
        const angle = ray / 6 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * size * 0.2, Math.sin(angle) * size * 0.2);
        ctx.lineTo(Math.cos(angle) * size * 0.72, Math.sin(angle) * size * 0.72);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        size * 0.72,
        size * (effect.kind === "shockwave" ? 0.28 : 0.62),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.strokeStyle = effect.secondary;
    ctx.lineWidth = Math.max(1.5, ctx.lineWidth * 0.32);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawAttackArcs(
    ctx: CanvasRenderingContext2D,
    snapshot: GameSnapshot,
    view: EffectView,
    front: boolean,
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    for (const fighter of snapshot.fighters) {
      const moveName = fighter.currentMove;
      if (!moveName) continue;
      const attack = getFighterDefinition(fighter.fighter).attacks[moveName];
      const first = Math.max(1, attack.startup);
      const last = first + Math.max(1, attack.active) - 1;
      const active = fighter.moveFrame >= first - 1 && fighter.moveFrame <= last;
      if (!active && fighter.charge <= 0.01) continue;
      const profile = resolveAttackEffectProfile(fighter.fighter, moveName);
      const shouldDrawFront = profile.material !== "heavy" && profile.shape !== "spin";
      if (front !== shouldDrawFront) continue;
      const progress = fighter.charge > 0.01
        ? 0.5 + Math.sin(fighter.charge * Math.PI * 8) * 0.08
        : clamp((fighter.moveFrame - first + 1) / Math.max(1, attack.active), 0, 1);
      const origin = view.worldToScreen(fighter.position);
      const radius = Math.max(24, profile.reach) * view.zoom * (0.82 + fighter.charge * 0.25);
      const offsetX = attack.offset.x * fighter.facing * view.zoom * 0.34;
      const offsetY = -attack.offset.y * view.zoom * 0.34;
      const centerX = origin.x + offsetX;
      const centerY = origin.y + offsetY;
      const alpha = fighter.charge > 0.01 ? 0.32 + fighter.charge * 0.35 : Math.sin(Math.PI * clamp(progress, 0.02, 0.98));
      const effectFacing = moveName === "back-air" ? (fighter.facing === 1 ? -1 : 1) : fighter.facing;
      const shapeRotation = profile.shape === "upper"
        ? -0.72
        : profile.shape === "lower"
          ? 0.72
          : profile.shape === "thrust"
            ? 0
            : progress * 0.55 - 0.28;
      const drewPrivateEffect = this.officialSprites.drawAttack(ctx, fighter.fighter, moveName, profile.material, {
        x: centerX,
        y: centerY,
        width: radius * (profile.shape === "thrust" ? 2.2 : 2.65),
        height: radius * (profile.shape === "burst" || profile.shape === "spin" ? 2.15 : 1.35),
        rotation: shapeRotation * effectFacing,
        flipX: effectFacing < 0,
        alpha,
      });
      if (!drewPrivateEffect && isOpenFighterId(fighter.fighter)) {
        const geometry = resolveAttackArcGeometry(profile.shape, effectFacing, progress);
        const horizontalRadius = radius * (profile.shape === "thrust" ? 1.08 : 1.28);
        const verticalRadius = radius *
          (profile.shape === "burst" || profile.shape === "spin" ? 1.02 : 0.68);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        ctx.strokeStyle = profile.color;
        ctx.lineWidth = Math.max(5, 11 * profile.width * view.zoom);
        ctx.beginPath();
        ctx.ellipse(
          centerX,
          centerY,
          horizontalRadius,
          verticalRadius,
          0,
          geometry.start,
          geometry.end,
          geometry.counterclockwise,
        );
        ctx.stroke();
        ctx.strokeStyle = profile.coreColor;
        ctx.lineWidth = Math.max(2, 3.5 * profile.width * view.zoom);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

}
