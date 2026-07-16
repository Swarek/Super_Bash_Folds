import {
  isMeleeFighterId,
  type FighterId,
  type Open2DFighterId,
  type OpenFighterId,
  type SkinId,
} from "./contracts";
import { effectiveJumpSquatFrames, type FighterSnapshot } from "./engine";
import {
  EXACT_ANIMATION_CELL_SIZE,
  EXACT_ANIMATION_COLUMNS,
  EXACT_ANIMATION_METADATA,
} from "./exactAnimationMetadata";
import {
  EXACT_SPECIAL_ANIMATION_SEGMENTS,
  type ExactSpecialAnimationSegment,
} from "./exactSpecialAnimationMetadata";
import {
  CHARACTER_PORTRAITS,
  FIGHTER_VISUAL_MANIFESTS,
  isFighterProductionReady,
  isFighterVisualReady,
  type FighterVisualManifest,
} from "./fighterVisuals";
import { OPEN_ANIMATION_METADATA } from "./openAnimationMetadata";
import { FIGHTER_IDS, getFighterDefinition, type MoveName } from "./roster";

const BROWSER_ANIMATION_CELL_SIZE = EXACT_ANIMATION_CELL_SIZE;
const ALL_SKIN_IDS = ["00", "01", "02", "03"] as const satisfies readonly SkinId[];
export const MELEE_RUN_PLAYBACK_MULTIPLIER = 2;
export const ICE_CLIMBERS_COMPANION_ASSET_ID = "ice-climbers-nana";

export type CharacterAnimation =
  | "idle"
  | "run"
  | "jump"
  | "fall"
  | "attack"
  | "special"
  | "hurt"
  | "dodge"
  | "grab"
  | "victory";

export interface CharacterRenderProfile {
  crop?: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
  x: number;
  y: number;
}

interface AnimationDefinition {
  frames: readonly string[];
  fps: number;
  loop?: boolean;
}

type FighterAnimationSet = Record<CharacterAnimation, AnimationDefinition>;

export const REMOTE_ANIMATION_SLOTS = [
  "idle",
  "crouch",
  "walk",
  "turn",
  "dash",
  "run",
  "jump_squat",
  "jump",
  "double_jump",
  "fall",
  "fast_fall",
  "jab",
  "dash_attack",
  "forward_tilt",
  "up_tilt",
  "down_tilt",
  "forward_smash",
  "up_smash",
  "down_smash",
  "neutral_air",
  "forward_air",
  "back_air",
  "up_air",
  "down_air",
  "neutral_special",
  "side_special",
  "up_special",
  "down_special",
  "spot_dodge",
  "roll_forward",
  "roll_back",
  "air_dodge",
  "shield",
  "item_hold",
  "item_pickup",
  "item_attack",
  "grab",
  "grab_hold",
  "grabbed",
  "forward_throw",
  "back_throw",
  "up_throw",
  "down_throw",
  "hurt",
  "knockback",
  "downed",
  "ledge",
  "entrance",
  "taunt",
  "victory",
] as const;

export type RemoteAnimationSlot = (typeof REMOTE_ANIMATION_SLOTS)[number];

interface OpenAnimationMetadataEntry {
  frameCount: number;
  fps: number;
  columns: number;
  cellSize: number;
  sourceAction?: string;
  coverage?: "direct" | "adapted" | "author_required";
  productionReady?: boolean;
}

interface Open2DRuntimeContent {
  metadata: {
    version: number;
    cellSize: number;
    columns: number;
    fighters: Readonly<
      Record<
        Open2DFighterId,
        Readonly<Record<RemoteAnimationSlot, OpenAnimationMetadataEntry>>
      >
    >;
  };
}

const OPEN_2D_RUNTIME_CONTENT = __OPEN_2D_RUNTIME_CONTENT__ as Open2DRuntimeContent;
const PRIVATE_ANIMATION_AVAILABILITY = __PRIVATE_ANIMATION_AVAILABILITY__ as Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
>;

export interface RemoteAnimationDefinition {
  /** Static frame atlas rendered locally from the source asset. */
  mediaUrl: string;
  /** Human-facing project page used for provenance and manual license review. */
  sourcePage: string;
  label: string;
  /** Kept explicit so clean renders cannot silently regress to hitbox media. */
  containsHitboxOverlay: boolean;
  frameCount: number;
  fps: number;
  columns: number;
  cellSize: number;
  /** Direction the authored source art faces before the world-facing transform. */
  sourceFacing: "left" | "right";
  /** Plays authored frames backwards when the engine already applied the end-facing. */
  reversePlayback?: boolean;
}

export interface RemoteAnimationConfig {
  /** Must remain explicit: false disables the exact local render layer. */
  enabled: boolean;
  attribution: { label: string; url: string };
  fighters: Readonly<
    Record<
      FighterId,
      Readonly<Partial<
        Record<
          SkinId,
          Readonly<Record<RemoteAnimationSlot, RemoteAnimationDefinition>>
        >
      >>
    >
  >;
}

export interface FighterSkinSelection {
  fighter: FighterId;
  skin: SkinId;
}

type SpecialPhaseSegments = Readonly<
  Record<"startup" | "active" | "recovery" | "landing", readonly [number, number]>
>;

