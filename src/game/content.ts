import { FIGHTER_IDS, type FighterId, type SkinId } from "./contracts";
import {
  FIGHTER_VISUAL_MANIFESTS,
  isFighterProductionReady,
  isFighterVisualReady,
} from "./fighterVisuals";

export interface FighterSkinDefinition {
  id: SkinId;
  label: string;
  portrait: string;
  filter: string;
  /** All 50 runtime atlases exist, so the fighter can be selected as a prototype. */
  visualReady: boolean;
  /** Every runtime animation is directly covered and suitable for publication. */
  productionReady: boolean;
}

export const SKIN_IDS = ["00", "01", "02", "03"] as const satisfies readonly SkinId[];

const labels: Record<SkinId, string> = {
  "00": "Classique",
  "01": "Alternative 1",
  "02": "Alternative 2",
  "03": "Alternative 3",
};

const skinsFor = (fighter: FighterId): readonly FighterSkinDefinition[] => {
  const manifest = FIGHTER_VISUAL_MANIFESTS[fighter];
  return manifest.availableSkins.map((id) => ({
    id,
    label: labels[id],
    portrait: `${manifest.portraitRoot}/${id}.png`,
    // Gameplay uses separately rendered materials. Keep this compatibility
    // field neutral so callers never recolour skin, eyes, weapons or armour.
    filter: "none",
    visualReady: isFighterVisualReady(fighter),
    productionReady: isFighterProductionReady(fighter),
  }));
};

export const FIGHTER_SKINS = Object.fromEntries(
  FIGHTER_IDS.map((fighter) => [fighter, skinsFor(fighter)]),
) as Readonly<Record<FighterId, readonly FighterSkinDefinition[]>>;

export const getFighterSkin = (
  fighter: FighterId,
  skin: SkinId,
): FighterSkinDefinition =>
  FIGHTER_SKINS[fighter].find((candidate) => candidate.id === skin) ??
  FIGHTER_SKINS[fighter][0]!;

export const getFighterSkins = (
  fighter: FighterId,
): readonly FighterSkinDefinition[] => FIGHTER_SKINS[fighter];

export const isFighterSkinId = (
  fighter: FighterId,
  value: string | undefined,
): value is SkinId =>
  value !== undefined && FIGHTER_SKINS[fighter].some(({ id }) => id === value);
