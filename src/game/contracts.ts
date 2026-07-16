import {
  OPEN_2D_FIGHTER_IDS,
  OPEN_3D_FIGHTER_IDS,
} from "./generated/openFighterRegistry";
import { OPEN_STAGE_IDS } from "./generated/openStageRegistry";

export { OPEN_2D_FIGHTER_IDS, OPEN_3D_FIGHTER_IDS, OPEN_STAGE_IDS };

/** Canonical private Melee roster order. Kept separate from distributable content. */
export const MELEE_FIGHTER_ID_CATALOG = [
  "dr-mario",
  "mario",
  "luigi",
  "bowser",
  "peach",
  "yoshi",
  "donkey-kong",
  "captain-falcon",
  "ganondorf",
  "falco",
  "fox",
  "ness",
  "ice-climbers",
  "kirby",
  "samus",
  "zelda",
  "sheik",
  "link",
  "young-link",
  "pichu",
  "pikachu",
  "jigglypuff",
  "mewtwo",
  "mr-game-and-watch",
  "marth",
  "roy",
] as const;

export type MeleeFighterId = (typeof MELEE_FIGHTER_ID_CATALOG)[number];

const injectedPrivateFighterIds = Array.isArray(__PRIVATE_FIGHTER_IDS__)
  ? (__PRIVATE_FIGHTER_IDS__ as readonly unknown[])
  : [];

/** Private fighters enabled only when their complete, local-only visual pack is present. */
export const MELEE_FIGHTER_IDS = MELEE_FIGHTER_ID_CATALOG.filter((fighter) =>
  injectedPrivateFighterIds.includes(fighter)
) as readonly MeleeFighterId[];

/** All distributable fighters, regardless of their source rendering pipeline. */
export const OPEN_FIGHTER_IDS = [
  ...OPEN_3D_FIGHTER_IDS,
  ...OPEN_2D_FIGHTER_IDS,
] as const;

/** Runtime roster order used by gameplay and content-driven UI surfaces. */
export const FIGHTER_IDS = [
  ...MELEE_FIGHTER_IDS,
  ...OPEN_FIGHTER_IDS,
] as const;

export type Open3DFighterId = (typeof OPEN_3D_FIGHTER_IDS)[number];
export type Open2DFighterId = (typeof OPEN_2D_FIGHTER_IDS)[number];
export type OpenFighterId = (typeof OPEN_FIGHTER_IDS)[number];
export type FighterId = (typeof FIGHTER_IDS)[number];

export const isMeleeFighterId = (fighter: FighterId): fighter is MeleeFighterId =>
  (MELEE_FIGHTER_ID_CATALOG as readonly FighterId[]).includes(fighter);

export const isMeleeFighterEnabled = (fighter: FighterId): boolean =>
  (MELEE_FIGHTER_IDS as readonly FighterId[]).includes(fighter);

export const isOpenFighterId = (fighter: FighterId): fighter is OpenFighterId =>
  (OPEN_FIGHTER_IDS as readonly FighterId[]).includes(fighter);

export const isOpen2DFighterId = (fighter: FighterId): fighter is Open2DFighterId =>
  (OPEN_2D_FIGHTER_IDS as readonly FighterId[]).includes(fighter);

export const isOpen3DFighterId = (fighter: FighterId): fighter is Open3DFighterId =>
  (OPEN_3D_FIGHTER_IDS as readonly FighterId[]).includes(fighter);

export type PlayerSlot = 0 | 1;

export type SkinId = "00" | "01" | "02" | "03";

export type OpenStageId = (typeof OPEN_STAGE_IDS)[number];
export type PrivateStageId = "battlefield" | "pokemon-stadium" | "hyrule-castle";
export type StageId = OpenStageId | PrivateStageId;

export type ActionName =
  | "left"
  | "right"
  | "up"
  | "down"
  | "jump"
  | "attack"
  | "special"
  | "shield"
  | "grab"
  | "pause";

export type BindingMap = Record<ActionName, string>;

export interface InputFrame {
  held: Set<ActionName>;
  pressed: Set<ActionName>;
  released: Set<ActionName>;
  direction: { x: number; y: number };
  /** True when direction comes from an analogue stick rather than digital keys. */
  analog?: boolean;
}

export interface PlayerSetup {
  fighter: FighterId;
  skin: SkinId;
  name: string;
  slot: PlayerSlot;
  cpu: boolean;
  cpuLevel: 1 | 2 | 3;
}

export interface GameSettings {
  musicVolume: number;
  effectsVolume: number;
  shake: number;
  flashes: number;
  items: boolean;
  itemFrequency: "low" | "medium" | "high";
  bindings: [BindingMap, BindingMap];
  tutorialSeen: boolean;
}

export interface MatchConfig {
  players: [PlayerSetup, PlayerSetup];
  stocks: number;
  /** Null or omitted keeps the traditional untimed stock battle. */
  timeLimitSeconds?: number | null;
  items: boolean;
  itemFrequency: GameSettings["itemFrequency"];
  stage: StageId;
}

export interface MatchResult {
  winner: PlayerSlot;
  durationMs: number;
  kos: [number, number];
}