/** Clip indices inside the official concatenated Up-B atlases. */
const UP_SPECIAL_PHASE_SEGMENTS: Partial<Record<FighterId, SpecialPhaseSegments>> = {
  peach: { startup: [0, 0], active: [1, 1], recovery: [2, 2], landing: [3, 3] },
  "captain-falcon": { startup: [0, 0], active: [0, 0], recovery: [0, 0], landing: [0, 0] },
  ganondorf: { startup: [0, 0], active: [0, 0], recovery: [0, 0], landing: [0, 0] },
  falco: { startup: [0, 0], active: [1, 1], recovery: [2, 2], landing: [3, 3] },
  fox: { startup: [0, 0], active: [1, 1], recovery: [2, 2], landing: [3, 3] },
  ness: { startup: [0, 0], active: [1, 1], recovery: [2, 2], landing: [2, 2] },
  "ice-climbers": { startup: [0, 0], active: [1, 1], recovery: [2, 2], landing: [2, 2] },
  kirby: { startup: [0, 0], active: [1, 2], recovery: [3, 3], landing: [3, 3] },
  zelda: { startup: [0, 0], active: [1, 1], recovery: [1, 1], landing: [1, 1] },
  sheik: { startup: [0, 0], active: [1, 1], recovery: [1, 1], landing: [1, 1] },
  link: { startup: [0, 1], active: [2, 2], recovery: [2, 2], landing: [2, 2] },
  "young-link": { startup: [0, 1], active: [2, 2], recovery: [2, 2], landing: [2, 2] },
  pichu: { startup: [0, 0], active: [1, 1], recovery: [2, 2], landing: [2, 2] },
  pikachu: { startup: [0, 0], active: [1, 1], recovery: [2, 2], landing: [2, 2] },
  mewtwo: { startup: [0, 0], active: [1, 1], recovery: [1, 1], landing: [1, 1] },
  "mr-game-and-watch": { startup: [0, 0], active: [1, 1], recovery: [2, 2], landing: [2, 2] },
};

const SPECIAL_SEGMENTS = EXACT_SPECIAL_ANIMATION_SEGMENTS as Readonly<
  Record<string, readonly ExactSpecialAnimationSegment[]>
>;

const ANIMATION_LABELS: Readonly<Record<RemoteAnimationSlot, string>> = {
  idle: "Idle",
  crouch: "Crouch",
  walk: "Walk",
  turn: "Turn",
  dash: "Dash start",
  run: "Run",
  jump_squat: "Jump squat",
  jump: "Jump",
  double_jump: "Double jump",
  fall: "Fall",
  fast_fall: "Fast fall",
  jab: "Neutral attack",
  dash_attack: "Dash attack",
  forward_tilt: "Forward tilt",
  up_tilt: "Up tilt",
  down_tilt: "Down tilt",
  forward_smash: "Forward smash",
  up_smash: "Up smash",
  down_smash: "Down smash",
  neutral_air: "Neutral aerial",
  forward_air: "Forward aerial",
  back_air: "Back aerial",
  up_air: "Up aerial",
  down_air: "Down aerial",
  neutral_special: "Neutral special",
  side_special: "Side special",
  up_special: "Up special",
  down_special: "Down special",
  spot_dodge: "Spot dodge",
  roll_forward: "Forward roll",
  roll_back: "Back roll",
  air_dodge: "Air dodge",
  shield: "Shield",
  item_hold: "Held item",
  item_pickup: "Item pickup",
  item_attack: "Item attack",
  grab: "Grab",
  grab_hold: "Holding grab",
  grabbed: "Grabbed",
  forward_throw: "Forward throw",
  back_throw: "Back throw",
  up_throw: "Up throw",
  down_throw: "Down throw",
  hurt: "Hurt",
  knockback: "Knockback",
  downed: "Downed",
  ledge: "Ledge hang",
  entrance: "Entrance",
  taunt: "Taunt",
  victory: "Victory",
};

const OPEN_3D_METADATA = OPEN_ANIMATION_METADATA as unknown as Readonly<
  Partial<Record<OpenFighterId, Readonly<Partial<Record<RemoteAnimationSlot, OpenAnimationMetadataEntry>>>>>
>;

const OPEN_METADATA = {
  ...OPEN_3D_METADATA,
  ...OPEN_2D_RUNTIME_CONTENT.metadata.fighters,
} as Readonly<
  Partial<Record<OpenFighterId, Readonly<Partial<Record<RemoteAnimationSlot, OpenAnimationMetadataEntry>>>>>
>;

export const CHARACTER_ATLAS_REVISION = "clean-animation-4";

export {
  CHARACTER_PORTRAITS,
  FIGHTER_VISUAL_MANIFESTS,
  isFighterProductionReady,
  isFighterVisualReady,
  type FighterVisualManifest,
};

const exactAnimation = (
  fighter: FighterId,
  skin: SkinId,
  slot: RemoteAnimationSlot,
  containsHitboxOverlay = false,
  assetFighter: string = fighter,
): RemoteAnimationDefinition => {
  const manifest = FIGHTER_VISUAL_MANIFESTS[fighter];
  const openMetadata = isMeleeFighterId(fighter) ? undefined : OPEN_METADATA[fighter]?.[slot];
  const exactMetadata = isMeleeFighterId(fighter)
    ? EXACT_ANIMATION_METADATA[`${fighter}/${slot}`]
    : undefined;
  const frameCount = openMetadata?.frameCount ?? exactMetadata?.frameCount ??
    (manifest.sourceKind === "private-3d" ? 1 : 4);
  const fps = openMetadata?.fps ?? exactMetadata?.fps ??
    (manifest.sourceKind === "private-3d" ? 1 : 8);
  const atlasRoot = assetFighter === fighter
    ? manifest.atlasRoot
    : `/assets/characters/ultimate-sheets-native/${assetFighter}`;
  const version = `?v=${CHARACTER_ATLAS_REVISION}`;
  const resolvedSkin = manifest.sourceKind === "private-3d" &&
      !PRIVATE_ANIMATION_AVAILABILITY[assetFighter]?.[skin]?.includes(slot)
    ? "00"
    : skin;
  return {
    mediaUrl: `${atlasRoot}/${resolvedSkin}/${slot}.webp${version}`,
    sourcePage: manifest.sourcePage,
    label: ANIMATION_LABELS[slot],
    containsHitboxOverlay,
    frameCount,
    fps,
    columns: openMetadata?.columns ?? EXACT_ANIMATION_COLUMNS,
    cellSize: openMetadata?.cellSize ?? BROWSER_ANIMATION_CELL_SIZE,
    sourceFacing: manifest.sourceFacing,
    // Mario's authored turn clip goes from the old facing to the new facing,
    // while the engine switches facing as soon as turn starts. Reading this
    // one clip backwards keeps every displayed frame on the engine's basis.
    reversePlayback: fighter === "mario" && slot === "turn",
  };
};

