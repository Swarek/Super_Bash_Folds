import type { FighterId, OpenFighterId, SkinId } from "./contracts";
import { OPEN_FIGHTER_PACKS } from "./generated/openFighterRegistry";

export interface FighterVisualManifest {
  fighter: FighterId;
  sourceKind: "open-3d" | "open-2d";
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

export const FIGHTER_VISUAL_MANIFESTS = Object.fromEntries(
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
) as unknown as Readonly<Record<FighterId, FighterVisualManifest>>;

export const isFighterVisualReady = (fighter: FighterId): boolean =>
  OPEN_FIGHTER_RUNTIME_STATUS[fighter]?.visualReady === true;

export const isFighterProductionReady = (fighter: FighterId): boolean =>
  OPEN_FIGHTER_RUNTIME_STATUS[fighter]?.productionReady === true;

export const CHARACTER_PORTRAITS = Object.fromEntries(
  Object.entries(FIGHTER_VISUAL_MANIFESTS).map(([fighter, manifest]) => [
    fighter,
    `${manifest.portraitRoot}/00.png`,
  ]),
) as Readonly<Record<FighterId, string>>;
