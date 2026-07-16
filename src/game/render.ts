import type {
  FighterSnapshot,
  GameSnapshot,
  ItemSnapshot,
  ProjectileSnapshot,
} from "./engine";
import type { FighterId, GameSettings, PlayerSlot, StageId } from "./contracts";
import {
  CHARACTER_RENDER_PROFILES,
  CharacterSpriteLibrary,
  REMOTE_ANIMATION_CONFIG,
  type FighterSkinSelection,
  type ResolvedCharacterFrame,
} from "./characterAssets";
import {
  EXACT_MODEL_TO_BODY_HEIGHT_RATIO,
  FIGHTER_IDS,
  getFighterDefinition,
} from "./roster";
import {
  getStageDefinition,
  stagePixelToWorld,
} from "./stages";
import { ITEM_DEFINITIONS, ITEM_KINDS, type ItemKind } from "./items";
import { CombatEffects, type EffectView } from "./effects";
import type { ThreeStageRenderer } from "./threeStageRenderer";

type Vec2 = { x: number; y: number };

interface SpriteBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const findOpaquePixelBounds = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 24,
): SpriteBounds | null => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((pixels[(y * width + x) * 4 + 3] ?? 0) < alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX < minX || maxY < minY
    ? null
    : {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
};

interface Palette {
  primary: string;
  secondary: string;
  dark: string;
  light: string;
  accent: string;
}

const PALETTES = Object.fromEntries(
  FIGHTER_IDS.map((fighter) => {
    const colors = getFighterDefinition(fighter).colors;
    return [fighter, {
      primary: colors.primary,
      secondary: colors.secondary,
      dark: "#171820",
      light: "#fff4dc",
      accent: colors.accent,
    }];
  }),
) as Record<FighterId, Palette>;

// Average opaque height of the supplied idle atlases, measured inside their
// 192 px browser cells. Normalising against the actual silhouette prevents characters
// such as Link and Donkey Kong from looking smaller merely because their
// source render leaves more transparent space around them.
export const EXACT_SPRITE_REFERENCE_HEIGHT_PX = Object.fromEntries(
  FIGHTER_IDS.map((fighter) => [
    fighter,
    getFighterDefinition(fighter).spriteReferenceHeight,
  ]),
) as Readonly<Record<FighterId, number>>;

// A single art-to-body ratio keeps every silhouette aligned with the same
// collision contract while still allowing hats, ears and hands to overhang.
// Measured against Melee Battlefield's lower-platform gap: the old 1.45 ratio
// made Mario's silhouette about 24% larger than its Melee stage proportion.
export const EXACT_SPRITE_VISUAL_TO_BODY_RATIO = EXACT_MODEL_TO_BODY_HEIGHT_RATIO;

export const exactSpritePixelScale = (fighter: FighterId): number =>
  (getFighterDefinition(fighter).size.height * EXACT_SPRITE_VISUAL_TO_BODY_RATIO) /
  EXACT_SPRITE_REFERENCE_HEIGHT_PX[fighter];

const GROUND_SHADOW_WIDTH = Object.fromEntries(
  FIGHTER_IDS.map((fighter) => [
    fighter,
    Math.max(24, getFighterDefinition(fighter).size.width * 0.48),
  ]),
) as Readonly<Record<FighterId, number>>;

/**
 * Exact sheets are pre-lit native renders. Until native c01+ sheets exist,
 * every selected skin intentionally keeps the c00 material palette: applying a
 * flat overlay here also recolours skin, eyes, weapons and armour.
 */
export const fighterArtFootOffset = (fighterHeight: number, exact: boolean): number =>
  exact ? fighterHeight / 2 : 54;

export const fighterShadowOffset = (fighterHeight: number, exact: boolean): number =>
  exact ? fighterHeight / 2 : 53;

export const CAMERA_SCREEN_ANCHOR_RATIO = 0.42;
export const CAMERA_SAFE_TOP_RATIO = 0.12;
export const CAMERA_SAFE_BOTTOM_RATIO = 0.78;
export const CAMERA_REST_GROUND_RATIO = 0.68;
export const CAMERA_MIN_ZOOM = 0.54;
export const CAMERA_MAX_ZOOM = 1.08;
export const CAMERA_RISE_FOLLOW_RATE = 15;
export const CAMERA_FALL_FOLLOW_RATE = 4;
export const CAMERA_HORIZONTAL_FOLLOW_RATE = 6.5;
export const CAMERA_ZOOM_OUT_RATE = 10;
export const CAMERA_ZOOM_IN_RATE = 2.2;
export const CAMERA_RECENTER_DELAY_SECONDS = 0.8;
export const CAMERA_MAX_HORIZONTAL_SPEED = 560;
export const CAMERA_MAX_VERTICAL_SPEED = 760;
export const CAMERA_MAX_ZOOM_OUT_SPEED = 0.8;
export const CAMERA_MAX_ZOOM_IN_SPEED = 0.42;

const CAMERA_STAGE_HALF_WIDTH = 520;
const CAMERA_STAGE_TOP = 400;
const CAMERA_STAGE_BOTTOM = -40;
const CAMERA_HORIZONTAL_MARGIN = 80;
const CAMERA_TOP_MARGIN = 32;
const CAMERA_BOTTOM_MARGIN = 20;
const CAMERA_UP_LOOKAHEAD_SECONDS = 0.15;
const CAMERA_DOWN_LOOKAHEAD_SECONDS = 0.04;
const CAMERA_MAX_UP_LOOKAHEAD = 160;
const CAMERA_MAX_DOWN_LOOKAHEAD = 45;
const CAMERA_TRIGGER_LEFT_RATIO = 0.1;
const CAMERA_TRIGGER_RIGHT_RATIO = 0.9;
const CAMERA_TRIGGER_TOP_RATIO = 0.18;
const CAMERA_TRIGGER_BOTTOM_RATIO = 0.76;
const CAMERA_PAD_LEFT_RATIO = 0.17;
const CAMERA_PAD_RIGHT_RATIO = 0.83;
const CAMERA_PAD_TOP_RATIO = 0.25;
const CAMERA_PAD_BOTTOM_RATIO = 0.7;
const CAMERA_ZOOM_HYSTERESIS = 0.045;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

export interface CameraFocusFighter {
  position: Vec2;
  velocity: Vec2;
  size: { width: number; height: number };
  respawnFrames: number;
}

export interface CameraTarget {
  x: number;
  y: number;
  zoom: number;
}

export interface GameRendererOptions {
  stageCanvas?: HTMLCanvasElement;
  stageBackdrop?: HTMLImageElement;
}

export interface MatchPreloadProgress {
  completed: number;
  total: number;
  phase: "fighters" | "stage" | "items";
}

export interface MatchPreloadOptions {
  items: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: MatchPreloadProgress) => void;
}