const animationSet = (
  fighter: FighterId,
  skin: SkinId,
  assetFighter: string = fighter,
): Record<RemoteAnimationSlot, RemoteAnimationDefinition> =>
  Object.fromEntries(
    REMOTE_ANIMATION_SLOTS.map((slot) => [
      slot,
      exactAnimation(fighter, skin, slot, false, assetFighter),
    ]),
  ) as Record<RemoteAnimationSlot, RemoteAnimationDefinition>;

const skinAnimationSets = (
  fighter: FighterId,
  assetFighter: string = fighter,
): Partial<Record<SkinId, Record<RemoteAnimationSlot, RemoteAnimationDefinition>>> =>
  Object.fromEntries(
    FIGHTER_VISUAL_MANIFESTS[fighter].availableSkins.map((skin) => [
      skin,
      animationSet(fighter, skin, assetFighter),
    ]),
  ) as Partial<Record<SkinId, Record<RemoteAnimationSlot, RemoteAnimationDefinition>>>;

const ICE_CLIMBERS_COMPANION_ANIMATIONS = skinAnimationSets(
  "ice-climbers",
  ICE_CLIMBERS_COMPANION_ASSET_ID,
) as Record<SkinId, Record<RemoteAnimationSlot, RemoteAnimationDefinition>>;

/** Local browser atlases for private Melee content and distributable open fighters. */
export const REMOTE_ANIMATION_CONFIG: RemoteAnimationConfig = {
  enabled: true,
  attribution: {
    label: "Local SSBU files supplied by the user",
    url: "https://gitlab.com/Worldblender/smash-ultimate-models-exported",
  },
  fighters: Object.fromEntries(
    FIGHTER_IDS.map((fighter) => [fighter, skinAnimationSets(fighter)]),
  ) as Record<
    FighterId,
    Partial<Record<SkinId, Record<RemoteAnimationSlot, RemoteAnimationDefinition>>>
  >,
};

export interface ResolvedRemoteAnimationSet {
  skin: SkinId;
  animations: Readonly<Record<RemoteAnimationSlot, RemoteAnimationDefinition>>;
}

/** Resolve a requested skin without assuming that every fighter owns four variants. */
export function remoteAnimationSetForFighter(
  fighter: FighterId,
  requestedSkin: SkinId,
  config: RemoteAnimationConfig = REMOTE_ANIMATION_CONFIG,
): ResolvedRemoteAnimationSet {
  const skins = config.fighters[fighter];
  const requested = skins[requestedSkin];
  if (requested) return { skin: requestedSkin, animations: requested };
  for (const skin of ALL_SKIN_IDS) {
    const animations = skins[skin];
    if (animations) return { skin, animations };
  }
  throw new Error(`No atlas declared for ${fighter}.`);
}

export interface CharacterSpriteLibraryOptions {
  remoteAnimation?: RemoteAnimationConfig;
}

export interface CharacterPreloadProgress {
  completed: number;
  total: number;
}

export interface CharacterPreloadOptions {
  signal?: AbortSignal;
  concurrency?: number;
  onProgress?: (progress: CharacterPreloadProgress) => void;
}

export interface ResolvedCharacterFrame {
  image: HTMLImageElement;
  source: "local" | "remote";
  attributionUrl?: string;
  sourceRect?: { x: number; y: number; width: number; height: number };
  sourceFacing?: "left" | "right";
}

interface ActiveExactAnimation {
  key: string;
  image: HTMLImageElement;
  startedAt: number;
  lastElapsed: number;
  frameCursor: number;
}

const asset = (fighter: FighterId, file: string): string =>
  `/assets/characters/${fighter}/${file}`;

const sequence = (
  fighter: FighterId,
  prefix: string,
  ids: readonly (number | string)[],
): string[] => ids.map((id) => asset(fighter, `${prefix}-${id}.png`));

const humanoidAnimations = (fighter: FighterId): FighterAnimationSet => ({
  idle: { frames: sequence(fighter, "idle", [0, 1]), fps: 2.4, loop: true },
  run: { frames: sequence(fighter, "run", [0, 1, 2, 1]), fps: 9, loop: true },
  jump: { frames: [asset(fighter, "jump.png")], fps: 1 },
  fall: { frames: [asset(fighter, "fall.png")], fps: 1 },
  attack: { frames: sequence(fighter, "attack", [0, 1, 2]), fps: 12 },
  special: { frames: sequence(fighter, "attack", [1, 0, 2]), fps: 10 },
  hurt: { frames: [asset(fighter, "hurt.png")], fps: 1 },
  dodge: { frames: [asset(fighter, "dodge.png")], fps: 1 },
  grab: { frames: sequence(fighter, "grab", [0, 1]), fps: 8 },
  victory: { frames: sequence(fighter, "victory", [0, 1]), fps: 4, loop: true },
});

