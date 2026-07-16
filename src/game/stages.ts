import type { StageId } from "./contracts";
import {
  DEFAULT_STAGE_ID as DEFAULT_OPEN_STAGE_ID,
  OPEN_STAGE_IDS,
  OPEN_STAGE_PACKS,
} from "./generated/openStageRegistry";

export interface StageArtCalibration {
  readonly width: number;
  readonly height: number;
  readonly originPx: Readonly<{ x: number; y: number }>;
  readonly worldUnitsPerPixel: number;
}

export interface StagePlatformDefinition {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Solid extrusion depth for ground; visual thickness for one-way platforms. */
  height: number;
  kind: "ground" | "platform";
  /** Playable surface height at the left and right edge, in world units. */
  surfaceY?: readonly [number, number];
}

export interface StageLedgeDefinition {
  /** Solid ground volume that owns this grabbable edge. */
  platformId: string;
  /** Outer edge of that volume; platforms do not become ledges implicitly. */
  side: "left" | "right";
}

export interface StageSceneDefinition {
  readonly url: string;
  readonly scale: number;
  readonly offset: Readonly<{ x: number; y: number }>;
  readonly cameraDirection: -1 | 1;
}

export interface StageDefinition {
  id: StageId;
  displayName: string;
  series: string;
  identity: string;
  previewUrl: string;
  thumbnailUrl: string;
  /** High-resolution, gameplay-calibrated arena art and WebGL fallback. */
  renderUrl: string;
  /** Scenery filling the viewport beyond the calibrated arena art. */
  backdropUrl: string;
  /** Optional native geometry. Static 2D packs deliberately omit it. */
  scene?: StageSceneDefinition;
  art: StageArtCalibration;
  platforms: readonly StagePlatformDefinition[];
  ledges: readonly StageLedgeDefinition[];
  spawns: readonly [{ x: number; y: number }, { x: number; y: number }];
  blastZone: Readonly<{ left: number; right: number; top: number; bottom: number }>;
  colors: Readonly<{ edge: string; surface: string; body: string; shadow: string }>;
  license: Readonly<{
    attribution: string;
    id: string;
    sourcePage?: string;
    url?: string;
  }>;
}

export const STAGE_IDS = [...OPEN_STAGE_IDS] satisfies readonly StageId[];

export const DEFAULT_STAGE_ID: StageId = STAGE_IDS[0] ?? DEFAULT_OPEN_STAGE_ID;

interface GeneratedStagePack {
  readonly id: StageId;
  readonly identity: Readonly<{
    displayName: string;
    series: string;
    description: string;
  }>;
  readonly gameplay: Readonly<{
    platforms: readonly StagePlatformDefinition[];
    ledges: readonly StageLedgeDefinition[];
    spawns: readonly [{ x: number; y: number }, { x: number; y: number }];
    blastZone: StageDefinition["blastZone"];
  }>;
  readonly render: Readonly<{
    kind: "2d" | "3d";
    art: StageArtCalibration;
    scene?: Readonly<{
      scale: number;
      offset: Readonly<{ x: number; y: number }>;
      cameraDirection: -1 | 1;
    }>;
  }>;
  readonly colors: StageDefinition["colors"];
  readonly license: StageDefinition["license"];
  readonly runtime: Readonly<{
    previewUrl: string;
    thumbnailUrl: string;
    arenaUrl: string;
    backdropUrl: string;
    sceneUrl?: string;
  }>;
}

const generatedStagePacks = OPEN_STAGE_PACKS as unknown as readonly GeneratedStagePack[];

const openStageDefinitions = generatedStagePacks.map((pack): StageDefinition => ({
  id: pack.id,
  displayName: pack.identity.displayName,
  series: pack.identity.series,
  identity: pack.identity.description,
  previewUrl: pack.runtime.previewUrl,
  thumbnailUrl: pack.runtime.thumbnailUrl,
  renderUrl: pack.runtime.arenaUrl,
  backdropUrl: pack.runtime.backdropUrl,
  ...(pack.render.kind === "3d" && pack.render.scene && pack.runtime.sceneUrl ? {
    scene: {
      url: pack.runtime.sceneUrl,
      scale: pack.render.scene.scale,
      offset: pack.render.scene.offset,
      cameraDirection: pack.render.scene.cameraDirection,
    },
  } : {}),
  art: pack.render.art,
  platforms: pack.gameplay.platforms,
  ledges: pack.gameplay.ledges,
  spawns: pack.gameplay.spawns,
  blastZone: pack.gameplay.blastZone,
  colors: pack.colors,
  license: pack.license,
}));

export const STAGE_DEFINITIONS = Object.fromEntries(
  openStageDefinitions.map((definition) => [definition.id, definition]),
) as Readonly<Record<StageId, StageDefinition>>;

export const getStageDefinition = (id: StageId): StageDefinition =>
  STAGE_DEFINITIONS[id];

export const stageSurfaceYAt = (
  platform: Pick<StagePlatformDefinition, "x" | "y" | "width" | "height" | "surfaceY">,
  worldX: number,
): number => {
  const fallback = platform.y + platform.height / 2;
  const [leftY, rightY] = platform.surfaceY ?? [fallback, fallback];
  if (platform.width <= 0) return (leftY + rightY) / 2;
  const leftX = platform.x - platform.width / 2;
  const ratio = Math.max(0, Math.min(1, (worldX - leftX) / platform.width));
  return leftY + (rightY - leftY) * ratio;
};

export const stagePixelToWorld = (
  stage: StageId,
  point: Readonly<{ x: number; y: number }>,
): { x: number; y: number } => {
  const calibration = STAGE_DEFINITIONS[stage].art;
  return {
    x: (point.x - calibration.originPx.x) * calibration.worldUnitsPerPixel,
    y: (calibration.originPx.y - point.y) * calibration.worldUnitsPerPixel,
  };
};

export const stageWorldToPixel = (
  stage: StageId,
  point: Readonly<{ x: number; y: number }>,
): { x: number; y: number } => {
  const calibration = STAGE_DEFINITIONS[stage].art;
  return {
    x: point.x / calibration.worldUnitsPerPixel + calibration.originPx.x,
    y: calibration.originPx.y - point.y / calibration.worldUnitsPerPixel,
  };
};
