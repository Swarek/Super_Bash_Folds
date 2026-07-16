import type { PrivateStageId } from "./contracts";
import type {
  StageArtCalibration,
  StageDefinition,
  StagePlatformDefinition,
  StageSceneDefinition,
} from "./stages";

export const PRIVATE_STAGE_IDS = [
  "battlefield",
  "pokemon-stadium",
  "hyrule-castle",
] as const satisfies readonly PrivateStageId[];

const art = (
  width: number,
  height: number,
  originPx: Readonly<{ x: number; y: number }>,
  worldUnitsPerPixel: number,
): StageArtCalibration => ({ width, height, originPx, worldUnitsPerPixel });

const surfaceFromPixels = (
  calibration: StageArtCalibration,
  id: string,
  from: readonly [number, number],
  to: readonly [number, number],
  kind: "ground" | "platform",
  height = kind === "ground" ? 52 : 24,
): StagePlatformDefinition => {
  const scale = calibration.worldUnitsPerPixel;
  const leftX = (from[0] - calibration.originPx.x) * scale;
  const rightX = (to[0] - calibration.originPx.x) * scale;
  const leftY = (calibration.originPx.y - from[1]) * scale;
  const rightY = (calibration.originPx.y - to[1]) * scale;
  return {
    id,
    x: (leftX + rightX) / 2,
    y: (leftY + rightY) / 2 - height / 2,
    width: Math.abs(rightX - leftX),
    height,
    kind,
    surfaceY: [leftY, rightY],
  };
};

const nativeScene = (
  id: PrivateStageId,
  targetWidth: number,
  sourceWidth: number,
  sourceCenterX: number,
  worldOffsetY: number,
  cameraDirection: -1 | 1,
): StageSceneDefinition => {
  const scale = targetWidth / sourceWidth;
  return {
    url: `/assets/stages/${id}/scene.glb`,
    scale,
    offset: { x: sourceCenterX === 0 ? 0 : -sourceCenterX * scale, y: worldOffsetY },
    cameraDirection,
  };
};

const privateLicense = {
  attribution: "Nintendo content — private local overlay only",
  id: "private-content",
} as const;

const battlefieldArt = art(1920, 1080, { x: 960, y: 505 }, 0.93);
const pokemonArt = art(1920, 1080, { x: 960, y: 686 }, 0.91);
const hyruleArt = art(1920, 1080, { x: 960, y: 641 }, 0.93);

/**
 * Local-only definitions recovered from the pre-public checkpoint
 * cf61aa4b22591c6c564d867ce769bb33ba5ae10c. Asset URLs deliberately remain
 * plain public-directory paths: a public build can tree-shake this module and
 * never resolves, copies or imports the ignored Nintendo overlay.
 */
export const PRIVATE_STAGE_DEFINITIONS: Readonly<
  Record<PrivateStageId, StageDefinition>
> = {
  battlefield: {
    id: "battlefield",
    displayName: "Battlefield",
    series: "Super Smash Bros.",
    identity: "Three platforms for vertical combos",
    previewUrl: "/assets/stages/battlefield/preview.png",
    thumbnailUrl: "/assets/stages/battlefield/preview.thumb.webp",
    renderUrl: "/assets/stages/battlefield/arena.webp",
    backdropUrl: "/assets/stages/battlefield/backdrop.webp",
    scene: nativeScene("battlefield", 1112, 167.787094, -3.74015, 0, 1),
    art: battlefieldArt,
    platforms: [
      surfaceFromPixels(battlefieldArt, "main", [362, 505], [1558, 505], "ground", 210),
      surfaceFromPixels(battlefieldArt, "left", [506, 329], [790, 329], "platform"),
      surfaceFromPixels(battlefieldArt, "right", [1132, 329], [1415, 329], "platform"),
      surfaceFromPixels(battlefieldArt, "top", [824, 151], [1098, 151], "platform"),
    ],
    ledges: [
      { platformId: "main", side: "left" },
      { platformId: "main", side: "right" },
    ],
    spawns: [{ x: -186, y: 110 }, { x: 186, y: 110 }],
    blastZone: { left: -1_200, right: 1_200, top: 1_100, bottom: -750 },
    colors: { edge: "#ffe9a6", surface: "#82dbe5", body: "#46678f", shadow: "#17233e" },
    license: privateLicense,
  },
  "pokemon-stadium": {
    id: "pokemon-stadium",
    displayName: "Pokémon Stadium",
    series: "Pokémon",
    identity: "Long central floor with two stadium platforms",
    previewUrl: "/assets/stages/pokemon-stadium/preview.png",
    thumbnailUrl: "/assets/stages/pokemon-stadium/preview.thumb.webp",
    renderUrl: "/assets/stages/pokemon-stadium/arena.webp",
    backdropUrl: "/assets/stages/pokemon-stadium/backdrop.webp",
    scene: nativeScene("pokemon-stadium", 1401, 140.705383, 0, 0, -1),
    art: pokemonArt,
    platforms: [
      surfaceFromPixels(pokemonArt, "main", [190, 686], [1730, 686], "ground", 170),
      surfaceFromPixels(pokemonArt, "left", [560, 542], [790, 542], "platform"),
      surfaceFromPixels(pokemonArt, "right", [1130, 542], [1360, 542], "platform"),
    ],
    ledges: [
      { platformId: "main", side: "left" },
      { platformId: "main", side: "right" },
    ],
    spawns: [{ x: -250, y: 110 }, { x: 250, y: 110 }],
    blastZone: { left: -1_400, right: 1_400, top: 1_000, bottom: -800 },
    colors: { edge: "#f5fbff", surface: "#58c86c", body: "#49515d", shadow: "#11151c" },
    license: privateLicense,
  },
  "hyrule-castle": {
    id: "hyrule-castle",
    displayName: "Hyrule Castle",
    series: "The Legend of Zelda",
    identity: "Sloped roofs, a central tower, and asymmetric levels",
    previewUrl: "/assets/stages/hyrule-castle/preview.png",
    thumbnailUrl: "/assets/stages/hyrule-castle/preview.thumb.webp",
    renderUrl: "/assets/stages/hyrule-castle/arena.webp",
    backdropUrl: "/assets/stages/hyrule-castle/backdrop.webp",
    scene: nativeScene("hyrule-castle", 1670, 302.636978, 2.453499, -168, 1),
    art: hyruleArt,
    platforms: [
      surfaceFromPixels(hyruleArt, "main", [458, 641], [1294, 641], "ground", 190),
      surfaceFromPixels(hyruleArt, "west-roof", [75, 840], [458, 641], "ground", 220),
      surfaceFromPixels(hyruleArt, "east-floor", [1232, 840], [1870, 840], "ground", 210),
      surfaceFromPixels(hyruleArt, "east-roof-left", [1518, 814], [1600, 706], "ground", 120),
      surfaceFromPixels(hyruleArt, "east-roof-right", [1600, 706], [1695, 814], "ground", 120),
      surfaceFromPixels(hyruleArt, "tower-low", [916, 471], [1045, 471], "platform"),
      surfaceFromPixels(hyruleArt, "tower-high", [916, 306], [1020, 306], "platform"),
    ],
    ledges: [
      { platformId: "west-roof", side: "left" },
      { platformId: "east-floor", side: "right" },
    ],
    spawns: [{ x: -250, y: 120 }, { x: 120, y: 120 }],
    blastZone: { left: -1_450, right: 1_450, top: 1_150, bottom: -900 },
    colors: { edge: "#e8e0cb", surface: "#8f9d73", body: "#6e645d", shadow: "#282630" },
    license: privateLicense,
  },
};