const LEGACY_CHARACTER_ANIMATIONS: Readonly<Partial<Record<FighterId, FighterAnimationSet>>> = {
  mario: humanoidAnimations("mario"),
  link: humanoidAnimations("link"),
  samus: humanoidAnimations("samus"),
  pikachu: {
    idle: { frames: sequence("pikachu", "idle", ["000", "002", "004", "006"]), fps: 5, loop: true },
    run: { frames: sequence("pikachu", "run", ["000", "001", "002", "003", "004", "005", "006", "007"]), fps: 14, loop: true },
    jump: { frames: [asset("pikachu", "jump.png")], fps: 1 },
    fall: { frames: [asset("pikachu", "fall.png")], fps: 1 },
    attack: { frames: sequence("pikachu", "attack", ["001", "003", "005", "007"]), fps: 15 },
    special: { frames: sequence("pikachu", "special", ["001", "003", "005", "007"]), fps: 15 },
    hurt: { frames: sequence("pikachu", "hurt", ["000", "002", "003", "005"]), fps: 11 },
    dodge: { frames: sequence("pikachu", "dodge", ["000", "002", "004", "006", "008"]), fps: 16 },
    grab: { frames: sequence("pikachu", "attack", ["001", "003"]), fps: 10 },
    victory: { frames: sequence("pikachu", "idle", ["006", "004", "002"]), fps: 6, loop: true },
  },
  "donkey-kong": {
    idle: { frames: sequence("donkey-kong", "idle", [1, 2, 3]), fps: 4, loop: true },
    run: { frames: sequence("donkey-kong", "run", [1, 2, 3, 4, 5, 6, 7]), fps: 12, loop: true },
    jump: { frames: sequence("donkey-kong", "jump", [1, 2, 3]), fps: 9 },
    fall: { frames: sequence("donkey-kong", "jump", [4, 5, 6, 7]), fps: 8 },
    attack: { frames: sequence("donkey-kong", "run", [2, 4, 6, 4]), fps: 11 },
    special: { frames: sequence("donkey-kong", "jump", [2, 3, 4, 5]), fps: 10 },
    hurt: { frames: sequence("donkey-kong", "jump", [5, 6]), fps: 8 },
    dodge: { frames: sequence("donkey-kong", "run", [7, 1, 3, 5]), fps: 15 },
    grab: { frames: sequence("donkey-kong", "idle", [1, 2]), fps: 6 },
    victory: { frames: sequence("donkey-kong", "idle", [1, 2, 3, 2]), fps: 5, loop: true },
  },
};

export const CHARACTER_ANIMATIONS = Object.fromEntries(
  FIGHTER_IDS.map((fighter) => [
    fighter,
    LEGACY_CHARACTER_ANIMATIONS[fighter] ?? humanoidAnimations(fighter),
  ]),
) as Readonly<Record<FighterId, FighterAnimationSet>>;

const LEGACY_RENDER_PROFILES: Readonly<Partial<Record<FighterId, CharacterRenderProfile>>> = {
  mario: { width: 105, height: 144, x: -52.5, y: -90 },
  link: { width: 105, height: 144, x: -52.5, y: -90 },
  samus: { width: 109, height: 150, x: -54.5, y: -96 },
  pikachu: {
    crop: { x: 176, y: 25, width: 325, height: 475 },
    width: 102,
    height: 149,
    x: -51,
    y: -94,
  },
  "donkey-kong": {
    crop: { x: 38, y: 28, width: 180, height: 207 },
    width: 132,
    height: 152,
    x: -66,
    y: -98,
  },
};

export const CHARACTER_RENDER_PROFILES = Object.fromEntries(
  FIGHTER_IDS.map((fighter) => {
    const definition = getFighterDefinition(fighter);
    const height = definition.size.height * 1.68;
    const width = definition.size.width * 1.68;
    return [fighter, LEGACY_RENDER_PROFILES[fighter] ?? {
      width,
      height,
      x: -width / 2,
      y: -height * 0.64,
    }];
  }),
) as Readonly<Record<FighterId, CharacterRenderProfile>>;

export function animationForFighter(fighter: FighterSnapshot): CharacterAnimation {
  if (fighter.state === "victory") return "victory";
  if (fighter.state === "hitstun" || fighter.state === "grabbed" || fighter.state === "ko") return "hurt";
  if (fighter.state === "dodge") return "dodge";
  if (fighter.state === "grab") return "grab";
  if (fighter.currentMove?.includes("special")) return "special";
  if (fighter.state === "attack" || fighter.currentMove) return "attack";
  if (!fighter.grounded) return fighter.velocity.y >= 0 ? "jump" : "fall";
  if (fighter.state === "crouch") return "idle";
  if (fighter.state === "walk") return "run";
  if (Math.abs(fighter.velocity.x) > 35) return "run";
  return "idle";
}

const MOVE_ANIMATION_SLOT: Readonly<Record<MoveName, RemoteAnimationSlot>> = {
  jab: "jab",
  "dash-attack": "dash_attack",
  "forward-tilt": "forward_tilt",
  "up-tilt": "up_tilt",
  "down-tilt": "down_tilt",
  "forward-smash": "forward_smash",
  "up-smash": "up_smash",
  "down-smash": "down_smash",
  "neutral-air": "neutral_air",
  "forward-air": "forward_air",
  "back-air": "back_air",
  "up-air": "up_air",
  "down-air": "down_air",
  "neutral-special": "neutral_special",
  "side-special": "side_special",
  "up-special": "up_special",
  "down-special": "down_special",
};

