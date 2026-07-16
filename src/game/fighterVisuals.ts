import {
  MELEE_FIGHTER_ID_CATALOG,
  isMeleeFighterEnabled,
  isMeleeFighterId,
  type FighterId,
  type OpenFighterId,
  type SkinId,
} from "./contracts";
import { OPEN_FIGHTER_PACKS } from "./generated/openFighterRegistry";

const ALL_SKIN_IDS = ["00", "01", "02", "03"] as const satisfies readonly SkinId[];

export interface FighterVisualManifest {
  fighter: FighterId;
  sourceKind: "private-3d" | "open-3d" | "open-2d";
  atlasRoot: string;
  portraitRoot: string;
  sourceFacing: "left" | "right";
  availableSkins: readonly SkinId[];
  attribution: string;
  sourcePage: string;
  license: { id: string; url?: string };
}

interface FighterRuntimeStatus {
  visualReady: boolean;
  productionReady: boolean;
}

const OPEN_FIGHTER_RUNTIME_STATUS = __OPEN_FIGHTER_RUNTIME_STATUS__ as Readonly<
  Partial<Record<OpenFighterId, FighterRuntimeStatus>>
>;
const PRIVATE_SOURCE_PAGE = "https://gitlab.com/Worldblender/smash-ultimate-models-exported";

const privateVisualManifest = (
  fighter: (typeof MELEE_FIGHTER_ID_CATALOG)[number],
): FighterVisualManifest => ({
  fighter,
  sourceKind: "private-3d",
  atlasRoot: `/assets/characters/ultimate-sheets-native/${fighter}`,
  portraitRoot: `/assets/ui/fighters/${fighter}/select`,
  sourceFacing: "left",
  availableSkins: ALL_SKIN_IDS,
  attribution: "Local SSBU files supplied by the user",
  sourcePage: PRIVATE_SOURCE_PAGE,
  license: { id: "private-content" },
});

const openVisualManifests = Object.fromEntries(
  OPEN_FIGHTER_PACKS.map((pack) => [pack.id, {
    fighter: pack.id,
    sourceKind: pack.kind === "3d" ? "open-3d" : "open-2d",
    atlasRoot: `/assets/characters/open/${pack.id}`,
    portraitRoot: `/assets/ui/fighters/${pack.id}/select`,
    sourceFacing: pack.visual.sourceFacing,
    availableSkins: ["00"],
    attribution: pack.visual.attribution,
    sourcePage: pack.visual.sourcePage,
    license: pack.visual.license,
  } satisfies FighterVisualManifest]),
) as unknown as Readonly<Record<OpenFighterId, FighterVisualManifest>>;

export const FIGHTER_VISUAL_MANIFESTS = {
  ...Object.fromEntries(
    MELEE_FIGHTER_ID_CATALOG.map((fighter) => [fighter, privateVisualManifest(fighter)]),
  ),
  ...openVisualManifests,
} as Readonly<Record<FighterId, FighterVisualManifest>>;

export const isFighterVisualReady = (fighter: FighterId): boolean =>
  isMeleeFighterId(fighter)
    ? isMeleeFighterEnabled(fighter)
    : OPEN_FIGHTER_RUNTIME_STATUS[fighter]?.visualReady === true;

export const isFighterProductionReady = (fighter: FighterId): boolean =>
  !isMeleeFighterId(fighter) &&
  OPEN_FIGHTER_RUNTIME_STATUS[fighter]?.productionReady === true;

export const CHARACTER_PORTRAITS = Object.fromEntries(
  Object.entries(FIGHTER_VISUAL_MANIFESTS).map(([fighter, manifest]) => [
    fighter,
    `${manifest.portraitRoot}/00.png`,
  ]),
) as Readonly<Record<FighterId, string>>;