const waitForImage = async (
  image: HTMLImageElement,
  signal?: AbortSignal,
): Promise<void> => {
  if (!image.complete || image.naturalWidth <= 0) {
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  if (typeof image.decode === "function" && image.naturalWidth > 0) {
    await image.decode().catch(() => undefined);
  }
};

export const cameraSmoothingAmount = (dt: number, rate: number): number =>
  1 - Math.exp(-Math.max(0, dt) * rate);

export const smoothCameraValue = (
  current: number,
  goal: number,
  dt: number,
  rate: number,
  maximumSpeed: number,
): number => {
  const elapsed = Math.max(0, dt);
  const smoothed = lerp(current, goal, cameraSmoothingAmount(elapsed, rate));
  const maximumStep = Math.max(0, maximumSpeed) * elapsed;
  return current + clamp(smoothed - current, -maximumStep, maximumStep);
};

/** Coherent shake avoids the white-noise vibration produced by per-frame randomness. */
export const cameraShakeOffset = (
  elapsedSeconds: number,
  power: number,
): Vec2 => ({
  x: Math.sin(elapsedSeconds * 28) * power * 0.42,
  y: Math.sin(elapsedSeconds * 33 + 1.1) * power * 0.32,
});

export const computeGameplayCameraTarget = (
  fighters: readonly CameraFocusFighter[],
  viewportWidth: number,
  viewportHeight: number,
): CameraTarget => {
  const active = fighters.filter((fighter) => fighter.respawnFrames <= 0);
  const focus = active.length > 0
    ? active
    : [{
        position: { x: 0, y: 41 },
        velocity: { x: 0, y: 0 },
        size: { width: 62, height: 82 },
        respawnFrames: 0,
      }];

  const physicalLeft = Math.min(
    -CAMERA_STAGE_HALF_WIDTH,
    ...focus.map((fighter) => fighter.position.x - fighter.size.width * 0.6),
  ) - CAMERA_HORIZONTAL_MARGIN;
  const physicalRight = Math.max(
    CAMERA_STAGE_HALF_WIDTH,
    ...focus.map((fighter) => fighter.position.x + fighter.size.width * 0.6),
  ) + CAMERA_HORIZONTAL_MARGIN;
  const actualTop = Math.max(
    ...focus.map((fighter) => fighter.position.y + fighter.size.height * 0.67),
  );
  const actualBottom = Math.min(
    ...focus.map((fighter) => fighter.position.y - fighter.size.height * 0.5),
  );
  const lowestCenter = Math.min(...focus.map((fighter) => fighter.position.y));
  const floorRelease = clamp((lowestCenter - 260) / 160, 0, 1);
  const physicalTop = Math.max(
    actualTop,
    lerp(CAMERA_STAGE_TOP, actualTop, floorRelease),
  ) + CAMERA_TOP_MARGIN;
  const physicalBottom = Math.min(
    actualBottom,
    lerp(CAMERA_STAGE_BOTTOM, actualBottom, floorRelease),
  ) - CAMERA_BOTTOM_MARGIN;

  const horizontalFit =
    viewportWidth * 0.84 / Math.max(1, physicalRight - physicalLeft);
  const verticalFit =
    viewportHeight * (CAMERA_SAFE_BOTTOM_RATIO - CAMERA_SAFE_TOP_RATIO) /
    Math.max(1, physicalTop - physicalBottom);
  const zoom = clamp(
    Math.min(horizontalFit, verticalFit),
    CAMERA_MIN_ZOOM,
    CAMERA_MAX_ZOOM,
  );

  const averageVelocityX =
    focus.reduce((total, fighter) => total + fighter.velocity.x, 0) / focus.length;
  const horizontalLead = clamp(averageVelocityX * 0.08, -90, 90);
  const x = clamp(
    (physicalLeft + physicalRight) / 2 + horizontalLead,
    -350,
    350,
  );

  const anticipatedTop = Math.max(
    physicalTop,
    ...focus.map((fighter) =>
      fighter.position.y + fighter.size.height * 0.67 + CAMERA_TOP_MARGIN +
      clamp(
        Math.max(0, fighter.velocity.y) * CAMERA_UP_LOOKAHEAD_SECONDS,
        0,
        CAMERA_MAX_UP_LOOKAHEAD,
      ),
    ),
  );
  const anticipatedBottom = Math.min(
    physicalBottom,
    ...focus.map((fighter) =>
      fighter.position.y - fighter.size.height * 0.5 - CAMERA_BOTTOM_MARGIN -
      clamp(
        Math.max(0, -fighter.velocity.y) * CAMERA_DOWN_LOOKAHEAD_SECONDS,
        0,
        CAMERA_MAX_DOWN_LOOKAHEAD,
      ),
    ),
  );
  const anchorPx = viewportHeight * CAMERA_SCREEN_ANCHOR_RATIO;
  const safeTopPx = viewportHeight * CAMERA_SAFE_TOP_RATIO;
  const safeBottomPx = viewportHeight * CAMERA_SAFE_BOTTOM_RATIO;
  const minimumY = anticipatedTop - (anchorPx - safeTopPx) / zoom;
  const maximumY = anticipatedBottom + (safeBottomPx - anchorPx) / zoom;
  const restY =
    (CAMERA_REST_GROUND_RATIO - CAMERA_SCREEN_ANCHOR_RATIO) * viewportHeight / zoom;
  const y = minimumY <= maximumY
    ? clamp(restY, minimumY, maximumY)
    : (minimumY + maximumY) / 2;

  return { x, y: clamp(y, 70, 650), zoom };
};

export const updateGameplayCameraGoal = (
  camera: Readonly<CameraTarget>,
  previousGoal: Readonly<CameraTarget>,
  fittedTarget: Readonly<CameraTarget>,
  fighters: readonly CameraFocusFighter[],
  viewportWidth: number,
  viewportHeight: number,
  recenter: boolean,
): CameraTarget => {
  if (recenter) return { ...fittedTarget };
  const active = fighters.filter((fighter) => fighter.respawnFrames <= 0);
  if (active.length === 0) return { ...previousGoal };

  const screenBounds = active.map((fighter) => {
    const x = viewportWidth / 2 +
      (fighter.position.x - camera.x) * camera.zoom;
    const y = viewportHeight * CAMERA_SCREEN_ANCHOR_RATIO -
      (fighter.position.y - camera.y) * camera.zoom;
    const upwardLead = clamp(
      Math.max(0, fighter.velocity.y) * CAMERA_UP_LOOKAHEAD_SECONDS,
      0,
      CAMERA_MAX_UP_LOOKAHEAD,
    );
    const downwardLead = clamp(
      Math.max(0, -fighter.velocity.y) * CAMERA_DOWN_LOOKAHEAD_SECONDS,
      0,
      CAMERA_MAX_DOWN_LOOKAHEAD,
    );
    return {
      left: x - fighter.size.width * 0.6 * camera.zoom,
      right: x + fighter.size.width * 0.6 * camera.zoom,
      top: y - (fighter.size.height * 0.67 + upwardLead) * camera.zoom,
      bottom: y + (fighter.size.height * 0.5 + downwardLead) * camera.zoom,
    };
  });
  const left = Math.min(...screenBounds.map((bounds) => bounds.left));
  const right = Math.max(...screenBounds.map((bounds) => bounds.right));
  const top = Math.min(...screenBounds.map((bounds) => bounds.top));
  const bottom = Math.max(...screenBounds.map((bounds) => bounds.bottom));
  const leftBreach = left < viewportWidth * CAMERA_TRIGGER_LEFT_RATIO;
  const rightBreach = right > viewportWidth * CAMERA_TRIGGER_RIGHT_RATIO;
  const topBreach = top < viewportHeight * CAMERA_TRIGGER_TOP_RATIO;
  const bottomBreach = bottom > viewportHeight * CAMERA_TRIGGER_BOTTOM_RATIO;
  const next = { ...previousGoal };

  if (leftBreach && rightBreach) {
    next.x = fittedTarget.x;
  } else if (leftBreach) {
    next.x = camera.x -
      (viewportWidth * CAMERA_PAD_LEFT_RATIO - left) / camera.zoom;
  } else if (rightBreach) {
    next.x = camera.x +
      (right - viewportWidth * CAMERA_PAD_RIGHT_RATIO) / camera.zoom;
  }

  if (topBreach && bottomBreach) {
    next.y = fittedTarget.y;
  } else if (topBreach) {
    next.y = camera.y +
      (viewportHeight * CAMERA_PAD_TOP_RATIO - top) / camera.zoom;
  } else if (bottomBreach) {
    next.y = camera.y -
      (bottom - viewportHeight * CAMERA_PAD_BOTTOM_RATIO) / camera.zoom;
  }

  const anyBreach = leftBreach || rightBreach || topBreach || bottomBreach;
  if (
    anyBreach &&
    fittedTarget.zoom < previousGoal.zoom - CAMERA_ZOOM_HYSTERESIS
  ) {
    next.zoom = fittedTarget.zoom;
  } else if (
    !anyBreach &&
    fittedTarget.zoom > previousGoal.zoom + CAMERA_ZOOM_HYSTERESIS
  ) {
    // A KO can request a very wide frame for only a few frames. Always allow
    // the goal to zoom back in once the fitted combat area shrinks; waiting for
    // every fighter to become motionless can otherwise leave the camera wide
    // for the remainder of an active stock.
    next.zoom = fittedTarget.zoom;
  }

  return {
    x: clamp(next.x, -350, 350),
    y: clamp(next.y, 70, 650),
    zoom: clamp(next.zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM),
  };
};

export const clampStageCameraX = (
  targetX: number,
  viewportWidth: number,
  zoom: number,
  artWorldWidth: number,
  overscanPx = 0,
): number => {
  const halfVisibleWorld =
    (viewportWidth + overscanPx * 2) / (2 * Math.max(zoom, 0.001));
  const maximumOffset = Math.max(0, artWorldWidth / 2 - halfVisibleWorld);
  return clamp(targetX, -maximumOffset, maximumOffset);
};

export const clampStageCameraY = (
  targetY: number,
  viewportHeight: number,
  zoom: number,
  artTopWorld: number,
  artBottomWorld: number,
  overscanPx = 0,
  screenAnchorRatio = CAMERA_SCREEN_ANCHOR_RATIO,
): number => {
  const safeZoom = Math.max(zoom, 0.001);
  const screenAnchor = viewportHeight * screenAnchorRatio;
  const minimumY =
    artBottomWorld + (viewportHeight + overscanPx - screenAnchor) / safeZoom;
  const maximumY = artTopWorld - (screenAnchor + overscanPx) / safeZoom;
  if (minimumY > maximumY) return (minimumY + maximumY) / 2;
  return clamp(targetY, minimumY, maximumY);
};

export const minimumStageArtZoom = (
  viewportWidth: number,
  viewportHeight: number,
  artWorldWidth: number,
  artWorldHeight: number,
  overscanPx = 0,
): number => Math.max(
  0.62,
  (viewportWidth + overscanPx * 2) / artWorldWidth,
  (viewportHeight + overscanPx * 2) / artWorldHeight,
);

export class GameRenderer {
  private readonly context: CanvasRenderingContext2D;
  private width = 1600;
  private height = 900;
  private dpr = 1;
  private elapsed = 0;
  private camera = { x: 0, y: 110, zoom: 1 };
  private cameraGoal = { x: 0, y: 110, zoom: 1 };
  private shake = 0;
  private flash = 0;
  private flashColor = "#ffffff";
  private goTimer = 0;
  private readonly effects = new CombatEffects();
  private resizeObserver: ResizeObserver | null = null;
  private lastFrame = -1;
  private cameraPrimed = false;
  private cameraStableSeconds = 0;
  private readonly characterSprites = new CharacterSpriteLibrary({
    remoteAnimation: REMOTE_ANIMATION_CONFIG,
  });
  private readonly spriteSampleCanvas = document.createElement("canvas");
  private readonly spriteSampleContext = this.spriteSampleCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  private readonly exactFrameCanvas = document.createElement("canvas");
  private readonly exactFrameContext = this.exactFrameCanvas.getContext("2d");
  private readonly spriteBounds = new WeakMap<
    HTMLImageElement,
    Map<string, SpriteBounds | null>
  >();
  private readonly stageArt = new Map<StageId, HTMLImageElement>();
  private readonly stageBackdrops = new Map<StageId, HTMLImageElement>();
  private readonly itemArt = new Map<ItemKind, HTMLImageElement>();
  private nativeStageRenderer?: ThreeStageRenderer;
  private nativeStageLoad?: Promise<void>;
  private pendingNativeStage?: StageId;
  private nativeStageGeneration = 0;
  private readonly nativeStageCanvas?: HTMLCanvasElement;
  private readonly stageBackdropElement?: HTMLImageElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: GameRendererOptions = {},
  ) {
    const context = canvas.getContext("2d", { alpha: Boolean(options.stageCanvas) });
    if (!context) throw new Error("2D canvas is unavailable in this browser.");
    this.context = context;
    this.nativeStageCanvas = options.stageCanvas;
    this.stageBackdropElement = options.stageBackdrop;
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", this.resize);
    }
  }

  destroy(): void {
    this.nativeStageGeneration += 1;
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.resize);
    this.characterSprites.destroy();
    this.nativeStageRenderer?.destroy();
  }

  async preloadMatch(
    fighters: readonly FighterSkinSelection[],
    stage: StageId,
    options: MatchPreloadOptions,
  ): Promise<void> {
    this.prepareStage(stage);
    const definition = getStageDefinition(stage);
    const itemImages = options.items ? this.prepareItems() : [];
    let fighterCompleted = 0;
    let fighterTotal = 0;
    let stageCompleted = 0;
    let itemCompleted = 0;
    const nativeStageResources = definition.scene && this.nativeStageCanvas ? 1 : 0;
    const total = (): number => fighterTotal + 2 + nativeStageResources + itemImages.length;
    const report = (phase: MatchPreloadProgress["phase"]): void => {
      options.onProgress?.({
        completed: fighterCompleted + stageCompleted + itemCompleted,
        total: total(),
        phase,
      });
    };

    const fighterLoad = this.characterSprites.preloadMatch(fighters, {
      signal: options.signal,
      concurrency: 4,
      onProgress: (progress) => {
        fighterCompleted = progress.completed;
        fighterTotal = progress.total;
        report("fighters");
      },
    });
    const stageImages = [this.stageArt.get(stage), this.stageBackdrops.get(stage)]
      .filter((image): image is HTMLImageElement => Boolean(image));
    const stageLoads = stageImages.map(async (image) => {
      await waitForImage(image, options.signal);
      stageCompleted += 1;
      report("stage");
    });
    if (nativeStageResources > 0) {
      stageLoads.push(this.preloadNativeStage(stage).then(() => {
        stageCompleted += 1;
        report("stage");
      }));
    }
    const itemLoads = itemImages.map(async (image) => {
      await waitForImage(image, options.signal);
      itemCompleted += 1;
      report("items");
    });

    await Promise.all([fighterLoad, ...stageLoads, ...itemLoads]);
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
  }

  beginMatch(
    fighters: readonly FighterSkinSelection[],
    stage: StageId,
    items = false,
  ): void {
    this.elapsed = 0;
    this.camera = { x: 0, y: 110, zoom: 1 };
    this.cameraGoal = { x: 0, y: 110, zoom: 1 };
    this.cameraPrimed = false;
    this.cameraStableSeconds = 0;
    this.shake = 0;
    this.flash = 0;
    this.goTimer = 0;
    this.effects.reset();
    this.lastFrame = -1;
    this.prepareStage(stage);
    this.prepareNativeStage(stage);
    if (items) this.prepareItems();
    this.characterSprites.prepareMatch(fighters);
  }

  private prepareItems(): HTMLImageElement[] {
    for (const kind of ITEM_KINDS) {
      if (this.itemArt.has(kind)) continue;
      const image = new Image();
      image.decoding = "async";
      image.src = ITEM_DEFINITIONS[kind].iconUrl;
      this.itemArt.set(kind, image);
    }
    return [...this.itemArt.values()];
  }

  private prepareStage(stage: StageId): void {
    const definition = getStageDefinition(stage);
    if (this.stageBackdropElement && !this.stageBackdropElement.src.endsWith(definition.backdropUrl)) {
      this.stageBackdropElement.src = definition.backdropUrl;
    }
    if (!this.stageArt.has(stage)) {
      const arena = new Image();
      arena.decoding = "async";
      arena.fetchPriority = "high";
      arena.src = definition.renderUrl;
      this.stageArt.set(stage, arena);
    }
    if (!this.stageBackdrops.has(stage)) {
      const backdrop = new Image();
      backdrop.decoding = "async";
      backdrop.fetchPriority = "high";
      backdrop.src = definition.backdropUrl;
      this.stageBackdrops.set(stage, backdrop);
    }
  }

  private prepareNativeStage(stage: StageId): void {
    const definition = getStageDefinition(stage);
    this.pendingNativeStage = definition.scene ? stage : undefined;
    if (this.nativeStageRenderer) {
      this.nativeStageRenderer.prepare(stage);
      return;
    }
    if (!definition.scene || !this.nativeStageCanvas || this.nativeStageLoad) return;
    const generation = ++this.nativeStageGeneration;
    this.nativeStageLoad = import("./threeStageRenderer")
      .then(({ ThreeStageRenderer: NativeRenderer }) => {
        if (generation !== this.nativeStageGeneration || !this.nativeStageCanvas) return;
        this.nativeStageRenderer = new NativeRenderer(this.nativeStageCanvas);
        if (this.pendingNativeStage) {
          this.nativeStageRenderer.prepare(this.pendingNativeStage);
        }
      })
      .catch((error: unknown) => {
        if (generation === this.nativeStageGeneration) {
          this.nativeStageLoad = undefined;
          console.warn("Native stage rendering is unavailable; using the 2D fallback.", error);
        }
      });
  }

  private async preloadNativeStage(stage: StageId): Promise<void> {
    this.prepareNativeStage(stage);
    await this.nativeStageLoad;
    await this.nativeStageRenderer?.preload(stage);
  }

  render(snapshot: GameSnapshot, deltaSeconds: number, settings: GameSettings): void {
    const dt = clamp(deltaSeconds, 0, 1 / 15);
    this.elapsed += dt;
    if (snapshot.frame !== this.lastFrame) {
      const feedback = this.effects.consume(snapshot.events, snapshot);
      this.shake = Math.max(this.shake, feedback.shake);
      this.flash = Math.max(this.flash, feedback.flash);
      if (feedback.flash > 0) this.flashColor = feedback.flashColor;
      if (snapshot.events.some(({ type }) => type === "match-start")) this.goTimer = 1;
      this.lastFrame = snapshot.frame;
    }
    this.prepareStage(snapshot.stage.id);
    this.updateCamera(snapshot, dt);
    this.effects.update(snapshot, dt);

    const shakePower = this.shake * settings.shake;
    const { x: shakeX, y: shakeY } = cameraShakeOffset(this.elapsed, shakePower);
    this.shake = Math.max(0, this.shake - dt * 42);
    this.flash = Math.max(0, this.flash - dt * 3.8);
    this.goTimer = Math.max(0, this.goTimer - dt);

    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const nativeStageReady = this.nativeStageRenderer?.render(
      snapshot.stage.id,
      this.camera,
      this.width,
      this.height,
      this.dpr,
      { x: shakeX, y: shakeY },
    ) ?? false;
    this.canvas.parentElement?.setAttribute(
      "data-stage-renderer",
      nativeStageReady ? "native-3d" : "fallback-2d",
    );
    if (!nativeStageReady) this.drawStageFallback(snapshot);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.drawWorld(snapshot, !nativeStageReady);
    this.drawCountdown(snapshot);
    this.drawGo();
    ctx.restore();
    this.effects.drawScreen(ctx, this.effectView());

    if (this.flash > 0.005 && settings.flashes > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash * settings.flashes * 0.45;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  private readonly resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(320, rect.width || window.innerWidth || 1600);
    this.height = Math.max(240, rect.height || window.innerHeight || 900);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  };

  private updateCamera(snapshot: GameSnapshot, dt: number): void {
    const target = computeGameplayCameraTarget(
      snapshot.fighters,
      this.width,
      this.height,
    );
    if (!this.cameraPrimed) {
      this.camera = target;
      this.cameraGoal = target;
      this.cameraPrimed = true;
      return;
    }

    if (snapshot.events.some(({ type }) => type === "respawn")) {
      this.camera = target;
      this.cameraGoal = target;
      this.cameraStableSeconds = 0;
      return;
    }

    const active = snapshot.fighters.filter((fighter) => fighter.respawnFrames <= 0);
    const calm = active.length > 0 && active.every((fighter) =>
      Math.abs(fighter.velocity.x) < 45 && Math.abs(fighter.velocity.y) < 45
    );
    const wasStable =
      this.cameraStableSeconds >= CAMERA_RECENTER_DELAY_SECONDS;
    this.cameraStableSeconds = calm
      ? Math.min(CAMERA_RECENTER_DELAY_SECONDS, this.cameraStableSeconds + dt)
      : 0;
    const shouldRecenter =
      !wasStable &&
      this.cameraStableSeconds >= CAMERA_RECENTER_DELAY_SECONDS;
    this.cameraGoal = updateGameplayCameraGoal(
      this.camera,
      this.cameraGoal,
      target,
      snapshot.fighters,
      this.width,
      this.height,
      shouldRecenter,
    );

    this.camera.x = smoothCameraValue(
      this.camera.x,
      this.cameraGoal.x,
      dt,
      CAMERA_HORIZONTAL_FOLLOW_RATE,
      CAMERA_MAX_HORIZONTAL_SPEED,
    );
    this.camera.y = smoothCameraValue(
      this.camera.y,
      this.cameraGoal.y,
      dt,
      this.cameraGoal.y > this.camera.y
        ? CAMERA_RISE_FOLLOW_RATE
        : CAMERA_FALL_FOLLOW_RATE,
      CAMERA_MAX_VERTICAL_SPEED,
    );
    this.camera.zoom = smoothCameraValue(
      this.camera.zoom,
      this.cameraGoal.zoom,
      dt,
      this.cameraGoal.zoom < this.camera.zoom
        ? CAMERA_ZOOM_OUT_RATE
        : CAMERA_ZOOM_IN_RATE,
      this.cameraGoal.zoom < this.camera.zoom
        ? CAMERA_MAX_ZOOM_OUT_SPEED
        : CAMERA_MAX_ZOOM_IN_SPEED,
    );
  }

  private worldToScreen(position: Vec2): Vec2 {
    return {
      x: this.width / 2 + (position.x - this.camera.x) * this.camera.zoom,
      // The calibrated art origin is the visible fighting surface. Keeping it
      // near the vertical centre makes the supplied stage itself the arena,
      // rather than a backdrop behind a second synthetic platform.
      y: this.height * CAMERA_SCREEN_ANCHOR_RATIO -
        (position.y - this.camera.y) * this.camera.zoom,
    };
  }

  private drawStageFallback(snapshot: GameSnapshot): void {
    const ctx = this.context;
    const backdrop = this.stageBackdrops.get(snapshot.stage.id);
    if (backdrop?.complete && backdrop.naturalWidth > 0 && backdrop.naturalHeight > 0) {
      const sourceAspect = backdrop.naturalWidth / backdrop.naturalHeight;
      const viewportAspect = this.width / this.height;
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = backdrop.naturalWidth;
      let sourceHeight = backdrop.naturalHeight;
      if (sourceAspect > viewportAspect) {
        sourceWidth = sourceHeight * viewportAspect;
        sourceX = (backdrop.naturalWidth - sourceWidth) / 2;
      } else {
        sourceHeight = sourceWidth / viewportAspect;
        sourceY = (backdrop.naturalHeight - sourceHeight) / 2;
      }
      ctx.drawImage(
        backdrop,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        this.width,
        this.height,
      );
      return;
    }
    const definition = getStageDefinition(snapshot.stage.id);
    const fallback = ctx.createLinearGradient(0, 0, 0, this.height);
    fallback.addColorStop(0, definition.colors.body);
    fallback.addColorStop(1, definition.colors.shadow);
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawWorld(snapshot: GameSnapshot, drawFlattenedStage = true): void {
    if (drawFlattenedStage) this.drawStage(snapshot);
    this.effects.drawBehind(this.context, snapshot, this.effectView());
    for (const item of snapshot.items) this.drawItem(item);
    for (const projectile of snapshot.projectiles) this.drawProjectile(projectile);
    for (const fighter of snapshot.fighters) this.drawFighter(fighter);
    this.effects.drawFront(this.context, snapshot, this.effectView());
    this.drawOffscreenIndicators(snapshot);
  }

  private effectView(): EffectView {
    return {
      worldToScreen: (position) => this.worldToScreen(position),
      zoom: this.camera.zoom,
      width: this.width,
      height: this.height,
    };
  }

  private drawStage(snapshot: GameSnapshot): void {
    const ctx = this.context;
    const definition = getStageDefinition(snapshot.stage.id);
    const art = this.stageArt.get(snapshot.stage.id);
    if (!art?.complete || art.naturalWidth <= 0) return;

    const topLeftWorld = stagePixelToWorld(snapshot.stage.id, { x: 0, y: 0 });
    const topLeft = this.worldToScreen(topLeftWorld);
    const width = definition.art.width * definition.art.worldUnitsPerPixel * this.camera.zoom;
    const height = definition.art.height * definition.art.worldUnitsPerPixel * this.camera.zoom;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Draw the calibrated arena exactly once. When the camera reveals space
    // beyond the capture, the dedicated stage backdrop remains visible rather
    // than stretched edge pixels that resemble a duplicated arena.
    ctx.drawImage(art, topLeft.x, topLeft.y, width, height);
    ctx.restore();
  }

  private drawFighter(fighter: FighterSnapshot): void {
    if (fighter.respawnFrames > 0 && Math.floor(fighter.respawnFrames / 4) % 2 === 0) return;
    const screen = this.worldToScreen(fighter.position);
    const palette = PALETTES[fighter.fighter];
    const scale = this.camera.zoom;
    const hurt = fighter.hitstunFrames > 0;
    const buried = fighter.statusEffect === "bury" && fighter.hitstunFrames > 0;
    const attacking = fighter.currentMove !== null;
    const exactAnimation = this.characterSprites.usesExactAnimations();
    const bob = !exactAnimation && fighter.grounded && !attacking
      ? Math.sin(this.elapsed * 5 + fighter.slot) * 2
      : 0;
    const lean = exactAnimation ? 0 : clamp(fighter.velocity.x / 18, -0.25, 0.25);

    const ctx = this.context;
    ctx.save();
    ctx.translate(screen.x, screen.y + bob * scale);
    ctx.scale(fighter.facing * scale, scale);
    this.drawFighterGroundShadow(fighter, exactAnimation);
    if (buried) {
      ctx.save();
      ctx.scale(fighter.facing, 1);
      ctx.fillStyle = "rgba(65, 48, 34, .72)";
      ctx.beginPath();
      ctx.ellipse(0, fighter.size.height * 0.46, fighter.size.width * 0.58, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.translate(0, fighter.size.height * 0.28);
      ctx.scale(1, 0.68);
    }
    ctx.rotate(
      fighter.visualRotation +
      lean +
      (hurt && !buried ? Math.sin(this.elapsed * 40) * 0.08 : 0),
    );

    this.drawActiveItemEffects(fighter);
    if (fighter.shield > 0 && fighter.state === "shield") this.drawShield(fighter, palette);
    this.drawCharacterModel(fighter, palette);
    this.drawHeldItem(fighter);

    if (fighter.currentMove?.includes("smash") || fighter.charge > 0.15) {
      const glow = clamp(fighter.charge, 0.15, 1);
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.35 + glow * 0.55;
      ctx.beginPath();
      ctx.arc(12, -4, 54 + Math.sin(this.elapsed * 16) * 4, -1.3, 1.35);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFighterGroundShadow(fighter: FighterSnapshot, exactAnimation: boolean): void {
    if (!fighter.grounded) return;
    const ctx = this.context;
    const width = GROUND_SHADOW_WIDTH[fighter.fighter];
    ctx.save();
    // Cancel the facing mirror so the shadow remains stable when turning.
    ctx.scale(fighter.facing, 1);
    ctx.translate(0, fighterShadowOffset(fighter.size.height, exactAnimation));
    ctx.scale(1, 0.25);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 1.22);
    shadow.addColorStop(0, "rgba(4, 8, 14, .38)");
    shadow.addColorStop(0.55, "rgba(4, 8, 14, .2)");
    shadow.addColorStop(1, "rgba(4, 8, 14, 0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, width * 1.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawActiveItemEffects(fighter: FighterSnapshot): void {
    const effects = fighter.activeEffects;
    const rings: string[] = [];
    if (effects.damageMultiplier > 1) rings.push("#ff513f");
    if (effects.speedMultiplier > 1) rings.push("#ffe455");
    if (effects.speedMultiplier < 1) rings.push("#75aaff");
    if (effects.defenseMultiplier < 1) rings.push("#d8e2ed");
    if (effects.projectileShieldFrames > 0) rings.push("#ffbd38");
    if (rings.length === 0) return;

    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = 0.62;
    rings.forEach((color, index) => {
      const radius = 48 + index * 7 + Math.sin(this.elapsed * 5 + index) * 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = index === rings.length - 1 ? 3 : 2;
      ctx.setLineDash([12 + index * 2, 8]);
      ctx.lineDashOffset = -this.elapsed * (26 + index * 7);
      ctx.beginPath();
      ctx.ellipse(0, -3, radius, radius * 1.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  private drawCharacterModel(fighter: FighterSnapshot, palette: Palette): void {
    const frame = this.characterSprites.frameFor(fighter, this.elapsed);
    if (frame) {
      if (fighter.fighter === "ice-climbers") {
        const nanaFrame = this.characterSprites.companionFrameFor(fighter, this.elapsed);
        if (nanaFrame) {
          // The combat engine owns one shared hurtbox, while the visual layer
          // keeps Nana's real Ultimate model synchronized behind Popo.
          this.context.save();
          this.context.translate(-34, 2);
          this.context.scale(0.92, 0.92);
          this.context.globalAlpha = 0.94;
          this.drawAnimatedCharacterSprite(fighter, nanaFrame, palette);
          this.context.restore();
        }
      }
      this.drawAnimatedCharacterSprite(
        fighter,
        frame,
        palette,
      );
      return;
    }

    // Exact mode deliberately has no legacy fallback: a slow first decode may
    // hide the fighter for a fraction of a second, but can never mix two art
    // styles or make the character appear to change identity.
    if (this.characterSprites.usesExactAnimations()) return;

    switch (fighter.fighter) {
      case "mario":
        this.drawMario(fighter, palette);
        break;
      case "link":
        this.drawLink(fighter, palette);
        break;
      case "samus":
        this.drawSamus(fighter, palette);
        break;
      case "pikachu":
        this.drawPikachu(fighter, palette);
        break;
      case "donkey-kong":
        this.drawDonkeyKong(fighter, palette);
        break;
    }
  }

  private drawAnimatedCharacterSprite(
    fighter: FighterSnapshot,
    frame: ResolvedCharacterFrame,
    palette: Palette,
  ): void {
    const ctx = this.context;
    const sprite = frame.image;
    const remote = frame.source === "remote";
    const localProfile = CHARACTER_RENDER_PROFILES[fighter.fighter];
    const sourceFrame = frame.sourceRect ?? {
      x: 0,
      y: 0,
      width: sprite.naturalWidth,
      height: sprite.naturalHeight,
    };
    const remotePixelScale = exactSpritePixelScale(fighter.fighter);
    const footOffset = fighterArtFootOffset(fighter.size.height, remote);
    const remoteReference = remote
      ? this.referenceBoundsForSprite(sprite, sourceFrame)
      : null;
    const profile = remote
      ? {
          crop: sourceFrame,
          width: sourceFrame.width * remotePixelScale,
          height: sourceFrame.height * remotePixelScale,
          x: -(sourceFrame.width * remotePixelScale) / 2,
          y: remoteReference
            ? footOffset - (remoteReference.y + remoteReference.height) * remotePixelScale
            : footOffset - sourceFrame.height * remotePixelScale,
        }
      : localProfile;

    ctx.save();
    // Correct the source basis before the outer world-facing transform. Open
    // renders currently face right; the private Melee atlases face left.
    if (remote && frame.sourceFacing === "left") ctx.scale(-1, 1);
    if (!remote) this.drawSpriteAccessoryBack(fighter, palette);
    const drawSpriteFrame = (): void => {
      if (profile.crop) {
        if (remote && this.drawExactSpriteFrame(
          sprite,
          profile.crop,
          profile,
        )) return;
        ctx.drawImage(
          sprite,
          profile.crop.x,
          profile.crop.y,
          profile.crop.width,
          profile.crop.height,
          profile.x,
          profile.y,
          profile.width,
          profile.height,
        );
      } else {
        ctx.drawImage(sprite, profile.x, profile.y, profile.width, profile.height);
      }
    };
    switch (remote ? null : fighter.fighter) {
      case "mario":
        ctx.filter = "none";
        break;
      case "link":
        ctx.filter = "none";
        break;
      case "samus":
        ctx.filter = "none";
        break;
      case "pikachu":
        ctx.filter = "brightness(0) saturate(100%) invert(83%) sepia(95%) saturate(1641%) hue-rotate(346deg) brightness(105%) contrast(103%)";
        break;
      case "donkey-kong":
        ctx.filter = "saturate(1.18) contrast(1.08)";
        break;
    }

    drawSpriteFrame();
    if (!remote && fighter.fighter === "pikachu") {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.globalCompositeOperation = "multiply";
      ctx.filter = "grayscale(1) contrast(1.38)";
      drawSpriteFrame();
      ctx.restore();
    }
    ctx.filter = "none";
    if (!remote) this.drawSpriteAccessoryFront(fighter, palette);
    ctx.restore();
  }

  private drawExactSpriteFrame(
    sprite: HTMLImageElement,
    crop: Readonly<{ x: number; y: number; width: number; height: number }>,
    profile: Readonly<{ x: number; y: number; width: number; height: number }>,
  ): boolean {
    const context = this.exactFrameContext;
    if (
      !context ||
      !Number.isFinite(crop.width) ||
      !Number.isFinite(crop.height) ||
      crop.width <= 0 ||
      crop.height <= 0
    ) return false;
    const frameWidth = Math.ceil(crop.width);
    const frameHeight = Math.ceil(crop.height);
    if (this.exactFrameCanvas.width !== frameWidth) this.exactFrameCanvas.width = frameWidth;
    if (this.exactFrameCanvas.height !== frameHeight) this.exactFrameCanvas.height = frameHeight;
    context.resetTransform();
    context.globalAlpha = 1;
    context.filter = "none";
    context.clearRect(0, 0, frameWidth, frameHeight);
    // `copy` also replaces fully transparent source pixels. Together with the
    // full-buffer clear, this prevents pixels from the previous atlas cell
    // leaking into the next exact frame when the backing size is unchanged.
    context.globalCompositeOperation = "copy";
    context.drawImage(
      sprite,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      frameWidth,
      frameHeight,
    );
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    this.context.drawImage(
      this.exactFrameCanvas,
      profile.x,
      profile.y,
      profile.width,
      profile.height,
    );
    return true;
  }

  private referenceBoundsForSprite(
    sprite: HTMLImageElement,
    source: SpriteBounds,
  ): SpriteBounds | null {
    const cacheKey = `${source.x}:${source.y}:${source.width}:${source.height}`;
    const spriteCache = this.spriteBounds.get(sprite);
    if (spriteCache?.has(cacheKey)) return spriteCache.get(cacheKey) ?? null;
    const context = this.spriteSampleContext;
    if (!context || source.width <= 0 || source.height <= 0) return null;
    if (this.spriteSampleCanvas.width !== source.width) this.spriteSampleCanvas.width = source.width;
    if (this.spriteSampleCanvas.height !== source.height) this.spriteSampleCanvas.height = source.height;
    context.clearRect(0, 0, source.width, source.height);
    context.drawImage(
      sprite,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      source.width,
      source.height,
    );
    try {
      const pixels = context.getImageData(0, 0, source.width, source.height).data;
      const bounds = findOpaquePixelBounds(pixels, source.width, source.height);
      const cache = spriteCache ?? new Map<string, SpriteBounds | null>();
      cache.set(cacheKey, bounds);
      if (!spriteCache) this.spriteBounds.set(sprite, cache);
      return bounds;
    } catch {
      return null;
    }
  }

  private drawSpriteAccessoryBack(fighter: FighterSnapshot, palette: Palette): void {
    const ctx = this.context;
    if (fighter.fighter === "link") {
      ctx.save();
      ctx.translate(-19, -3);
      ctx.rotate(-0.4);
      ctx.fillStyle = "#2f67a0";
      ctx.strokeStyle = "#f1d06a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (fighter.fighter === "pikachu") {
      ctx.save();
      ctx.fillStyle = palette.primary;
      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = 5;
      ctx.lineJoin = "bevel";
      ctx.beginPath();
      ctx.moveTo(-22, -7);
      ctx.lineTo(-50, -19);
      ctx.lineTo(-37, -37);
      ctx.lineTo(-64, -50);
      ctx.lineTo(-48, -15);
      ctx.lineTo(-63, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (fighter.fighter === "samus") {
      ctx.fillStyle = "#7e2919";
      ctx.beginPath();
      ctx.ellipse(-17, 4, 24, 37, -0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSpriteAccessoryFront(fighter: FighterSnapshot, palette: Palette): void {
    const ctx = this.context;
    switch (fighter.fighter) {
      case "mario": {
        ctx.fillStyle = "#2468cf";
        this.roundedRect(-17, -5, 34, 33, 9);
        ctx.fill();
        ctx.fillStyle = "#f8d448";
        ctx.beginPath();
        ctx.arc(-9, 2, 2.5, 0, Math.PI * 2);
        ctx.arc(9, 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.primary;
        ctx.beginPath();
        ctx.ellipse(-1, -59, 29, 13, -0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-26, -59, 48, 8);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-1, -61, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.primary;
        ctx.font = "900 10px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("M", -1, -57);
        ctx.fillStyle = "#4a2419";
        ctx.beginPath();
        ctx.ellipse(12, -42, 13, 5, 0.05, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "link": {
        ctx.fillStyle = "#3da65a";
        ctx.strokeStyle = "#1b5434";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-19, -29);
        ctx.lineTo(20, -29);
        ctx.lineTo(29, 25);
        ctx.lineTo(0, 19);
        ctx.lineTo(-28, 25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#35a95c";
        ctx.beginPath();
        ctx.moveTo(-23, -61);
        ctx.lineTo(37, -75);
        ctx.lineTo(15, -42);
        ctx.lineTo(-20, -42);
        ctx.closePath();
        ctx.fill();
        const attacking = fighter.currentMove !== null;
        ctx.save();
        ctx.translate(28, -8);
        ctx.rotate(attacking ? -0.92 + fighter.moveFrame * 0.09 : 0.18);
        ctx.fillStyle = "#eaf6ff";
        ctx.strokeStyle = "#284c78";
        ctx.lineWidth = 2;
        this.roundedRect(-4, -4, 8, 76, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#f2ca5a";
        ctx.fillRect(-13, -1, 26, 6);
        ctx.restore();
        break;
      }
      case "samus": {
        ctx.fillStyle = "#ef7026";
        ctx.strokeStyle = "#712719";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, -6, 28, 37, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#f3c73f";
        ctx.beginPath();
        ctx.moveTo(-18, -22);
        ctx.lineTo(0, -9);
        ctx.lineTo(19, -22);
        ctx.lineTo(12, 12);
        ctx.lineTo(-12, 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ef7026";
        ctx.beginPath();
        ctx.arc(0, -50, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#173441";
        ctx.beginPath();
        ctx.moveTo(-16, -56);
        ctx.lineTo(19, -55);
        ctx.lineTo(10, -39);
        ctx.lineTo(-11, -40);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        ctx.moveTo(-10, -52);
        ctx.lineTo(13, -51);
        ctx.lineTo(7, -44);
        ctx.lineTo(-7, -44);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#e95d22";
        this.roundedRect(22, -25, 43, 24, 11);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.arc(64, -13, 7, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "pikachu": {
        ctx.fillStyle = "#ef4b42";
        ctx.beginPath();
        ctx.arc(-12, -31, 7, 0, Math.PI * 2);
        ctx.arc(15, -31, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.dark;
        ctx.save();
        ctx.translate(-14, -69);
        ctx.rotate(-0.28);
        this.roundedRect(-6, -24, 12, 25, 6);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(16, -70);
        ctx.rotate(0.25);
        this.roundedRect(-6, -24, 12, 25, 6);
        ctx.fill();
        ctx.restore();
        if (fighter.currentMove?.includes("special")) {
          ctx.strokeStyle = palette.accent;
          ctx.lineWidth = 4;
          ctx.shadowColor = palette.accent;
          ctx.shadowBlur = 14;
          for (let index = 0; index < 3; index += 1) {
            ctx.beginPath();
            ctx.moveTo(-31 + index * 29, -68);
            ctx.lineTo(-22 + index * 29, -84);
            ctx.lineTo(-14 + index * 29, -68);
            ctx.stroke();
          }
        }
        break;
      }
      case "donkey-kong": {
        ctx.fillStyle = palette.secondary;
        ctx.strokeStyle = "#74232a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-9, -28);
        ctx.lineTo(18, -22);
        ctx.lineTo(8, 28);
        ctx.lineTo(-2, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = palette.accent;
        ctx.font = "900 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("DK", 5, -3);
        if (fighter.currentMove) {
          const punch = 15 + Math.sin(fighter.moveFrame * 0.5) * 10;
          ctx.fillStyle = palette.primary;
          ctx.beginPath();
          ctx.arc(43 + punch, -8, 19, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
  }

  private drawMario(fighter: FighterSnapshot, p: Palette): void {
    const ctx = this.context;
    const punch = fighter.currentMove?.includes("side") || fighter.currentMove === "jab" ? 25 : 0;
    ctx.fillStyle = "#4b241a";
    this.limb(-16, 19, -18, 49, 12);
    this.limb(15, 19, 18 + punch * 0.4, 49, 12);
    ctx.fillStyle = p.secondary;
    this.limb(-14, 8, -16, 34, 17);
    this.limb(13, 8, 15, 34, 17);
    ctx.fillStyle = p.primary;
    this.roundedRect(-25, -31, 50, 52, 18);
    ctx.fill();
    ctx.fillStyle = p.secondary;
    ctx.fillRect(-20, -6, 40, 31);
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(-10, 0, 3.5, 0, Math.PI * 2);
    ctx.arc(10, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.arc(0, -48, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a3422";
    ctx.beginPath();
    ctx.ellipse(13, -43, 15, 7, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.ellipse(-2, -64, 28, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-24, -64, 44, 10);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(8, -52, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#18366b";
    ctx.beginPath();
    ctx.arc(10, -52, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.primary;
    this.limb(-22, -20, -39, -2, 13);
    ctx.fillStyle = p.light;
    this.limb(25, -18, 39 + punch, -8, 13);
  }

  private drawLink(fighter: FighterSnapshot, p: Palette): void {
    const ctx = this.context;
    const swing = fighter.currentMove?.includes("attack") || fighter.currentMove?.includes("tilt") ? -0.8 : 0.18;
    ctx.fillStyle = "#463528";
    this.limb(-13, 19, -15, 50, 11);
    this.limb(13, 19, 15, 50, 11);
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.moveTo(-25, -29);
    ctx.lineTo(25, -29);
    ctx.lineTo(34, 29);
    ctx.lineTo(0, 21);
    ctx.lineTo(-33, 29);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#74452b";
    ctx.fillRect(-25, 3, 50, 8);
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.arc(0, -47, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d9b34e";
    ctx.beginPath();
    ctx.moveTo(-23, -58);
    ctx.lineTo(28, -67);
    ctx.lineTo(15, -45);
    ctx.lineTo(-21, -41);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.moveTo(-21, -66);
    ctx.lineTo(39, -80);
    ctx.lineTo(12, -44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(7, -52, 8, 5);
    ctx.fillStyle = "#2c6c92";
    ctx.fillRect(11, -52, 3, 5);
    ctx.save();
    ctx.translate(28, -12);
    ctx.rotate(swing);
    ctx.fillStyle = "#dceaff";
    ctx.fillRect(-4, -5, 8, 82);
    ctx.fillStyle = p.accent;
    ctx.fillRect(-13, -2, 26, 7);
    ctx.restore();
    ctx.fillStyle = "#3a6ea5";
    ctx.beginPath();
    ctx.arc(-26, -6, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d9c15f";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  private drawSamus(fighter: FighterSnapshot, p: Palette): void {
    const ctx = this.context;
    ctx.fillStyle = p.dark;
    this.limb(-14, 15, -17, 50, 15);
    this.limb(14, 15, 17, 50, 15);
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.ellipse(0, -5, 29, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.secondary;
    ctx.beginPath();
    ctx.moveTo(-20, -28);
    ctx.lineTo(0, -12);
    ctx.lineTo(20, -28);
    ctx.lineTo(13, 11);
    ctx.lineTo(-13, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.arc(0, -51, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.dark;
    ctx.beginPath();
    ctx.moveTo(-18, -58);
    ctx.lineTo(21, -57);
    ctx.lineTo(11, -38);
    ctx.lineTo(-13, -40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.moveTo(-12, -54);
    ctx.lineTo(14, -53);
    ctx.lineTo(8, -43);
    ctx.lineTo(-8, -44);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.secondary;
    ctx.beginPath();
    ctx.arc(-30, -19, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(29, -18, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.primary;
    ctx.save();
    ctx.translate(37, -11);
    ctx.rotate(fighter.currentMove?.includes("special") ? -0.25 : 0.12);
    this.roundedRect(0, -12, 48, 25, 12);
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(47, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPikachu(fighter: FighterSnapshot, p: Palette): void {
    const ctx = this.context;
    const attack = fighter.currentMove !== null;
    ctx.strokeStyle = p.secondary;
    ctx.lineWidth = 10;
    ctx.lineJoin = "bevel";
    ctx.beginPath();
    ctx.moveTo(-18, 5);
    ctx.lineTo(-43, -2);
    ctx.lineTo(-30, -18);
    ctx.lineTo(-55, -31);
    ctx.stroke();
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.ellipse(0, 8, 29, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, -34, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(-9, -52);
    ctx.rotate(-0.22);
    this.roundedRect(-7, -40, 14, 51, 8);
    ctx.fill();
    ctx.fillStyle = p.dark;
    this.roundedRect(-7, -40, 14, 15, 7);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(20, -51);
    ctx.rotate(0.22);
    ctx.fillStyle = p.primary;
    this.roundedRect(-7, -40, 14, 51, 8);
    ctx.fill();
    ctx.fillStyle = p.dark;
    this.roundedRect(-7, -40, 14, 15, 7);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = p.dark;
    ctx.beginPath();
    ctx.arc(-5, -39, 4.5, 0, Math.PI * 2);
    ctx.arc(15, -39, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e94b43";
    ctx.beginPath();
    ctx.arc(-17, -29, 7, 0, Math.PI * 2);
    ctx.arc(27, -29, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(5, -29, 7, 0.2, Math.PI - 0.2);
    ctx.stroke();
    if (attack) {
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-35 + i * 28, -69);
        ctx.lineTo(-25 + i * 28, -82);
        ctx.lineTo(-17 + i * 28, -67);
        ctx.stroke();
      }
    }
  }

  private drawDonkeyKong(fighter: FighterSnapshot, p: Palette): void {
    const ctx = this.context;
    const slam = fighter.currentMove?.includes("down") || fighter.currentMove?.includes("smash");
    ctx.fillStyle = p.dark;
    this.limb(-23, 9, -29, 51, 19);
    this.limb(22, 9, 28, 51, 19);
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.ellipse(0, -6, 42, 49, 0, 0, Math.PI * 2);
    ctx.fill();
    this.limb(-31, -22, -58, slam ? 30 : 13, 24);
    this.limb(31, -22, 58, slam ? 30 : 13, 24);
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.ellipse(5, -43, 31, 27, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(17, -35, 25, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-2, -50, 7, 0, Math.PI * 2);
    ctx.arc(13, -50, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.dark;
    ctx.beginPath();
    ctx.arc(0, -49, 3, 0, Math.PI * 2);
    ctx.arc(15, -49, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.secondary;
    ctx.beginPath();
    ctx.moveTo(-12, -21);
    ctx.lineTo(18, -13);
    ctx.lineTo(9, 27);
    ctx.lineTo(-4, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.font = "900 11px system-ui";
    ctx.fillText("CC", 2, 1);
  }

  private drawShield(fighter: FighterSnapshot, palette: Palette): void {
    const ctx = this.context;
    const strength = clamp(fighter.shield / 100, 0.2, 1);
    const radius = 56 * (0.72 + strength * 0.28);
    ctx.save();
    ctx.globalAlpha = 0.26 + strength * 0.3;
    const gradient = ctx.createRadialGradient(0, -8, 5, 0, -8, radius);
    gradient.addColorStop(0, "rgba(255,255,255,.8)");
    gradient.addColorStop(0.5, palette.accent);
    gradient.addColorStop(1, palette.primary);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -8, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawProjectile(projectile: ProjectileSnapshot): void {
    const raw = projectile as unknown as Record<string, unknown>;
    const position = raw.position as Vec2;
    if (!position) return;
    const screen = this.worldToScreen(position);
    const radius = Number(raw.radius ?? 15) * this.camera.zoom;
    const kind = String(raw.kind ?? raw.type ?? "energy");
    const slot = Number(raw.owner ?? raw.slot ?? 0) as PlayerSlot;
    const ctx = this.context;
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.shadowBlur = 24;
    ctx.shadowColor = kind.includes("electric") ? "#8cecff" : slot === 0 ? "#ff634f" : "#55ccff";
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.7);
    gradient.addColorStop(0, "#fffde6");
    gradient.addColorStop(0.38, kind.includes("electric") ? "#74ebff" : "#ffd44d");
    gradient.addColorStop(1, kind.includes("bomb") ? "#622650" : "rgba(255,77,55,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawItem(item: ItemSnapshot): void {
    const screen = this.worldToScreen(item.position);
    const definition = ITEM_DEFINITIONS[item.kind];
    const image = this.itemArt.get(item.kind);
    const ctx = this.context;
    ctx.save();
    const bob = item.mode === "trap" ? 0 : Math.sin(this.elapsed * 4 + item.position.x) * 5;
    ctx.translate(screen.x, screen.y + bob);
    if (item.mode !== "trap") ctx.rotate(this.elapsed * (item.mode === "thrown" ? 3.4 : 0.7));
    const size = item.mode === "trap" ? 52 : 48;
    ctx.shadowColor = definition.color;
    ctx.shadowBlur = item.mode === "trap" ? 10 : 20;
    if (image?.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = definition.color;
      this.roundedRect(-size / 2, -size / 2, size, size, 9);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (item.mode === "trap") {
      ctx.strokeStyle = "rgba(255,255,255,.72)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHeldItem(fighter: FighterSnapshot): void {
    const held = fighter.heldItem;
    if (!held) return;
    const image = this.itemArt.get(held.kind);
    const definition = ITEM_DEFINITIONS[held.kind];
    const ctx = this.context;
    ctx.save();
    ctx.translate(48, -10);
    ctx.rotate(Math.sin(this.elapsed * 4.5) * 0.08);
    ctx.shadowColor = definition.color;
    ctx.shadowBlur = 14;
    if (image?.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, -21, -21, 42, 42);
    } else {
      ctx.fillStyle = definition.color;
      this.roundedRect(-18, -18, 36, 36, 8);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawCountdown(snapshot: GameSnapshot): void {
    if (snapshot.phase !== "countdown") return;
    const seconds = Math.max(1, Math.ceil(snapshot.countdownFrames / 60));
    const entrance = seconds > 3;
    const progress = (snapshot.countdownFrames % 60) / 60;
    const scale = 1 + progress * 0.35;
    const ctx = this.context;
    ctx.save();
    ctx.translate(this.width / 2, this.height * 0.42);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(8,17,46,.7)";
    ctx.shadowBlur = 24;
    ctx.lineWidth = 16;
    ctx.strokeStyle = "#101c43";
    ctx.font = entrance
      ? "950 96px Impact, Haettenschweiler, sans-serif"
      : "950 176px Impact, Haettenschweiler, sans-serif";
    const label = entrance ? "READY?" : String(seconds);
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = seconds === 1 ? "#ffde54" : "#ffffff";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  private drawGo(): void {
    if (this.goTimer <= 0) return;
    const progress = 1 - this.goTimer;
    const ctx = this.context;
    ctx.save();
    ctx.translate(this.width / 2, this.height * 0.42);
    ctx.scale(0.72 + progress * 0.75, 0.72 + progress * 0.75);
    ctx.globalAlpha = Math.min(1, this.goTimer * 2.5);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "950 186px Impact, Haettenschweiler, sans-serif";
    ctx.lineWidth = 18;
    ctx.strokeStyle = "#35120d";
    ctx.shadowColor = "#ff3a24";
    ctx.shadowBlur = 30;
    ctx.strokeText("GO !", 0, 0);
    ctx.fillStyle = "#ffd72e";
    ctx.fillText("GO !", 0, 0);
    ctx.restore();
  }

  private drawOffscreenIndicators(snapshot: GameSnapshot): void {
    const ctx = this.context;
    snapshot.fighters.forEach((fighter) => {
      if (fighter.respawnFrames > 0) return;
      const screen = this.worldToScreen(fighter.position);
      const margin = 66;
      const visualLeft = screen.x - fighter.size.width * 0.6 * this.camera.zoom;
      const visualRight = screen.x + fighter.size.width * 0.6 * this.camera.zoom;
      const visualTop = screen.y - fighter.size.height * 0.67 * this.camera.zoom;
      const visualBottom = screen.y + fighter.size.height * 0.5 * this.camera.zoom;
      const offscreen =
        visualLeft < 0 ||
        visualRight > this.width ||
        visualTop < 0 ||
        visualBottom > this.height - 96;
      if (!offscreen) return;
      const x = clamp(screen.x, margin, this.width - margin);
      const y = clamp(screen.y, margin, this.height - 130);
      const p = PALETTES[fighter.fighter];
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = p.primary;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`P${fighter.slot + 1}`, 0, 1);
      ctx.restore();
    });
  }

  private roundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.context.beginPath();
    this.context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  }

  private limb(x1: number, y1: number, x2: number, y2: number, width: number): void {
    const ctx = this.context;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

}