export function remoteAnimationSlotForFighter(
  fighter: FighterSnapshot,
): RemoteAnimationSlot | null {
  if (fighter.state === "entrance") return "entrance";
  if (fighter.state === "victory") return "victory";
  if (fighter.state === "ledge") return "ledge";
  if (fighter.state === "respawn") return "entrance";
  if (fighter.state === "ko") return "knockback";
  if (fighter.state === "hitstun") {
    if (fighter.statusEffect === "bury") return "downed";
    return Math.hypot(fighter.velocity.x, fighter.velocity.y) > 180 ? "knockback" : "hurt";
  }
  if (fighter.state === "grabbed") return "grabbed";
  if (fighter.state === "shield") return "shield";
  if (fighter.state === "dodge") {
    if (fighter.dodgeKind === "spot") return "spot_dodge";
    if (fighter.dodgeKind === "air" || !fighter.grounded) return "air_dodge";
    return fighter.dodgeKind === "back" ? "roll_back" : "roll_forward";
  }
  if (fighter.itemAction === "pickup") return "item_pickup";
  if (fighter.itemAction === "attack") return "item_attack";
  if (fighter.state === "grab") {
    if (fighter.throwAnimation === "forward") return "forward_throw";
    if (fighter.throwAnimation === "back") return "back_throw";
    if (fighter.throwAnimation === "up") return "up_throw";
    if (fighter.throwAnimation === "down") return "down_throw";
    return fighter.grabTarget === null || fighter.grabFrames <= 10 ? "grab" : "grab_hold";
  }
  if (fighter.state === "taunt") return "taunt";
  if (fighter.state === "jump-squat") return "jump_squat";
  if (fighter.state === "turn") return "turn";
  if (fighter.state === "dash") return "dash";
  if (fighter.currentMove) return MOVE_ANIMATION_SLOT[fighter.currentMove];
  if (fighter.heldItem) return "item_hold";
  if (!fighter.grounded) {
    if (fighter.velocity.y < 0) return fighter.fastFalling ? "fast_fall" : "fall";
    return fighter.jumpsRemaining === 0 ? "double_jump" : "jump";
  }
  if (fighter.state === "crouch") return "crouch";
  if (fighter.state === "walk") return "walk";
  if (fighter.state === "run" || Math.abs(fighter.velocity.x) > 35) return "run";
  return "idle";
}

export class CharacterSpriteLibrary {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly remoteImages = new Map<string, HTMLImageElement>();
  private readonly pinnedRemoteUrls = new Set<string>();
  private readonly failedRemoteImages = new Set<string>();
  private readonly decodedRemoteImages = new WeakSet<HTMLImageElement>();
  private readonly pendingRemoteDecodes = new WeakSet<HTMLImageElement>();
  private readonly remoteDecodePromises = new WeakMap<HTMLImageElement, Promise<void>>();
  private readonly warmCanvas = typeof document === "undefined"
    ? null
    : document.createElement("canvas");
  private readonly warmContext = this.warmCanvas?.getContext("2d") ?? null;
  private readonly primedFighterSkins = new Set<string>();
  private matchPreloadAbort?: AbortController;
  private readonly activeExactImages = new Map<number, ActiveExactAnimation>();
  private readonly lastResolvedExactFrames = new Map<
    number,
    { identity: string; skin: SkinId; frame: ResolvedCharacterFrame }
  >();
  private readonly remoteAnimation: RemoteAnimationConfig;

  constructor(options: CharacterSpriteLibraryOptions = {}) {
    this.remoteAnimation = options.remoteAnimation ?? REMOTE_ANIMATION_CONFIG;
    if (!this.remoteAnimation.enabled) {
      const paths = new Set<string>();
      for (const set of Object.values(CHARACTER_ANIMATIONS)) {
        for (const animation of Object.values(set)) {
          for (const frame of animation.frames) paths.add(frame);
        }
      }
      for (const path of paths) {
        const image = new Image();
        image.decoding = "async";
        image.src = path;
        this.images.set(path, image);
      }
    }

    // Exact WebP atlases are primed one selected fighter/skin at a time by remoteFrameFor.
    // This makes every move ready during the countdown without loading the
    // complete roster library up front.
  }

  destroy(): void {
    this.matchPreloadAbort?.abort();
    this.matchPreloadAbort = undefined;
    this.activeExactImages.clear();
    this.primedFighterSkins.clear();
    this.remoteImages.clear();
    this.pinnedRemoteUrls.clear();
    this.failedRemoteImages.clear();
    this.lastResolvedExactFrames.clear();
  }

  prepareMatch(selections: readonly FighterSkinSelection[]): void {
    this.matchPreloadAbort?.abort();
    this.matchPreloadAbort = undefined;
    const resolvedSelections = selections.map(({ fighter, skin }) => ({
      fighter,
      ...remoteAnimationSetForFighter(fighter, skin, this.remoteAnimation),
    }));
    const selected = new Set(
      resolvedSelections.flatMap(({ fighter, skin }) => [
        `${fighter}:${skin}`,
        ...(fighter === "ice-climbers"
          ? [`${ICE_CLIMBERS_COMPANION_ASSET_ID}:${skin}`]
          : []),
      ]),
    );
    const keepUrls = new Set(
      resolvedSelections.flatMap(({ fighter, skin, animations }) => {
        const urls = Object.values(animations)
          .map(({ mediaUrl }) => mediaUrl);
        if (fighter === "ice-climbers") {
          urls.push(...Object.values(ICE_CLIMBERS_COMPANION_ANIMATIONS[skin])
            .map(({ mediaUrl }) => mediaUrl));
        }
        return urls;
      }),
    );
    for (const url of this.remoteImages.keys()) {
      if (!keepUrls.has(url)) this.remoteImages.delete(url);
    }
    for (const url of this.pinnedRemoteUrls) {
      if (!keepUrls.has(url)) this.pinnedRemoteUrls.delete(url);
    }
    for (const url of this.failedRemoteImages) {
      if (!keepUrls.has(url)) this.failedRemoteImages.delete(url);
    }
    for (const fighterSkin of this.primedFighterSkins) {
      if (!selected.has(fighterSkin)) this.primedFighterSkins.delete(fighterSkin);
    }
    this.activeExactImages.clear();
    this.lastResolvedExactFrames.clear();
  }

  async preloadMatch(
    selections: readonly FighterSkinSelection[],
    options: CharacterPreloadOptions = {},
  ): Promise<void> {
    this.prepareMatch(selections);
    const controller = new AbortController();
    this.matchPreloadAbort = controller;
    const abortFromCaller = (): void => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener("abort", abortFromCaller, { once: true });

    const animationSets = selections.flatMap(({ fighter, skin }) => {
      const resolved = remoteAnimationSetForFighter(fighter, skin, this.remoteAnimation);
      const sets = [{
        identity: fighter as string,
        skin: resolved.skin,
        animations: resolved.animations,
      }];
      if (fighter === "ice-climbers") {
        sets.push({
          identity: ICE_CLIMBERS_COMPANION_ASSET_ID,
          skin: resolved.skin,
          animations: ICE_CLIMBERS_COMPANION_ANIMATIONS[resolved.skin],
        });
      }
      return sets;
    });
    const definitions = new Map<string, RemoteAnimationDefinition>();
    for (const { animations } of animationSets) {
      for (const definition of Object.values(animations)) {
        definitions.set(definition.mediaUrl, definition);
      }
    }
    const prioritySlots: readonly RemoteAnimationSlot[] = [
      "entrance",
      "idle",
      "dash",
      "run",
      "jump_squat",
      "jump",
      "fall",
      "jab",
      "neutral_special",
      "side_special",
      "up_special",
      "down_special",
      "shield",
      "hurt",
      "knockback",
    ];
    const priorityUrls = new Set(
      animationSets.flatMap(({ animations }) =>
        prioritySlots.map((slot) => animations[slot].mediaUrl)
      ),
    );
    const queue = [...definitions.values()].sort((left, right) =>
      Number(priorityUrls.has(right.mediaUrl)) - Number(priorityUrls.has(left.mediaUrl))
    );
    let completed = 0;
    options.onProgress?.({ completed, total: queue.length });

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException("Aborted", "AbortError");
        const definition = queue.shift();
        if (!definition) return;
        try {
          if (priorityUrls.has(definition.mediaUrl)) {
            this.pinnedRemoteUrls.add(definition.mediaUrl);
            await this.preloadRemoteDefinition(definition, controller.signal);
          } else if (typeof fetch === "function") {
            const response = await fetch(definition.mediaUrl, {
              cache: "force-cache",
              signal: controller.signal,
            });
            if (response.ok) await response.arrayBuffer();
          }
        } catch (error) {
          if (controller.signal.aborted) throw error;
          // A later Image request remains the recovery path for a transient
          // cache or decode failure. Known missing private slots already point
          // at the complete 00 fallback before reaching this loader.
        } finally {
          completed += 1;
          options.onProgress?.({ completed, total: definitions.size });
        }
      }
    };

    try {
      const concurrency = Math.max(1, Math.min(6, options.concurrency ?? 4));
      await Promise.all(
        Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, () => worker()),
      );
      for (const { identity, skin } of animationSets) {
        this.primedFighterSkins.add(`${identity}:${skin}`);
      }
    } finally {
      options.signal?.removeEventListener("abort", abortFromCaller);
      if (this.matchPreloadAbort === controller) this.matchPreloadAbort = undefined;
    }
  }

  frameFor(
    fighter: FighterSnapshot,
    elapsedSeconds: number,
  ): ResolvedCharacterFrame | null {
    if (this.remoteAnimation.enabled) {
      return this.remoteFrameFor(fighter, elapsedSeconds);
    }

    const animationName = animationForFighter(fighter);
    const animation = CHARACTER_ANIMATIONS[fighter.fighter][animationName];
    const frameCount = animation.frames.length;
    const actionFrame = Math.max(0, fighter.moveFrame);
    const rawIndex =
      animationName === "idle" || animationName === "run" || animationName === "victory"
        ? Math.floor((elapsedSeconds + fighter.slot * 0.17) * animation.fps)
        : Math.floor(actionFrame / Math.max(1, Math.round(60 / animation.fps)));
    const index = animation.loop ? rawIndex % frameCount : Math.min(frameCount - 1, rawIndex);
    const path = animation.frames[index] ?? animation.frames[0];
    if (!path) return null;
    const image = this.images.get(path);
    return image?.complete && image.naturalWidth > 0
      ? { image, source: "local" }
      : null;
  }

  companionFrameFor(
    fighter: FighterSnapshot,
    elapsedSeconds: number,
  ): ResolvedCharacterFrame | null {
    if (!this.remoteAnimation.enabled || fighter.fighter !== "ice-climbers") return null;
    const slot = remoteAnimationSlotForFighter(fighter);
    if (!slot) return null;
    const animations = ICE_CLIMBERS_COMPANION_ANIMATIONS[fighter.skin];
    return this.resolveRemoteFrame(
      fighter,
      elapsedSeconds,
      slot,
      animations[slot],
      fighter.slot + 2,
      ICE_CLIMBERS_COMPANION_ASSET_ID,
      fighter.skin,
      animations,
    );
  }

  usesExactAnimations(): boolean {
    return this.remoteAnimation.enabled;
  }

  private remoteFrameFor(
    fighter: FighterSnapshot,
    elapsedSeconds: number,
  ): ResolvedCharacterFrame | null {
    if (!this.remoteAnimation.enabled) return null;
    const slot = remoteAnimationSlotForFighter(fighter);
    if (!slot) return null;
    const resolved = remoteAnimationSetForFighter(
      fighter.fighter,
      fighter.skin,
      this.remoteAnimation,
    );
    return this.resolveRemoteFrame(
      fighter,
      elapsedSeconds,
      slot,
      resolved.animations[slot],
      fighter.slot,
      fighter.fighter,
      resolved.skin,
      resolved.animations,
    );
  }

  private resolveRemoteFrame(
    fighter: FighterSnapshot,
    elapsedSeconds: number,
    slot: RemoteAnimationSlot,
    definition: RemoteAnimationDefinition,
    track: number,
    identity: string,
    animationSkin: SkinId,
    animations: Readonly<Record<RemoteAnimationSlot, RemoteAnimationDefinition>>,
  ): ResolvedCharacterFrame | null {
    const previous = this.lastResolvedExactFrames.get(track);
    const stableFallback = previous?.identity === identity && previous.skin === animationSkin
      ? previous.frame
      : null;
    if (this.failedRemoteImages.has(definition.mediaUrl)) return stableFallback;
    const key = `${identity}:${animationSkin}:${slot}:${fighter.currentMove ?? fighter.state}`;
    let active = this.activeExactImages.get(track);
    if (!active || active.key !== key) {
      const image = this.loadRemoteImage(definition, track);
      active = {
        key,
        image,
        startedAt: elapsedSeconds,
        lastElapsed: elapsedSeconds,
        frameCursor: 0,
      };
      this.activeExactImages.set(track, active);
      this.primeAnimationSet(identity, animationSkin, animations, definition.mediaUrl);
    }
    const image = active.image;
    if (
      !image.complete ||
      image.naturalWidth <= 0
    ) return stableFallback;
    if (typeof image.decode === "function" && !this.decodedRemoteImages.has(image)) {
      this.ensureRemoteImageDecoded(image);
      return stableFallback;
    }
    const frameIndex = this.frameIndexFor(
      fighter,
      slot,
      definition,
      active,
      elapsedSeconds,
    );
    const resolved: ResolvedCharacterFrame = {
      image,
      source: "remote",
      attributionUrl: definition.sourcePage,
      sourceFacing: definition.sourceFacing,
      sourceRect: {
        x: (frameIndex % definition.columns) * definition.cellSize,
        y: Math.floor(frameIndex / definition.columns) * definition.cellSize,
        width: definition.cellSize,
        height: definition.cellSize,
      },
    };
    this.lastResolvedExactFrames.set(track, {
      identity,
      skin: animationSkin,
      frame: resolved,
    });
    return resolved;
  }

  private loadRemoteImage(
    definition: RemoteAnimationDefinition,
    fighterSlot?: number,
  ): HTMLImageElement {
    const cached = this.remoteImages.get(definition.mediaUrl);
    if (cached) {
      this.remoteImages.delete(definition.mediaUrl);
      this.remoteImages.set(definition.mediaUrl, cached);
      return cached;
    }
    const image = new Image();
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "error",
      () => {
        this.failedRemoteImages.add(definition.mediaUrl);
        this.remoteImages.delete(definition.mediaUrl);
        if (fighterSlot !== undefined && this.activeExactImages.get(fighterSlot)?.image === image) {
          this.activeExactImages.delete(fighterSlot);
        }
      },
      { once: true },
    );
    image.src = definition.mediaUrl;
    this.ensureRemoteImageDecoded(image);
    this.remoteImages.set(definition.mediaUrl, image);
    this.trimRemoteImages();
    return image;
  }

  private async preloadRemoteDefinition(
    definition: RemoteAnimationDefinition,
    signal: AbortSignal,
  ): Promise<void> {
    const image = this.loadRemoteImage(definition);
    if (!image.complete || image.naturalWidth <= 0) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }
    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    await this.ensureRemoteImageDecoded(image);
  }

  private ensureRemoteImageDecoded(image: HTMLImageElement): Promise<void> {
    if (
      typeof image.decode !== "function" ||
      this.decodedRemoteImages.has(image)
    ) return Promise.resolve();
    const pending = this.remoteDecodePromises.get(image);
    if (pending) return pending;
    this.pendingRemoteDecodes.add(image);
    const decode = image.decode()
      .then(() => {
        this.decodedRemoteImages.add(image);
        this.warmRemoteImage(image);
      })
      .catch(() => {
        // WebKit can reject decode() for a complete, drawable image. A guarded
        // Canvas read is a valid recovery path; if that also fails, removing the
        // pending flag lets the next frame retry decode() instead of wedging the
        // animation forever.
        if (image.complete && image.naturalWidth > 0 && this.warmRemoteImage(image)) {
          this.decodedRemoteImages.add(image);
        }
      })
      .finally(() => {
        this.pendingRemoteDecodes.delete(image);
        this.remoteDecodePromises.delete(image);
      });
    this.remoteDecodePromises.set(image, decode);
    return decode;
  }

  private warmRemoteImage(image: HTMLImageElement): boolean {
    const canvas = this.warmCanvas;
    const context = this.warmContext;
    if (!canvas || !context) return false;
    try {
      canvas.width = 1;
      canvas.height = 1;
      context.clearRect(0, 0, 1, 1);
      context.drawImage(image, 0, 0, 1, 1);
      // Force the upload to complete during the entrance rather than on the
      // first combat frame that switches to this atlas.
      context.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }

  private trimRemoteImages(): void {
    if (this.remoteImages.size <= 32) return;
    const activeImages = new Set(
      [...this.activeExactImages.values()].map(({ image }) => image),
    );
    for (const [url, image] of this.remoteImages) {
      if (this.remoteImages.size <= 32) break;
      if (this.pinnedRemoteUrls.has(url) || activeImages.has(image)) continue;
      this.remoteImages.delete(url);
    }
  }

  private primeAnimationSet(
    identity: string,
    skin: SkinId,
    animations: Readonly<Record<RemoteAnimationSlot, RemoteAnimationDefinition>>,
    activeUrl: string,
  ): void {
    const fighterSkin = `${identity}:${skin}`;
    if (this.primedFighterSkins.has(fighterSkin)) return;
    this.primedFighterSkins.add(fighterSkin);
    if (typeof window === "undefined" || typeof fetch === "undefined") return;
    const decodedSlots: readonly RemoteAnimationSlot[] = [
      "idle",
      "crouch",
      "walk",
      "run",
      "jump",
      "fall",
      "jab",
      "grab_hold",
      "grabbed",
    ];
    for (const slot of decodedSlots) {
      const definition = animations[slot];
      this.pinnedRemoteUrls.add(definition.mediaUrl);
      this.loadRemoteImage(definition);
    }
    const urls = Object.values(animations)
      .map(({ mediaUrl }) => mediaUrl)
      .filter((mediaUrl) => mediaUrl !== activeUrl);
    // Cache every compressed atlas in bounded batches during the entrance.
    // Only frequent actions are decoded eagerly, which avoids both combat-time
    // network stalls and an all-at-once GPU memory spike.
    void (async () => {
      for (let index = 0; index < urls.length; index += 3) {
        await Promise.all(urls.slice(index, index + 3).map(async (mediaUrl) => {
          try {
            const response = await fetch(mediaUrl, { cache: "force-cache" });
            if (response.ok) await response.arrayBuffer();
          } catch {
            // The normal Image request remains the source of truth on failure.
          }
        }));
      }
    })();
  }

  private frameIndexFor(
    fighter: FighterSnapshot,
    slot: RemoteAnimationSlot,
    definition: RemoteAnimationDefinition,
    active: ActiveExactAnimation,
    elapsedSeconds: number,
  ): number {
    if (fighter.currentMove) {
      const move = getFighterDefinition(fighter.fighter).attacks[fighter.currentMove];
      const segmentedFrame = this.segmentedSpecialFrameIndex(
        fighter,
        slot,
        move,
      );
      if (segmentedFrame !== null) return segmentedFrame;
      const totalFrames = move.startup + move.active + move.recovery;
      const progress = Math.min(1, fighter.moveFrame / Math.max(1, totalFrames - 1));
      return Math.min(
        definition.frameCount - 1,
        Math.floor(progress * definition.frameCount),
      );
    }

    const authoredStateFrames: Partial<Record<RemoteAnimationSlot, number>> = {
      turn: 5,
      spot_dodge: 25,
      roll_forward: 25,
      roll_back: 25,
      air_dodge: 31,
      item_attack: 13,
      item_pickup: 8,
      grab: 23,
      forward_throw: 16,
      back_throw: 16,
      up_throw: 16,
      down_throw: 16,
      entrance: 120,
      taunt: 60,
    };
    const fighterDefinition = getFighterDefinition(fighter.fighter);
    const stateFrames = slot === "entrance" && fighter.state === "respawn"
      ? 45
      : slot === "jump_squat"
        ? effectiveJumpSquatFrames(fighterDefinition.jumpSquatFrames)
        : slot === "dash"
          ? fighterDefinition.initialDashFrames
          : authoredStateFrames[slot];
    if (stateFrames) {
      const progress = Math.min(
        1,
        Math.max(0, elapsedSeconds - active.startedAt) * 60 / stateFrames,
      );
      const frameIndex = Math.min(
        definition.frameCount - 1,
        Math.floor(progress * definition.frameCount),
      );
      return definition.reversePlayback
        ? definition.frameCount - 1 - frameIndex
        : frameIndex;
    }

    const loops =
      slot === "idle" ||
      slot === "crouch" ||
      slot === "walk" ||
      slot === "run" ||
      slot === "fall" ||
      slot === "ledge" ||
      slot === "shield" ||
      slot === "item_hold" ||
      slot === "grab_hold" ||
      slot === "grabbed" ||
      slot === "downed" ||
      slot === "victory";
    if (loops) {
      const delta = Math.min(0.1, Math.max(0, elapsedSeconds - active.lastElapsed));
      active.lastElapsed = elapsedSeconds;
      let playbackFps = definition.fps;
      if (slot === "walk" || slot === "run") {
        const runSpeed = fighterDefinition.runSpeed;
        const speedRatio = Math.min(1, Math.abs(fighter.velocity.x) / runSpeed);
        playbackFps = slot === "walk"
          ? 8 + speedRatio * 10
          : definition.fps *
            (isMeleeFighterId(fighter.fighter) ? MELEE_RUN_PLAYBACK_MULTIPLIER : 1) *
            Math.max(0.62, speedRatio);
      }
      active.frameCursor += delta * playbackFps;
      return Math.floor(active.frameCursor) % definition.frameCount;
    }

    const rawIndex = Math.floor(
      Math.max(0, elapsedSeconds - active.startedAt) * definition.fps,
    );
    return Math.min(definition.frameCount - 1, rawIndex);
  }

  private segmentedSpecialFrameIndex(
    fighter: FighterSnapshot,
    slot: RemoteAnimationSlot,
    move: ReturnType<typeof getFighterDefinition>["attacks"][MoveName],
  ): number | null {
    if (slot !== "up_special" || fighter.currentMove !== "up-special") return null;
    const phase = fighter.specialPhase;
    const phaseSelection = UP_SPECIAL_PHASE_SEGMENTS[fighter.fighter];
    const segments = SPECIAL_SEGMENTS[`${fighter.fighter}/${slot}`];
    if (!phase || !phaseSelection || !segments) return null;
    const [firstIndex, lastIndex] = phaseSelection[phase];
    const first = segments[firstIndex];
    const last = segments[lastIndex];
    if (!first || !last) return null;

    const phaseStart = phase === "startup"
      ? 0
      : phase === "active"
        ? move.startup
        : move.startup + move.active;
    const phaseFrames = phase === "startup"
      ? move.startup
      : phase === "active"
        ? move.active
        : move.recovery;
    const progress = Math.min(
      1,
      Math.max(0, fighter.moveFrame - phaseStart) / Math.max(1, phaseFrames - 1),
    );
    const start = first.start;
    const end = last.start + last.count - 1;
    return Math.min(end, Math.floor(start + (end - start) * progress));
  }
}
