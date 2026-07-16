import "../styles.css";

import type {
  ActionName,
  BindingMap,
  FighterId,
  GameSettings,
  MatchConfig,
  MatchResult,
  PlayerSlot,
  SkinId,
  StageId,
} from "../game/contracts";
import { isOpenFighterId } from "../game/contracts";
import {
  getFighterSkin,
  getFighterSkins,
  isFighterSkinId,
} from "../game/content";
import {
  DEFAULT_BINDINGS as GAME_DEFAULT_BINDINGS,
  formatKeyCode,
} from "../game/input";
import { DEFAULT_SETTINGS as GAME_DEFAULT_SETTINGS } from "../game/settings";
import { FIGHTER_IDS, getFighterDefinition } from "../game/roster";
import type { TestLabController } from "./testLab";
import {
  DEFAULT_STAGE_ID,
  STAGE_DEFINITIONS,
  STAGE_IDS,
  getStageDefinition,
} from "../game/stages";
import {
  EMPTY_GAMEPAD_SNAPSHOT,
  gamepadButtonLabel,
  gamepadDeviceName,
  gamepadSourceLabel,
  type GamepadUiAdapter,
  type GamepadUiDevice,
  type GamepadUiSnapshot,
} from "./gamepadUi";

export type UIScreen =
  | "boot"
  | "title"
  | "home"
  | "character-select"
  | "stage-select"
  | "match-loading"
  | "settings"
  | "how-to-play"
  | "controls"
  | "lab"
  | "gameplay"
  | "results";

export type UISoundCue = "focus" | "confirm" | "back";

export interface MatchLaunchProgress {
  completed: number;
  total: number;
  phase: "renderer" | "fighters" | "stage" | "items";
}

export interface MatchLaunchContext {
  signal: AbortSignal;
  reportProgress: (progress: MatchLaunchProgress) => void;
}

export interface HUDPlayerState {
  fighter: FighterId;
  skin?: SkinId;
  name?: string;
  stocks: number;
  damage: number;
}

export interface HUDState {
  players: [HUDPlayerState, HUDPlayerState];
  announcement?: string;
  remainingTimeMs?: number | null;
  suddenDeath?: boolean;
}

export interface UIControllerCallbacks {
  onBootStart?: () => void;
  onStartMatch?: (config: MatchConfig, context: MatchLaunchContext) => void | Promise<void>;
  onSettingsChange?: (settings: GameSettings) => void;
  onBindingsChange?: (bindings: [BindingMap, BindingMap]) => void;
  onResume?: () => void;
  onRestart?: () => void;
  onQuitToMenu?: () => void;
  onReturnToCharacterSelect?: () => void;
  onScreenChange?: (screen: UIScreen) => void;
  onUiSound?: (cue: UISoundCue) => void;
  onFighterSelected?: (fighter: FighterId, slot: PlayerSlot) => void;
  onControllerDisconnected?: (slot: PlayerSlot, name: string) => void;
  onControllerReconnectResolved?: (slot: PlayerSlot) => void;
}

export interface UIControllerOptions {
  settings?: Partial<GameSettings>;
  initialFighters?: [FighterId, FighterId];
  gamepads?: GamepadUiAdapter;
}

export interface UIControllerEventMap {
  screenchange: UIScreen;
  startmatch: MatchConfig;
  settingschange: GameSettings;
  bindingschange: [BindingMap, BindingMap];
  resume: undefined;
  restart: undefined;
  quittomenu: undefined;
  returntocharacterselect: undefined;
}

interface FighterMeta {
  id: FighterId;
  name: string;
  epithet: string;
  style: string;
  primary: string;
  secondary: string;
  accent: string;
  openContent: boolean;
  visualReady: boolean;
  productionReady: boolean;
}

interface ActionMeta {
  id: ActionName;
  label: string;
  shortLabel: string;
}

const BOOT_SEQUENCE_DURATION_MS = 2_650;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;

const FIGHTERS: readonly FighterMeta[] = FIGHTER_IDS.map((id) => {
  const fighter = getFighterDefinition(id);
  return {
    id,
    name: fighter.displayName,
    epithet: fighter.archetype,
    style: fighter.playstyle,
    primary: fighter.colors.primary,
    secondary: fighter.colors.secondary,
    accent: fighter.colors.accent,
    openContent: isOpenFighterId(id),
    visualReady: getFighterSkin(id, "00").visualReady,
    productionReady: getFighterSkin(id, "00").productionReady,
  };
});
const firstRuntimeFighter = FIGHTERS[0]?.id;
if (!firstRuntimeFighter) {
  throw new Error("No fighter pack is ready for the runtime roster.");
}
const DEFAULT_FIGHTERS: [FighterId, FighterId] = [
  firstRuntimeFighter,
  FIGHTERS[1]?.id ?? firstRuntimeFighter,
];

type RosterDirection = "left" | "right" | "up" | "down";

interface RosterLayout {
  columns: number;
  rows: number;
}

const rosterLayoutFor = (
  count: number,
  maxColumns: number,
  minimumRows: number,
): RosterLayout => {
  const safeCount = Math.max(1, count);
  const rows = Math.min(
    safeCount,
    Math.max(minimumRows, Math.ceil(safeCount / Math.max(1, maxColumns))),
  );
  return { columns: Math.ceil(safeCount / rows), rows };
};

const DEFAULT_ROSTER_LAYOUT = rosterLayoutFor(FIGHTERS.length, 20, 2);
const COMPACT_ROSTER_LAYOUT = rosterLayoutFor(FIGHTERS.length, 10, 2);
const DEFAULT_ROSTER_COLUMNS = DEFAULT_ROSTER_LAYOUT.columns;
const ROSTER_ARROW_DIRECTIONS: Readonly<Partial<Record<string, RosterDirection>>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

function rosterColumns(grid: HTMLElement): number {
  const value = Number.parseInt(
    getComputedStyle(grid).getPropertyValue("--cc-roster-columns"),
    10,
  );
  if (Number.isFinite(value) && value > 0) return value;
  const declaredValue = Number.parseInt(grid.dataset.rosterColumns ?? "", 10);
  return Number.isFinite(declaredValue) && declaredValue > 0
    ? declaredValue
    : DEFAULT_ROSTER_COLUMNS;
}

function rosterTargetIndex(
  currentIndex: number,
  count: number,
  columns: number,
  direction: RosterDirection,
): number {
  if (count <= 1 || currentIndex < 0 || currentIndex >= count) return currentIndex;
  const safeColumns = Math.max(1, Math.min(columns, count));
  const row = Math.floor(currentIndex / safeColumns);
  const column = currentIndex % safeColumns;
  const rowCount = Math.ceil(count / safeColumns);

  if (direction === "left" || direction === "right") {
    const rowStart = row * safeColumns;
    const rowLength = Math.min(safeColumns, count - rowStart);
    const delta = direction === "right" ? 1 : -1;
    const targetColumn = (column + delta + rowLength) % rowLength;
    return rowStart + targetColumn;
  }

  const rowDelta = direction === "down" ? 1 : -1;
  const targetRow = (row + rowDelta + rowCount) % rowCount;
  const targetRowStart = targetRow * safeColumns;
  const targetRowLength = Math.min(safeColumns, count - targetRowStart);
  return targetRowStart + Math.min(column, targetRowLength - 1);
}

const ACTIONS: readonly ActionMeta[] = [
  { id: "left", label: "Move left", shortLabel: "Left" },
  { id: "right", label: "Move right", shortLabel: "Right" },
  { id: "up", label: "Aim up", shortLabel: "Up" },
  { id: "down", label: "Crouch", shortLabel: "Down" },
  { id: "jump", label: "Jump", shortLabel: "Jump" },
  { id: "attack", label: "Attack", shortLabel: "Attack" },
  { id: "special", label: "Special attack", shortLabel: "Special" },
  { id: "shield", label: "Shield / dodge", shortLabel: "Shield" },
  { id: "grab", label: "Grab / pick up", shortLabel: "Grab / item" },
  { id: "pause", label: "Pause", shortLabel: "Pause" },
] as const;

const STOCK_OPTIONS = [1, 2, 3, 4, 5] as const;
const TIME_LIMIT_OPTIONS = [0, 60, 120, 180, 300, 480] as const;

function formatMatchTimer(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const DEFAULT_BINDINGS: [BindingMap, BindingMap] = cloneBindings(
  GAME_DEFAULT_BINDINGS,
);

export const DEFAULT_SETTINGS: GameSettings = {
  ...GAME_DEFAULT_SETTINGS,
  bindings: cloneBindings(DEFAULT_BINDINGS),
};

function cloneBindings(
  source: readonly [BindingMap, BindingMap],
): [BindingMap, BindingMap] {
  return [{ ...source[0] }, { ...source[1] }];
}

function fighterById(id: FighterId): FighterMeta {
  return FIGHTERS.find((fighter) => fighter.id === id) ?? FIGHTERS[0]!;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeKeyLabel(key: string): string {
  if (key === " ") return "Space";
  if (key === "Escape") return "Esc";
  if (key === "Enter") return "Enter";
  if (key.length === 1) return key.toLocaleUpperCase();
  return key;
}

function keyLabel(code: string, layoutLabels?: ReadonlyMap<string, string>): string {
  const labels: Record<string, string> = {
    Enter: "Enter",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
  };

  if (labels[code]) return labels[code];
  const layoutLabel = layoutLabels?.get(code);
  return layoutLabel ? normalizeKeyLabel(layoutLabel) : formatKeyCode(code, false);
}

function portraitMarkup(
  id: FighterId,
  compact = false,
  skin: SkinId = "00",
  thumbnail = false,
): string {
  const fighter = fighterById(id);
  const selectedSkin = getFighterSkin(id, skin);
  const portraitUrl = selectedSkin.portrait;
  const imageUrl = thumbnail && skin === "00"
    ? portraitUrl.replace(/\.png$/, ".thumb.webp")
    : portraitUrl;
  const initials = fighter.name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase();
  return `
    <span class="cc-portrait ${selectedSkin.visualReady ? "cc-portrait--image" : "cc-portrait--pending"} cc-portrait--${id}${compact ? " cc-portrait--compact" : ""}" data-portrait-source="${selectedSkin.visualReady ? "image" : "pending"}" aria-hidden="true">
      ${selectedSkin.visualReady
        ? `<img class="cc-portrait__sprite" src="${imageUrl}" alt="" loading="lazy" decoding="async" fetchpriority="${thumbnail ? "low" : "auto"}" draggable="false">`
        : `<span class="cc-portrait__placeholder" style="--cc-portrait-primary:${fighter.primary};--cc-portrait-secondary:${fighter.secondary}"><b>${escapeHtml(initials)}</b><small>Rendering required</small></span>`}
    </span>`;
}

/**
 * DOM UI for Super Bash Folds. The class is deliberately engine-agnostic: game
 * code can use callbacks or listen for `super-bash-folds:*` CustomEvents.
 */
export class UIController extends EventTarget {
  readonly root: HTMLElement;

  private readonly callbacks: UIControllerCallbacks;
  private readonly shell: HTMLDivElement;
  private readonly screenRoot: HTMLElement;
  private readonly liveRegion: HTMLElement;
  private currentScreen: UIScreen = "home";
  private selectedFighters: [FighterId, FighterId];
  private selectedSkins: [SkinId, SkinId] = ["00", "00"];
  private activePlayer: PlayerSlot = 0;
  private playerCpu: [boolean, boolean] = [false, false];
  private playerConfirmed: [boolean, boolean] = [false, false];
  private playerNames: [string, string] = ["Player 1", "Player 2"];
  private cpuLevels: [1 | 2 | 3, 1 | 2 | 3] = [2, 2];
  private selectedStage: StageId = DEFAULT_STAGE_ID;
  private matchStocks = 3;
  private timeLimitSeconds: number | null = null;
  private settings: GameSettings;
  private controlsReturn: "home" | "settings" = "home";
  private controlsTab: "keyboard" | "gamepad" = "keyboard";
  private gamepadPlayer: PlayerSlot = 0;
  private gamepadDiagnosticIndex?: number;
  private gamepadAdapter?: GamepadUiAdapter;
  private gamepadSnapshot: GamepadUiSnapshot = EMPTY_GAMEPAD_SNAPSHOT;
  private gamepadStructureKey = "";
  private removeGamepadSubscription?: () => void;
  private knownGamepadConnections?: Map<string, { connected: boolean; player: PlayerSlot | null; name: string }>;
  private pendingBinding?: { slot: PlayerSlot; action: ActionName };
  private pauseOverlay?: HTMLElement;
  private reconnectOverlay?: HTMLElement;
  private reconnectPlayer?: PlayerSlot;
  private reconnectDeviceName?: string;
  private lastFocused?: HTMLElement;
  private lastMatchConfig?: MatchConfig;
  private destroyed = false;
  private bootTimer?: number;
  private bootStarted = false;
  private labController?: TestLabController;
  private labLoadGeneration = 0;
  private victoryAnimationFrame?: number;
  private victoryLoadGeneration = 0;
  private matchLaunchGeneration = 0;
  private matchLaunch?: { controller: AbortController; generation: number };
  private keyboardFocusSound = false;
  private suppressFocusSound = false;
  private readonly keyboardLayoutLabels = new Map<string, string>();

  constructor(
    root: HTMLElement,
    callbacks: UIControllerCallbacks = {},
    options: UIControllerOptions = {},
  ) {
    super();
    this.root = root;
    this.callbacks = callbacks;
    this.selectedFighters = options.initialFighters ?? DEFAULT_FIGHTERS;

    const suppliedBindings = options.settings?.bindings;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...options.settings,
      bindings: suppliedBindings
        ? cloneBindings(suppliedBindings)
        : cloneBindings(DEFAULT_BINDINGS),
    };

    this.shell = document.createElement("div");
    this.shell.className = "cc-ui";
    this.shell.innerHTML = `
      <div class="cc-atmosphere" aria-hidden="true">
        <div class="cc-sun"></div>
        <div class="cc-cloud cc-cloud--one"></div>
        <div class="cc-cloud cc-cloud--two"></div>
        <div class="cc-cloud cc-cloud--three"></div>
        <div class="cc-horizon"></div>
      </div>
      <main class="cc-screen-root" data-cc-screen-root></main>
      <div class="cc-toast" role="status" aria-live="polite" data-cc-toast></div>
      <div class="cc-visually-hidden" aria-live="polite" data-cc-live></div>`;

    const screenRoot = this.shell.querySelector<HTMLElement>("[data-cc-screen-root]");
    const liveRegion = this.shell.querySelector<HTMLElement>("[data-cc-live]");
    if (!screenRoot || !liveRegion) {
      throw new Error("Could not initialize the Super Bash Folds interface.");
    }

    this.screenRoot = screenRoot;
    this.liveRegion = liveRegion;
    this.root.classList.add("cc-ui-host");
    this.root.append(this.shell);

    this.shell.addEventListener("click", this.handleClick);
    this.shell.addEventListener("change", this.handleChange);
    this.shell.addEventListener("input", this.handleInput);
    this.shell.addEventListener("keydown", this.handleKeydown);
    this.shell.addEventListener("pointerdown", this.handlePointerDown);
    this.shell.addEventListener("pointermove", this.handlePointerMove);
    this.shell.addEventListener("pointerover", this.handlePointerOver);
    this.shell.addEventListener("focusin", this.handleFocusIn);

    if (options.gamepads) this.setGamepadAdapter(options.gamepads);
    void this.loadKeyboardLayoutLabels();

    if (new URLSearchParams(window.location.search).get("lab") === "1") {
      this.showLab();
    } else {
      this.showBoot();
    }
  }

  get screen(): UIScreen {
    return this.currentScreen;
  }

  private keyLabel(code: string): string {
    return keyLabel(code, this.keyboardLayoutLabels);
  }

  private async loadKeyboardLayoutLabels(): Promise<void> {
    const keyboard = (navigator as Navigator & {
      keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> };
    }).keyboard;
    if (!keyboard?.getLayoutMap) return;
    try {
      const layout = await keyboard.getLayoutMap();
      if (this.destroyed) return;
      for (const [code, label] of layout) this.keyboardLayoutLabels.set(code, label);
      if (this.currentScreen === "controls") this.showControls(this.controlsReturn);
      else if (this.currentScreen === "how-to-play") this.showHowToPlay();
    } catch {
      // Some browsers expose the API but deny it outside a secure context.
    }
  }

  showBoot(): void {
    this.hidePause(false);
    if (this.bootTimer !== undefined) window.clearTimeout(this.bootTimer);
    this.bootTimer = undefined;
    this.bootStarted = false;
    this.renderScreen(
      "boot",
      `
        <section class="cc-boot" aria-label="Launching Super Bash Folds">
          <div class="cc-boot__flash" aria-hidden="true"></div>
          <div class="cc-boot__mark" aria-hidden="true"><i></i><b></b></div>
          <div class="cc-boot__wordmark">
            <strong>Super</strong>
            <em>Bash Folds</em>
          </div>
          <p>A local battle for two players</p>
          <button class="cc-boot__skip" type="button" data-ui-action="boot-skip" hidden>Skip</button>
        </section>`,
    );
    this.startBootSequence();
  }

  private startBootSequence(): void {
    if (this.bootStarted || this.currentScreen !== "boot") return;
    this.bootStarted = true;
    const boot = this.screenRoot.querySelector<HTMLElement>(".cc-boot");
    boot?.classList.add("is-running");
    const skip = this.screenRoot.querySelector<HTMLButtonElement>("[data-ui-action='boot-skip']");
    if (skip) skip.hidden = false;
    this.callbacks.onBootStart?.();

    // The reduced-motion stylesheet resolves the intro immediately. Keep the
    // DOM lifecycle in sync so the user never waits on an already-finished,
    // transparent boot screen.
    if (prefersReducedMotion()) {
      this.showTitle();
      return;
    }

    this.bootTimer = window.setTimeout(() => {
      this.bootTimer = undefined;
      if (!this.destroyed && this.currentScreen === "boot") this.showTitle();
    }, BOOT_SEQUENCE_DURATION_MS);
  }

  showTitle(): void {
    if (this.bootTimer !== undefined) window.clearTimeout(this.bootTimer);
    this.bootTimer = undefined;
    this.bootStarted = false;
    this.renderScreen(
      "title",
      `
        <section class="cc-title-screen cc-enter" aria-labelledby="cc-title-logo">
          <div class="cc-title-screen__burst" aria-hidden="true"></div>
          <div class="cc-title-screen__logo" id="cc-title-logo">
            <strong>Super</strong><em>Bash Folds</em>
          </div>
          <button class="cc-title-screen__start" type="button" data-ui-action="title-start">
            <span>Press</span><strong>Enter</strong>
          </button>
          <p>Local battle • 2 players • keyboard &amp; controllers</p>
        </section>`,
      "[data-ui-action='title-start']",
    );
  }

  getSettings(): GameSettings {
    return {
      ...this.settings,
      bindings: cloneBindings(this.settings.bindings),
    };
  }

  getMatchConfig(): MatchConfig {
    return {
      players: [
        {
          fighter: this.selectedFighters[0],
          skin: this.selectedSkins[0],
          name: this.playerCpu[0] ? "CPU 1" : this.playerNames[0],
          slot: 0,
          cpu: this.playerCpu[0],
          cpuLevel: this.cpuLevels[0],
        },
        {
          fighter: this.selectedFighters[1],
          skin: this.selectedSkins[1],
          name: this.playerCpu[1] ? "CPU 2" : this.playerNames[1],
          slot: 1,
          cpu: this.playerCpu[1],
          cpuLevel: this.cpuLevels[1],
        },
      ],
      stocks: this.matchStocks,
      timeLimitSeconds: this.timeLimitSeconds,
      items: this.settings.items,
      itemFrequency: this.settings.itemFrequency,
      stage: this.selectedStage,
    };
  }

  /** Select a fighter for an explicit player without relying on the shared active tab. */
  selectFighterForPlayer(slot: PlayerSlot, fighterId: FighterId): void {
    if (this.currentScreen !== "character-select") return;
    const fighter = FIGHTERS.find((candidate) => candidate.id === fighterId);
    if (!fighter?.visualReady) return;
    this.activePlayer = slot;
    this.selectedFighters[slot] = fighter.id;
    const skins = getFighterSkins(fighter.id);
    if (!skins.some(({ id }) => id === this.selectedSkins[slot])) {
      this.selectedSkins[slot] = skins[0]!.id;
    }
    this.playerConfirmed[slot] = false;
    this.callbacks.onFighterSelected?.(fighter.id, slot);
    this.showCharacterSelect();
  }

  /** Activate any visible menu control on behalf of one player-owned hand cursor. */
  activateCursorTarget(
    slot: PlayerSlot,
    target: HTMLElement,
    point?: Readonly<{ x: number; y: number }>,
  ): void {
    if (!this.root.contains(target) || target.hasAttribute("disabled")) return;
    if (this.currentScreen === "character-select") {
      const action = target.dataset.uiAction;
      if (action === "pick-fighter") {
        const fighter = FIGHTERS.find((candidate) => candidate.id === target.dataset.fighter);
        const requestedSlot = this.readSlot(target.dataset.fighterSlot);
        const selectionSlot = requestedSlot !== undefined && this.playerCpu[requestedSlot]
          ? requestedSlot
          : slot;
        if (fighter) this.selectFighterForPlayer(selectionSlot, fighter.id);
        return;
      }
      const targetSlot = this.readSlot(target.dataset.playerSlot);
      const enablesCpuSlot = action === "set-player-mode" && target.dataset.playerCpu === "true";
      if (
        targetSlot !== undefined &&
        targetSlot !== slot &&
        !this.playerCpu[targetSlot] &&
        !enablesCpuSlot
      ) return;
      this.activePlayer = targetSlot ?? slot;
    }

    if (target instanceof HTMLSelectElement) {
      const enabled = Array.from(target.options).filter((option) => !option.disabled);
      const current = enabled.findIndex((option) => option.value === target.value);
      const next = enabled[(current + 1 + enabled.length) % enabled.length];
      if (next) {
        target.value = next.value;
        target.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    if (target instanceof HTMLInputElement && target.type === "range") {
      const minimum = Number(target.min || 0);
      const maximum = Number(target.max || 100);
      const step = Math.max(Number(target.step || 1), Number.EPSILON);
      const bounds = target.getBoundingClientRect();
      const ratio = point && bounds.width > 0
        ? Math.max(0, Math.min(1, (point.x - bounds.left) / bounds.width))
        : (Number(target.value) - minimum) / Math.max(1, maximum - minimum);
      const raw = minimum + ratio * (maximum - minimum);
      target.value = String(minimum + Math.round((raw - minimum) / step) * step);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    target.click();
  }

  private pointerSelectionSlot(fallback: PlayerSlot): PlayerSlot {
    if (this.playerCpu[fallback]) return fallback;
    const keyboardPlayers = ([0, 1] as const).filter(
      (slot) => !this.playerCpu[slot] && this.gamepadSnapshot.sources[slot].type === "keyboard",
    );
    return keyboardPlayers.length === 1 ? keyboardPlayers[0]! : fallback;
  }

  setSettings(patch: Partial<GameSettings>): void {
    this.settings = {
      ...this.settings,
      ...patch,
      bindings: patch.bindings
        ? cloneBindings(patch.bindings)
        : cloneBindings(this.settings.bindings),
    };
    this.publishSettings();
    if (this.currentScreen === "settings") this.showSettings();
  }

  setBindings(slot: PlayerSlot, bindings: BindingMap): void {
    this.settings.bindings[slot] = { ...bindings };
    this.publishBindings();
    if (this.currentScreen === "controls") this.showControls(this.controlsReturn);
  }

  /** Inject or replace the UI-facing controller service without coupling the UI to navigator. */
  setGamepadAdapter(adapter: GamepadUiAdapter): void {
    this.removeGamepadSubscription?.();
    this.gamepadAdapter = adapter;
    this.gamepadSnapshot = adapter.getSnapshot();
    this.knownGamepadConnections = new Map(
      this.gamepadSnapshot.devices.map((device) => [
        `${device.id}::${device.index}`,
        { connected: device.connected, player: device.assignedPlayer, name: gamepadDeviceName(device) },
      ]),
    );
    this.removeGamepadSubscription = adapter.subscribe(this.handleGamepadSnapshot);
    const initiallyConnected = this.gamepadSnapshot.devices.filter((device) => device.connected);
    if (initiallyConnected.length === 1) {
      const device = initiallyConnected[0]!;
      this.toast(device.assignedPlayer === null
        ? "Controller connected"
        : `Controller P${device.assignedPlayer + 1} connected`);
    } else if (initiallyConnected.length > 1) {
      this.toast(`${initiallyConnected.length} controllers connected`);
    }
    if (this.currentScreen === "controls" && this.controlsTab === "gamepad") {
      this.refreshGamepadWorkbench(true);
    }
  }

  /** Stable back action used by keyboard and menu-controller navigation. */
  navigateBack(): void {
    if (this.reconnectOverlay) return;
    if (this.pauseOverlay) {
      this.resumeMatch();
      return;
    }
    if (this.currentScreen === "home" || this.currentScreen === "gameplay") return;
    this.callbacks.onUiSound?.("back");
    if (this.currentScreen === "controls" && this.controlsReturn === "settings") this.showSettings();
    else if (this.currentScreen === "stage-select") this.showCharacterSelect();
    else this.showHome();
  }

  /**
   * Blocking reconnect sheet. The engine owns pausing; choosing a source only
   * updates the central assignment and reports that the match can resume.
   */
  showControllerReconnect(slot: PlayerSlot, disconnectedName?: string): void {
    const rememberedName = disconnectedName ?? this.reconnectDeviceName;
    this.hideControllerReconnect();
    this.reconnectPlayer = slot;
    this.reconnectDeviceName = rememberedName;
    const snapshot = this.gamepadAdapter?.getSnapshot() ?? this.gamepadSnapshot;
    this.gamepadSnapshot = snapshot;
    const devices = snapshot.devices.filter(
      (device) => device.connected && (device.assignedPlayer === null || device.assignedPlayer === slot),
    );
    const overlay = document.createElement("div");
    overlay.className = "cc-modal-layer cc-controller-reconnect cc-enter";
    overlay.dataset.ccControllerReconnect = "";
    overlay.innerHTML = `
      <section class="cc-reconnect-panel" role="alertdialog" aria-modal="true" aria-labelledby="cc-reconnect-title">
        <span class="cc-reconnect-panel__player cc-reconnect-panel__player--p${slot + 1}">P${slot + 1}</span>
        <div class="cc-reconnect-panel__copy">
          <small>Battle paused</small>
          <h2 id="cc-reconnect-title">Controller P${slot + 1} disconnected</h2>
          <p>${rememberedName ? `${escapeHtml(rememberedName)} is no longer responding. ` : ""}Press a button to reconnect it, choose another controller, or continue with the keyboard.</p>
        </div>
        <div class="cc-reconnect-panel__devices">
          ${devices.map((device) => `
            <button type="button" data-ui-action="reconnect-gamepad" data-gamepad-index="${device.index}">
              <span aria-hidden="true">●</span><strong>${escapeHtml(gamepadDeviceName(device))}</strong><small>Use for P${slot + 1}</small>
            </button>`).join("")}
          <button type="button" data-ui-action="reconnect-keyboard">
            <span aria-hidden="true">⌨</span><strong>Continue with keyboard</strong><small>P${slot + 1} controls</small>
          </button>
        </div>
        ${devices.length === 0 ? '<p class="cc-reconnect-panel__waiting"><i aria-hidden="true"></i> Press a button to connect the controller</p>' : ""}
      </section>`;
    this.reconnectOverlay = overlay;
    this.shell.append(overlay);
    overlay.querySelector<HTMLElement>("button")?.focus();
  }

  hideControllerReconnect(): void {
    this.reconnectOverlay?.remove();
    this.reconnectOverlay = undefined;
    this.reconnectPlayer = undefined;
    this.reconnectDeviceName = undefined;
  }

  showHome(): void {
    this.pendingBinding = undefined;
    this.gamepadAdapter?.cancelCapture();
    this.hideControllerReconnect();
    this.hidePause(false);
    const homeTimeLabel = this.timeLimitSeconds === null
      ? "No time limit"
      : `${Math.round(this.timeLimitSeconds / 60)} min limit`;
    this.renderScreen(
      "home",
      `
        <section class="cc-home cc-home--mosaic cc-enter" aria-labelledby="cc-home-title">
          <header class="cc-home-masthead">
            <div class="cc-home-masthead__brand" id="cc-home-title">
              <strong>Super</strong><em>Bash Folds</em>
            </div>
            <div class="cc-home-masthead__meta"><span>Local battle</span><b>2 players • keyboard or controllers</b></div>
          </header>
          <nav class="cc-main-menu cc-home-board" aria-label="Main menu">
            <button class="cc-home-tile cc-home-tile--fight" type="button" data-ui-action="home-play">
              <span class="cc-home-tile__cross" aria-hidden="true"><i></i><b></b></span>
              <span class="cc-home-tile__copy"><small>Main mode</small><strong>Play</strong><em>${this.matchStocks} stock${this.matchStocks === 1 ? "" : "s"} • local versus</em></span>
              <span class="cc-home-tile__arrow" aria-hidden="true">›</span>
            </button>
            <button class="cc-home-tile cc-home-tile--how" type="button" data-ui-action="home-how">
              <span class="cc-home-tile__glyph" aria-hidden="true">?</span>
              <span class="cc-home-tile__copy"><small>Learn</small><strong>How to play</strong><em>The basics in 2 minutes</em></span>
            </button>
            <button class="cc-home-tile cc-home-tile--controls" type="button" data-ui-action="home-controls">
              <span class="cc-home-tile__glyph cc-home-tile__glyph--keys" aria-hidden="true">⌨</span>
              <span class="cc-home-tile__copy"><small>Keyboard &amp; controllers</small><strong>Controls</strong><em>Configure and test P1 / P2</em></span>
            </button>
            <button class="cc-home-tile cc-home-tile--settings" type="button" data-ui-action="home-settings">
              <span class="cc-home-tile__glyph" aria-hidden="true">⚙</span>
              <span class="cc-home-tile__copy"><small>Audio & comfort</small><strong>Settings</strong><em>Adjust the intensity</em></span>
            </button>
            <button class="cc-home-tile cc-home-tile--lab" type="button" data-ui-action="home-lab">
              <span class="cc-home-tile__glyph" aria-hidden="true">▶|</span>
              <span class="cc-home-tile__copy"><small>Full inspection</small><strong>Lab</strong><em>Animations • items • stages</em></span>
            </button>
            <div class="cc-home-tile cc-home-tile--info" aria-label="Rules: ${this.matchStocks} stocks, ${homeTimeLabel}">
              <span class="cc-home-tile__stock" aria-hidden="true">×${this.matchStocks}</span>
              <span class="cc-home-tile__copy"><small>Rules</small><strong>${this.matchStocks} stock${this.matchStocks === 1 ? "" : "s"}</strong><em>${homeTimeLabel}</em></span>
            </div>
            <span class="cc-home-medallion" aria-hidden="true"><i></i><b></b><em>SBF</em></span>
          </nav>
          <footer class="cc-home__footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>Enter</kbd> confirm</span>
            <span class="cc-home__edition">Open-source platform fighter</span>
          </footer>
        </section>`,
      this.keyboardFocusSound ? "[data-ui-action='home-play']" : undefined,
    );
  }

  showCharacterSelect(): void {
    this.pendingBinding = undefined;
    const selectedStage = getStageDefinition(this.selectedStage);
    const timeLabel = this.timeLimitSeconds === null
      ? "No time limit"
      : `${Math.round(this.timeLimitSeconds / 60)} minute${this.timeLimitSeconds === 60 ? "" : "s"}`;
    const entering = this.currentScreen !== "character-select";
    const retainedFocus = entering ? undefined : this.characterSelectFocusSelector();
    this.renderScreen(
      "character-select",
      `
        <section class="cc-select cc-select--roster${entering ? " cc-enter" : ""}" data-active-player="${this.activePlayer}" aria-labelledby="cc-select-title">
          <header class="cc-select-header">
            <button class="cc-back-button" type="button" data-ui-action="back-home" aria-label="Back to main menu"><span aria-hidden="true">←</span> Back</button>
            <div class="cc-select-header__blade"><small>${this.matchStocks}-stock battle • ${timeLabel}</small><h1 id="cc-select-title">Choose your fighters</h1></div>
            <div class="cc-select-header__active"><span>Active cursor</span><strong>Player ${this.activePlayer + 1}</strong><kbd>${this.activePlayer === 0 ? "1" : "2"}</kbd></div>
          </header>
          ${this.rosterGridMarkup()}
          <div class="cc-player-grid">
            ${this.playerPanelMarkup(0)}
            <div class="cc-versus-mark" aria-hidden="true"><span>V</span><span>S</span></div>
            ${this.playerPanelMarkup(1)}
          </div>
          <div class="cc-match-strip cc-match-strip--players">
            <div class="cc-rules-card">
              <div class="cc-rule-selects">
                <label class="cc-rule-select"><span>Stocks</span><select data-ui-field="match-stocks" aria-label="Number of stocks">${STOCK_OPTIONS.map((stocks) => `<option value="${stocks}"${stocks === this.matchStocks ? " selected" : ""}>${stocks}</option>`).join("")}</select></label>
                <label class="cc-rule-select"><span>Time limit</span><select data-ui-field="time-limit" aria-label="Match time limit"><option value="0"${this.timeLimitSeconds === null ? " selected" : ""}>Off</option>${TIME_LIMIT_OPTIONS.filter((seconds) => seconds > 0).map((seconds) => `<option value="${seconds}"${seconds === this.timeLimitSeconds ? " selected" : ""}>${seconds / 60} min</option>`).join("")}</select></label>
              </div>
              <button class="cc-switch" type="button" role="switch" aria-checked="${this.settings.items}" data-ui-action="toggle-items">
                <span class="cc-switch__track"><i></i></span>
                <span><strong>Items</strong><small>${this.settings.items ? "On" : "Off"}</small></span>
              </button>
              <label class="cc-frequency${this.settings.items ? "" : " is-disabled"}">
                <span>Frequency</span>
                <select data-ui-field="item-frequency" ${this.settings.items ? "" : "disabled"}>
                  <option value="low"${this.settings.itemFrequency === "low" ? " selected" : ""}>Low</option>
                  <option value="medium"${this.settings.itemFrequency === "medium" ? " selected" : ""}>Medium</option>
                  <option value="high"${this.settings.itemFrequency === "high" ? " selected" : ""}>High</option>
                </select>
              </label>
            </div>
            <button class="cc-fight-button${this.playerConfirmed.every(Boolean) ? " is-ready" : ""}" type="button" data-ui-action="open-stage-select" aria-disabled="${!this.playerConfirmed.every(Boolean)}">
              <span>${this.playerConfirmed.every(Boolean) ? "Next step" : "Confirm P1 and P2"}</span>
              <strong>${this.playerConfirmed.every(Boolean) ? "Stages" : "Waiting"}</strong>
              <small>${this.playerConfirmed.every(Boolean) ? `Current selection: ${escapeHtml(selectedStage.displayName)}` : "Duplicate fighters are allowed"}</small>
            </button>
          </div>
        </section>`,
      retainedFocus ?? `[data-ui-action='pick-fighter'][data-fighter-slot='${this.activePlayer}'][aria-checked='true']`,
    );
  }

  showStageSelect(): void {
    const selected = getStageDefinition(this.selectedStage);
    const zoneWidth = selected.blastZone.right - selected.blastZone.left;
    const zoneLabel = zoneWidth >= 2_800 ? "Large" : zoneWidth <= 2_000 ? "Compact" : "Standard";
    const stageCount = String(STAGE_IDS.length).padStart(2, "0");
    this.renderScreen(
      "stage-select",
      `
        <section class="cc-stage-select-screen cc-enter" data-selected-stage="${selected.id}" aria-labelledby="cc-stage-select-title">
          <header class="cc-stage-select-header">
            <button class="cc-back-button" type="button" data-ui-action="stage-back"><span aria-hidden="true">←</span> Fighters</button>
            <div><small>${this.matchStocks}-stock battle${this.timeLimitSeconds === null ? "" : ` • ${this.timeLimitSeconds / 60} min`}</small><h1 id="cc-stage-select-title">Choose a stage</h1></div>
            <strong>${stageCount} STAGE${STAGE_IDS.length > 1 ? "S" : ""}</strong>
          </header>
          <div class="cc-stage-select-layout">
            <div class="cc-stage-select-grid" role="radiogroup" aria-label="Available stages">
              ${STAGE_IDS.map((id, index) => {
                const stage = STAGE_DEFINITIONS[id];
                const active = id === this.selectedStage;
                return `
                  <button class="cc-stage-select-card${active ? " is-selected" : ""}" type="button" role="radio" aria-checked="${active}" data-ui-action="select-stage" data-stage="${id}">
                    <span class="cc-stage-select-card__number">${String(index + 1).padStart(2, "0")}</span>
                    <img src="${stage.thumbnailUrl}" alt="" loading="lazy" decoding="async" fetchpriority="low" draggable="false">
                    <span><small>${escapeHtml(stage.series)}</small><strong>${escapeHtml(stage.displayName)}</strong></span>
                  </button>`;
              }).join("")}
            </div>
            <article class="cc-stage-showcase">
              <div class="cc-stage-showcase__image"><img src="${selected.previewUrl}" alt="Preview of ${escapeHtml(selected.displayName)}"></div>
              <div class="cc-stage-showcase__copy">
                <span>${escapeHtml(selected.series)}</span>
                <h2>${escapeHtml(selected.displayName)}</h2>
                <p>${escapeHtml(selected.identity)}</p>
                <dl><div><dt>Platforms</dt><dd>${selected.platforms.length}</dd></div><div><dt>Blast zone</dt><dd>${zoneLabel}</dd></div></dl>
              </div>
            </article>
          </div>
          <footer class="cc-stage-select-footer">
            <span><kbd>←</kbd><kbd>→</kbd> choose</span>
            <button class="cc-stage-launch" type="button" data-ui-action="stage-confirm"><span>Ready?</span><strong>Fight!</strong><small>${escapeHtml(selected.displayName)}</small></button>
          </footer>
        </section>`,
      `[data-ui-action='select-stage'][data-stage='${selected.id}']`,
    );
  }

  private showMatchLoading(config: MatchConfig): void {
    const first = fighterById(config.players[0].fighter);
    const second = fighterById(config.players[1].fighter);
    const stage = getStageDefinition(config.stage);
    this.renderScreen(
      "match-loading",
      `
        <section class="cc-match-loading cc-enter" aria-labelledby="cc-match-loading-title" aria-busy="true">
          <div class="cc-match-loading__flare" aria-hidden="true"></div>
          <span class="cc-match-loading__eyebrow">Optimized local setup</span>
          <h1 id="cc-match-loading-title">Loading battle</h1>
          <div class="cc-match-loading__versus">
            <article>${portraitMarkup(first.id, false, config.players[0].skin)}<strong>${escapeHtml(first.name)}</strong><small>Player 1</small></article>
            <b aria-hidden="true">VS</b>
            <article>${portraitMarkup(second.id, false, config.players[1].skin)}<strong>${escapeHtml(second.name)}</strong><small>Player 2</small></article>
          </div>
          <div class="cc-match-loading__status" role="status" aria-live="polite">
            <span data-match-loading-label>Starting the engine…</span>
            <strong data-match-loading-percent>0%</strong>
          </div>
          <div class="cc-match-loading__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-match-loading-progress><i></i></div>
          <p>${escapeHtml(stage.displayName)} • only the two selected fighters and this stage are loaded</p>
          <button class="cc-text-button" type="button" data-ui-action="loading-cancel">Cancel</button>
        </section>`,
      "[data-ui-action='loading-cancel']",
    );
  }

  private updateMatchLoading(progress: MatchLaunchProgress): void {
    if (this.currentScreen !== "match-loading") return;
    const labels: Record<MatchLaunchProgress["phase"], string> = {
      renderer: "Loading the battle engine…",
      fighters: "Caching selected animations…",
      stage: "Preparing the selected stage…",
      items: "Preparing items…",
    };
    const percentage = progress.total <= 0
      ? 0
      : Math.round(Math.min(1, progress.completed / progress.total) * 100);
    const label = this.screenRoot.querySelector<HTMLElement>("[data-match-loading-label]");
    const value = this.screenRoot.querySelector<HTMLElement>("[data-match-loading-percent]");
    const bar = this.screenRoot.querySelector<HTMLElement>("[data-match-loading-progress]");
    if (label) label.textContent = labels[progress.phase];
    if (value) value.textContent = `${percentage}%`;
    if (bar) {
      bar.setAttribute("aria-valuenow", String(percentage));
      bar.style.setProperty("--cc-match-loading-progress", `${percentage}%`);
    }
  }

  showSettings(): void {
    this.pendingBinding = undefined;
    this.renderScreen(
      "settings",
      `
        <section class="cc-sheet-screen cc-sheet-screen--options cc-enter" aria-labelledby="cc-settings-title">
          ${this.screenHeader("Settings", "Make the intensity yours", "back-home", "cc-settings-title")}
          <div class="cc-settings-board">
            <div class="cc-settings-group">
              <div class="cc-settings-group__heading"><span class="cc-icon-wave" aria-hidden="true"></span><div><strong>Sound</strong><small>The rhythm of the fight</small></div></div>
              ${this.rangeMarkup("musicVolume", "Music", this.settings.musicVolume, "0", "100")}
              ${this.rangeMarkup("effectsVolume", "Effects", this.settings.effectsVolume, "0", "100")}
            </div>
            <div class="cc-settings-group">
              <div class="cc-settings-group__heading"><span class="cc-icon-impact" aria-hidden="true"></span><div><strong>Impact</strong><small>Tune the spectacle</small></div></div>
              ${this.rangeMarkup("shake", "Camera shake", this.settings.shake, "Calm", "Strong")}
              ${this.rangeMarkup("flashes", "Flashes", this.settings.flashes, "Soft", "Bright")}
            </div>
            <div class="cc-settings-actions">
              <button class="cc-wide-action" type="button" data-ui-action="open-controls-settings"><span><strong>Controls</strong><small>Configure keyboards and controllers</small></span><b aria-hidden="true">→</b></button>
              <button class="cc-text-button" type="button" data-ui-action="settings-reset">Default settings</button>
            </div>
          </div>
        </section>`,
      "[data-ui-action='back-home']",
    );
  }

  showHowToPlay(): void {
    this.pendingBinding = undefined;
    const p1 = this.settings.bindings[0];
    this.renderScreen(
      "how-to-play",
      `
        <section class="cc-sheet-screen cc-sheet-screen--help cc-enter" aria-labelledby="cc-how-title">
          ${this.screenHeader("How to play", "Easy to learn, hard to master", "back-home", "cc-how-title")}
          <div class="cc-how-grid">
            <article class="cc-how-card cc-how-card--goal">
              <span class="cc-how-card__number">Goal</span>
              <div class="cc-how-diagram cc-how-diagram--blast" aria-hidden="true"><i></i><b>132%</b><em>→</em></div>
              <h2>Launch your rival</h2>
              <p>Hits raise the damage percentage. The higher it gets, the farther a fighter is launched. Take all of your opponent's stocks.</p>
            </article>
            <article class="cc-how-card">
              <span class="cc-how-card__number">Attack</span>
              <div class="cc-key-combo"><kbd>${escapeHtml(this.keyLabel(p1.attack))}</kbd><span>+</span><kbd>direction</kbd></div>
              <h2>Mix up your attacks</h2>
              <p>A direction changes the attack. Press direction + attack quickly for a powerful smash, or attack in the air to extend a combo.</p>
            </article>
            <article class="cc-how-card">
              <span class="cc-how-card__number">Recover</span>
              <div class="cc-key-combo"><kbd>↑</kbd><span>+</span><kbd>${escapeHtml(this.keyLabel(p1.special))}</kbd></div>
              <h2>Save your second jump</h2>
              <p>Offstage, combine jump and up special to recover. Up special works only once before touching the ground or grabbing a ledge.</p>
            </article>
            <article class="cc-how-card">
              <span class="cc-how-card__number">Defend</span>
              <div class="cc-key-combo"><kbd>${escapeHtml(this.keyLabel(p1.shield))}</kbd><span>+</span><kbd>direction</kbd></div>
              <h2>Read your opponent</h2>
              <p>Shield blocks attacks and grab beats shield. In the air, jump then down-diagonal + shield produces a wavedash; shield just before landing L-cancels an aerial.</p>
            </article>
          </div>
          <div class="cc-tip-ribbon"><strong>Advanced movement</strong><span>Quickly reverse left/right to dash-dance. Release jump quickly for a short hop, then press down after the apex to fast-fall. Down also drops through soft platforms.</span></div>
        </section>`,
      "[data-ui-action='back-home']",
    );
  }

  showControls(returnTo: "home" | "settings" = "home"): void {
    this.controlsReturn = returnTo;
    this.pendingBinding = undefined;
    this.gamepadSnapshot = this.gamepadAdapter?.getSnapshot() ?? this.gamepadSnapshot;
    this.renderScreen(
      "controls",
      `
        <section class="cc-sheet-screen cc-sheet-screen--controls cc-enter" aria-labelledby="cc-controls-title">
          ${this.screenHeader("Controls", this.controlsTab === "keyboard" ? "Select a key, then press its replacement" : "Add multiple buttons to the same action", "controls-back", "cc-controls-title")}
          <div class="cc-controls-tabs" role="tablist" aria-label="Control type">
            <button type="button" role="tab" aria-selected="${this.controlsTab === "keyboard"}" class="${this.controlsTab === "keyboard" ? "is-active" : ""}" data-ui-action="controls-tab" data-controls-tab="keyboard"><span aria-hidden="true">⌨</span><strong>Keyboard</strong><small>Two shared layouts</small></button>
            <button type="button" role="tab" aria-selected="${this.controlsTab === "gamepad"}" class="${this.controlsTab === "gamepad" ? "is-active" : ""}" data-ui-action="controls-tab" data-controls-tab="gamepad"><span aria-hidden="true">◉</span><strong>Controller</strong><small>${this.connectedGamepads().length} connected${this.connectedGamepads().length === 1 ? "" : "s"}</small></button>
          </div>
          <div class="cc-controls-content" data-controls-content>
            ${this.controlsTab === "keyboard" ? `
              <div class="cc-controls-grid">
                ${this.controlPanelMarkup(0)}
                ${this.controlPanelMarkup(1)}
              </div>
              <p class="cc-controls-note"><span aria-hidden="true">⌨</span> Some keyboards limit simultaneous key presses. If a combo does not respond, choose keys farther apart.</p>
            ` : `<div class="cc-gamepad-workbench" data-gamepad-workbench>${this.gamepadWorkbenchMarkup()}</div>`}
          </div>
        </section>`,
      "[data-ui-action='controls-back']",
    );
  }

  showLab(): void {
    const generation = ++this.labLoadGeneration;
    this.renderScreen(
      "lab",
      `
        <section class="cc-lab-screen cc-enter" aria-labelledby="cc-lab-title">
          <header class="cc-lab-header">
            <button class="cc-back-button" type="button" data-ui-action="back-home"><span aria-hidden="true">←</span> Back</button>
            <div><small>Built-in validation tool</small><h1 id="cc-lab-title">Lab</h1></div>
            <strong>FRAME / HIT / ITEM</strong>
          </header>
          <div data-test-lab aria-busy="true"><p class="cc-lab-loading">Loading the lab…</p></div>
        </section>`,
      "[data-ui-action='back-home']",
    );
    const host = this.screenRoot.querySelector<HTMLElement>("[data-test-lab]");
    if (!host) return;
    void import("./testLab").then(({ TestLabController: LabController }) => {
      if (
        this.destroyed ||
        generation !== this.labLoadGeneration ||
        this.currentScreen !== "lab" ||
        !host.isConnected
      ) return;
      host.removeAttribute("aria-busy");
      this.labController = new LabController(host);
    }).catch(() => {
      if (generation !== this.labLoadGeneration || this.currentScreen !== "lab") return;
      host.removeAttribute("aria-busy");
      host.innerHTML = '<p class="cc-lab-loading">The lab could not be loaded.</p>';
    });
  }

  showHud(state?: HUDState): void {
    const hudState = state ?? {
      players: [
        { fighter: this.selectedFighters[0], name: this.playerNames[0], stocks: this.matchStocks, damage: 0 },
        { fighter: this.selectedFighters[1], name: this.playerNames[1], stocks: this.matchStocks, damage: 0 },
      ],
      remainingTimeMs: this.timeLimitSeconds === null ? null : this.timeLimitSeconds * 1000,
    };
    const timer = hudState.remainingTimeMs === null || hudState.remainingTimeMs === undefined
      ? ""
      : formatMatchTimer(hudState.remainingTimeMs);

    this.renderScreen(
      "gameplay",
      `
        <section class="cc-hud${hudState.suddenDeath ? " is-sudden-death" : ""}" aria-label="Battle status">
          ${this.hudPlayerMarkup(0, hudState.players[0])}
          <div class="cc-hud__center">
            <span class="cc-hud__announcement" aria-live="assertive" data-hud-announcement>${escapeHtml(hudState.announcement ?? "")}</span>
            <time class="cc-hud__timer" data-hud-timer${timer ? "" : " hidden"}>${escapeHtml(timer)}</time>
          </div>
          ${this.hudPlayerMarkup(1, hudState.players[1])}
        </section>`,
    );
  }

  updateHud(state: HUDState): void {
    // The simulation keeps publishing its final snapshot while the results
    // screen is visible. Never let that last HUD update replace victory,
    // menus or the Test Lab; startMatch/showHud owns entering gameplay.
    if (this.currentScreen !== "gameplay") return;

    for (const slot of [0, 1] as const) {
      const player = state.players[slot];
      const panel = this.screenRoot.querySelector<HTMLElement>(`[data-hud-player="${slot}"]`);
      if (!panel) continue;
      const damage = panel.querySelector<HTMLElement>("[data-hud-damage]");
      const stocks = panel.querySelector<HTMLElement>("[data-hud-stocks]");
      const name = panel.querySelector<HTMLElement>("[data-hud-name]");
      if (damage) damage.textContent = String(Math.max(0, Math.round(player.damage)));
      if (stocks) stocks.innerHTML = this.stockMarkup(player.stocks);
      if (name) name.textContent = player.name ?? fighterById(player.fighter).name;
      panel.classList.toggle("is-danger", player.damage >= 100);
    }

    const announcement = this.screenRoot.querySelector<HTMLElement>("[data-hud-announcement]");
    if (announcement) announcement.textContent = state.announcement ?? "";
    const timer = this.screenRoot.querySelector<HTMLElement>("[data-hud-timer]");
    if (timer) {
      const hasTimer = state.remainingTimeMs !== null && state.remainingTimeMs !== undefined;
      timer.hidden = !hasTimer;
      timer.textContent = hasTimer ? formatMatchTimer(state.remainingTimeMs!) : "";
    }
    this.screenRoot.querySelector<HTMLElement>(".cc-hud")
      ?.classList.toggle("is-sudden-death", Boolean(state.suddenDeath));
  }

  showPause(): void {
    if (this.pauseOverlay || this.destroyed) return;
    this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const overlay = document.createElement("div");
    overlay.className = "cc-modal-layer cc-enter";
    overlay.dataset.ccPause = "";
    overlay.innerHTML = `
      <div class="cc-pause-banner" id="cc-pause-title"><span>Battle</span><strong>Paused</strong></div>
      <section class="cc-pause-panel" role="dialog" aria-modal="true" aria-labelledby="cc-pause-title">
        <h2 class="cc-visually-hidden">Pause</h2>
        <div class="cc-pause-actions">
          <button class="cc-pause-action cc-pause-action--resume" type="button" data-ui-action="pause-resume"><span aria-hidden="true">▶</span><strong>Resume</strong><small>Esc</small></button>
          <button class="cc-pause-action" type="button" data-ui-action="pause-restart"><span aria-hidden="true">↻</span><strong>Restart</strong><small>Same rules</small></button>
          <button class="cc-pause-action cc-pause-action--quit" type="button" data-ui-action="pause-quit"><span aria-hidden="true">↪</span><strong>Quit</strong><small>Main menu</small></button>
        </div>
        <div class="cc-pause-keys" aria-label="Control reminder">
          ${this.pauseKeysMarkup(0)}
          ${this.pauseKeysMarkup(1)}
        </div>
      </section>`;
    this.pauseOverlay = overlay;
    this.shell.append(overlay);
    overlay.querySelector<HTMLElement>("button")?.focus();
  }

  hidePause(restoreFocus = true): void {
    if (!this.pauseOverlay) return;
    this.pauseOverlay.remove();
    this.pauseOverlay = undefined;
    if (restoreFocus) this.lastFocused?.focus();
  }

  showResults(result: MatchResult): void {
    this.hidePause(false);
    const winnerSlot = result.winner;
    const winner = fighterById(this.selectedFighters[winnerSlot]);
    const loserSlot: PlayerSlot = winnerSlot === 0 ? 1 : 0;
    const seconds = Math.max(0, Math.round(result.durationMs / 1000));
    const minutesLabel = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    this.renderScreen(
      "results",
      `
        <section class="cc-results cc-enter cc-results--p${winnerSlot + 1}" aria-labelledby="cc-result-title">
          <div class="cc-results__flare" aria-hidden="true"></div>
          <div class="cc-results__portrait">
            <canvas class="cc-results__victory-pose" width="512" height="512" data-victory-canvas role="img" aria-label="Animated victory pose for ${winner.name}"></canvas>
            <span class="cc-results__victory-fallback" data-victory-fallback>${portraitMarkup(winner.id, false, this.selectedSkins[winnerSlot])}</span>
            <span class="cc-results__win-band">Victory</span>
          </div>
          <div class="cc-results__copy">
            <span class="cc-results__place" aria-hidden="true">1</span>
            <span class="cc-results__eyebrow">Victory • ${escapeHtml(this.playerCpu[winnerSlot] ? `CPU ${winnerSlot + 1}` : this.playerNames[winnerSlot])}</span>
            <h1 id="cc-result-title">${winner.name}<br><em>wins the clash</em></h1>
            <dl class="cc-scoreboard">
              <div><dt>K.-O.</dt><dd>${result.kos[winnerSlot]}</dd></div>
              <div><dt>Falls</dt><dd>${result.kos[loserSlot]}</dd></div>
              <div><dt>Time</dt><dd>${minutesLabel}</dd></div>
            </dl>
            <div class="cc-results__actions">
              <button class="cc-fight-button" type="button" data-ui-action="result-rematch"><span>Same rules</span><strong>Rematch</strong></button>
              <button class="cc-wide-action" type="button" data-ui-action="result-select"><span><strong>Change fighters</strong></span><b aria-hidden="true">→</b></button>
              <button class="cc-text-button" type="button" data-ui-action="result-home">Main menu</button>
            </div>
          </div>
        </section>`,
      "[data-ui-action='result-rematch']",
    );
    this.startVictoryAnimation(winner.id, this.selectedSkins[winnerSlot]);
  }

  toast(message: string, durationMs = 2200): void {
    const toast = this.shell.querySelector<HTMLElement>("[data-cc-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => {
      if (!this.destroyed) toast.classList.remove("is-visible");
    }, durationMs);
  }

  private readonly handleGamepadSnapshot = (snapshot: GamepadUiSnapshot): void => {
    const previous = this.knownGamepadConnections;
    const next = new Map<string, { connected: boolean; player: PlayerSlot | null; name: string }>();
    let connectionStructureChanged = false;
    for (const device of snapshot.devices) {
      const key = `${device.id}::${device.index}`;
      const before = previous?.get(key);
      next.set(key, { connected: device.connected, player: device.assignedPlayer, name: gamepadDeviceName(device) });
      if (!before || before.connected !== device.connected || before.player !== device.assignedPlayer) {
        connectionStructureChanged = true;
      }
      if (previous && device.connected && !before?.connected) {
        this.toast(device.assignedPlayer === null
          ? "Controller connected"
          : `Controller P${device.assignedPlayer + 1} connected`);
      }
    }
    if (previous) {
      for (const [key, device] of previous) {
        const after = next.get(key);
        if (device.connected && !after?.connected) {
          connectionStructureChanged = true;
          this.toast(device.player === null
            ? "Controller disconnected"
            : `Controller P${device.player + 1} disconnected`, 3200);
          if (device.player !== null) {
            this.callbacks.onControllerDisconnected?.(device.player, device.name);
          }
        }
      }
    }
    this.knownGamepadConnections = next;
    this.gamepadSnapshot = snapshot;
    if (connectionStructureChanged && this.reconnectOverlay && this.reconnectPlayer !== undefined) {
      const slot = this.reconnectPlayer;
      const name = this.reconnectDeviceName;
      this.showControllerReconnect(slot, name);
    }
    this.refreshGamepadWorkbench();
  };

  private gamepadStructureSignature(snapshot: GamepadUiSnapshot): string {
    return JSON.stringify({
      devices: snapshot.devices.map(({ id, index, connected, assignedPlayer, family, mapping }) => ({
        id, index, connected, assignedPlayer, family, mapping,
      })),
      sources: snapshot.sources,
      bindings: snapshot.bindings,
      deadzone: snapshot.deadzone,
      activationRequired: snapshot.activationRequired,
      capture: snapshot.capture,
      player: this.gamepadPlayer,
      diagnostic: this.gamepadDiagnosticIndex,
    });
  }

  private refreshGamepadWorkbench(force = false): void {
    if (this.currentScreen !== "controls" || this.controlsTab !== "gamepad") return;
    const host = this.screenRoot.querySelector<HTMLElement>("[data-gamepad-workbench]");
    if (!host) return;
    const signature = this.gamepadStructureSignature(this.gamepadSnapshot);
    if (force || signature !== this.gamepadStructureKey) {
      this.gamepadStructureKey = signature;
      host.innerHTML = this.gamepadWorkbenchMarkup();
      return;
    }
    this.updateGamepadDiagnostic();
  }

  private updateGamepadDiagnostic(): void {
    const device = this.diagnosticGamepad();
    const card = this.screenRoot.querySelector<HTMLElement>("[data-gamepad-device-index]");
    if (!device || !card || card.dataset.gamepadDeviceIndex !== String(device.index)) return;
    const pressed = device.buttons.filter((button) => button.pressed || button.value > 0.5);
    const buttonSignal = card.querySelector<HTMLElement>("[data-gamepad-live-buttons]");
    if (buttonSignal) {
      buttonSignal.innerHTML = pressed.length > 0
        ? pressed.map((button) => `<kbd>${escapeHtml(gamepadButtonLabel(button.index, device.family))}</kbd>`).join("")
        : "<small>None</small>";
    }
    const status = card.querySelector<HTMLElement>("[data-gamepad-live-status]");
    if (status) {
      status.textContent = device.connected ? "Connected" : "Disconnected";
      status.classList.toggle("is-connected", device.connected);
    }
    for (const [index, label] of ["LX", "LY", "RX", "RY"].entries()) {
      const axis = card.querySelector<HTMLElement>(`[data-gamepad-axis="${index}"]`);
      if (!axis) continue;
      const raw = device.axesRaw[index] ?? 0;
      const processed = device.axes[index] ?? 0;
      axis.outerHTML = this.gamepadAxisMarkup(label, raw, processed, index);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.matchLaunch?.controller.abort(new DOMException("Interface destroyed", "AbortError"));
    this.matchLaunch = undefined;
    this.matchLaunchGeneration += 1;
    this.labLoadGeneration += 1;
    this.removeGamepadSubscription?.();
    this.removeGamepadSubscription = undefined;
    if (this.bootTimer !== undefined) window.clearTimeout(this.bootTimer);
    this.labController?.destroy();
    if (this.victoryAnimationFrame !== undefined) cancelAnimationFrame(this.victoryAnimationFrame);
    this.shell.removeEventListener("click", this.handleClick);
    this.shell.removeEventListener("change", this.handleChange);
    this.shell.removeEventListener("input", this.handleInput);
    this.shell.removeEventListener("keydown", this.handleKeydown);
    this.shell.removeEventListener("pointerdown", this.handlePointerDown);
    this.shell.removeEventListener("pointermove", this.handlePointerMove);
    this.shell.removeEventListener("pointerover", this.handlePointerOver);
    this.shell.removeEventListener("focusin", this.handleFocusIn);
    this.hideControllerReconnect();
    this.shell.remove();
    this.root.classList.remove("cc-ui-host");
  }

  private renderScreen(screen: UIScreen, markup: string, focusSelector?: string): void {
    if (this.currentScreen === "controls" && screen !== "controls") {
      this.pendingBinding = undefined;
      this.gamepadAdapter?.cancelCapture();
    }
    if (this.currentScreen === "lab" && screen !== "lab") this.labLoadGeneration += 1;
    this.labController?.destroy();
    this.labController = undefined;
    if (this.victoryAnimationFrame !== undefined) {
      cancelAnimationFrame(this.victoryAnimationFrame);
      this.victoryAnimationFrame = undefined;
    }
    this.currentScreen = screen;
    this.shell.dataset.screen = screen;
    this.screenRoot.innerHTML = markup;
    this.callbacks.onScreenChange?.(screen);
    this.emit("screenchange", screen);
    if (focusSelector) {
      requestAnimationFrame(() => {
        if (!this.destroyed && this.currentScreen === screen) {
          // Moving focus into a newly rendered screen is accessibility work,
          // not a second navigation action. Keep it silent so the preceding
          // confirm/back cue is not perceived as duplicated audio.
          this.suppressFocusSound = true;
          this.screenRoot.querySelector<HTMLElement>(focusSelector)?.focus();
          this.suppressFocusSound = false;
        }
      });
    }
  }

  private characterSelectFocusSelector(): string | undefined {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.screenRoot.contains(active)) return undefined;
    if (active.matches(".cc-roster-grid .cc-fighter-card")) {
      const fighter = active.dataset.fighter;
      // Every roster redraw changes data-fighter-slot to the newly active
      // player. Preserve the cursor's fighter rather than retaining a selector
      // that can no longer exist after Digit1 / Digit2 switches player.
      return fighter
        ? `[data-ui-action='pick-fighter'][data-fighter='${fighter}']`
        : undefined;
    }
    const attributes = [
      "data-ui-action",
      "data-ui-field",
      "data-player-slot",
      "data-player-cpu",
      "data-fighter-slot",
      "data-fighter",
      "data-skin",
    ];
    const selector = attributes
      .map((name) => {
        const value = active.getAttribute(name);
        return value === null ? "" : `[${name}='${value}']`;
      })
      .join("");
    return selector ? `${active.tagName.toLowerCase()}${selector}` : undefined;
  }

  private startVictoryAnimation(fighter: FighterId, skin: SkinId): void {
    const generation = ++this.victoryLoadGeneration;
    const canvas = this.screenRoot.querySelector<HTMLCanvasElement>("[data-victory-canvas]");
    const fallback = this.screenRoot.querySelector<HTMLElement>("[data-victory-fallback]");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    void import("../game/characterAssets").then(({
      REMOTE_ANIMATION_CONFIG,
      remoteAnimationSetForFighter,
    }) => {
      if (this.destroyed || generation !== this.victoryLoadGeneration || this.currentScreen !== "results") return;
      const definition = remoteAnimationSetForFighter(
        fighter,
        skin,
        REMOTE_ANIMATION_CONFIG,
      ).animations.victory;
      const image = new Image();
      image.decoding = "async";
      image.addEventListener("load", () => {
        if (generation !== this.victoryLoadGeneration || this.currentScreen !== "results") return;
        fallback?.setAttribute("hidden", "");
        const startedAt = performance.now();
        const draw = (timestamp: number): void => {
          if (this.destroyed || this.currentScreen !== "results") return;
          const frame = Math.floor(((timestamp - startedAt) / 1000) * definition.fps) % definition.frameCount;
          const sourceX = (frame % definition.columns) * definition.cellSize;
          const sourceY = Math.floor(frame / definition.columns) * definition.cellSize;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            image,
            sourceX,
            sourceY,
            definition.cellSize,
            definition.cellSize,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          this.victoryAnimationFrame = requestAnimationFrame(draw);
        };
        canvas.style.filter = "none";
        this.victoryAnimationFrame = requestAnimationFrame(draw);
      }, { once: true });
      image.src = definition.mediaUrl;
    });
  }

  private screenHeader(
    title: string,
    subtitle: string,
    backAction: string,
    id = "cc-select-title",
  ): string {
    return `
      <header class="cc-screen-header">
        <button class="cc-back-button" type="button" data-ui-action="${backAction}" aria-label="Back"><span aria-hidden="true">←</span> Back</button>
        <div><p>${escapeHtml(subtitle)}</p><h1 id="${id}">${escapeHtml(title)}</h1></div>
        <span class="cc-screen-header__rule" aria-hidden="true"></span>
      </header>`;
  }

  private playerPanelMarkup(slot: PlayerSlot): string {
    const fighter = fighterById(this.selectedFighters[slot]);
    const skins = getFighterSkins(fighter.id);
    const isCpu = this.playerCpu[slot];
    const active = slot === this.activePlayer;
    const confirmed = this.playerConfirmed[slot];
    const selectedSkin = getFighterSkin(fighter.id, this.selectedSkins[slot]);
    const skinNumber = skins.findIndex(({ id }) => id === selectedSkin.id) + 1;
    return `
      <article class="cc-player-panel cc-player-panel--p${slot + 1}${active ? " is-active" : ""}${confirmed ? " is-confirmed" : ""}" aria-labelledby="cc-player-${slot}-title">
        <div class="cc-player-panel__topline">
          <button class="cc-player-activate" type="button" data-ui-action="activate-player" data-player-slot="${slot}" aria-pressed="${active}">
            <span id="cc-player-${slot}-title">P${slot + 1}</span><strong>Player ${slot + 1}</strong><small>${active ? "Selecting" : "Edit"}</small>
          </button>
          <div class="cc-mode-toggle" aria-label="Player ${slot + 1} type">
            <button type="button" class="${isCpu ? "" : "is-selected"}" aria-pressed="${!isCpu}" data-ui-action="set-player-mode" data-player-slot="${slot}" data-player-cpu="false">Human</button>
            <button type="button" class="${isCpu ? "is-selected" : ""}" aria-pressed="${isCpu}" data-ui-action="set-player-mode" data-player-slot="${slot}" data-player-cpu="true">CPU</button>
          </div>
          <input class="cc-player-name-input" type="text" maxlength="12" value="${escapeHtml(this.playerNames[slot])}" data-ui-field="player-name" data-player-slot="${slot}" aria-label="Player ${slot + 1} name" ${isCpu || confirmed ? "disabled" : ""}>
        </div>
        <div class="cc-selected-fighter">
          <button class="cc-selected-fighter__portrait cc-skin-cycle" type="button" data-ui-action="cycle-skin" data-player-slot="${slot}" aria-label="Change ${fighter.name}'s skin for player ${slot + 1}. Skin ${skinNumber} of ${skins.length}" ${skins.length <= 1 ? "disabled" : ""}>
            ${portraitMarkup(fighter.id, false, selectedSkin.id)}
          </button>
          <div class="cc-selected-fighter__copy">
            <span>${fighter.epithet}</span>
            <h2>${fighter.name}</h2>
            <p>${fighter.style}</p>
          </div>
        </div>
        <label class="cc-cpu-level${isCpu ? "" : " is-hidden"}">
          <span>CPU level</span>
          <select data-ui-field="cpu-level" data-player-slot="${slot}">
            <option value="1"${this.cpuLevels[slot] === 1 ? " selected" : ""}>1 • Relaxed</option>
            <option value="2"${this.cpuLevels[slot] === 2 ? " selected" : ""}>2 • Aggressive</option>
            <option value="3"${this.cpuLevels[slot] === 3 ? " selected" : ""}>3 • Fierce</option>
          </select>
        </label>
        <div class="cc-player-panel__footer">
          <button class="cc-player-ready${confirmed ? " is-confirmed" : ""}" type="button" data-ui-action="toggle-player-ready" data-player-slot="${slot}" aria-pressed="${confirmed}">
            <span>${confirmed ? "✓" : "P" + (slot + 1)}</span>
            <strong>${confirmed ? "Ready!" : "Confirm"}</strong>
            <small>${confirmed ? "Click to edit" : `${fighter.name} • ${selectedSkin.label}`}</small>
          </button>
        </div>
      </article>`;
  }

  private rosterGridMarkup(): string {
    return `
      <div class="cc-roster-zone">
        <div class="cc-roster-zone__label"><span>Roster</span><strong>Player ${this.activePlayer + 1}, choose now</strong><small>Press <kbd>1</kbd> / <kbd>2</kbd> to switch players</small></div>
        <div class="cc-roster-grid" style="--cc-roster-desktop-columns: ${DEFAULT_ROSTER_LAYOUT.columns}; --cc-roster-desktop-rows: ${DEFAULT_ROSTER_LAYOUT.rows}; --cc-roster-compact-columns: ${COMPACT_ROSTER_LAYOUT.columns}; --cc-roster-compact-rows: ${COMPACT_ROSTER_LAYOUT.rows}" data-roster-columns="${DEFAULT_ROSTER_LAYOUT.columns}" data-roster-rows="${DEFAULT_ROSTER_LAYOUT.rows}" role="radiogroup" aria-label="Player ${this.activePlayer + 1} fighter">
          ${FIGHTERS.map((candidate) => {
            const selectedByActive = candidate.id === this.selectedFighters[this.activePlayer];
            const selectedByP1 = candidate.id === this.selectedFighters[0];
            const selectedByP2 = candidate.id === this.selectedFighters[1];
            const openPrototype = candidate.openContent &&
              candidate.visualReady &&
              !candidate.productionReady;
            const availabilityLabel = !candidate.visualReady
              ? "Render required"
              : openPrototype ? "Open prototype" : candidate.epithet;
            const availabilityDescription = !candidate.visualReady
              ? ", render required"
              : openPrototype ? ", prototype open" : "";
            const owners = [selectedByP1 ? "player 1" : "", selectedByP2 ? "player 2" : ""].filter(Boolean).join(" and ");
            return `
              <button type="button" class="cc-fighter-card${selectedByActive ? " is-selected" : ""}${candidate.visualReady ? "" : " is-unavailable"}${openPrototype ? " is-open-prototype" : ""}" style="--cc-fighter-primary: ${candidate.primary}; --cc-fighter-secondary: ${candidate.secondary}; --cc-fighter-accent: ${candidate.accent}" role="radio" aria-checked="${selectedByActive}" aria-label="${candidate.name}, ${candidate.epithet}${availabilityDescription}${owners ? `, selected by ${owners}` : ""}" data-ui-action="pick-fighter" data-fighter-slot="${this.activePlayer}" data-fighter="${candidate.id}" data-open-content="${candidate.openContent}" data-production-ready="${candidate.productionReady}" ${candidate.visualReady ? "" : "disabled aria-disabled=\"true\""}>
                ${portraitMarkup(candidate.id, false, "00", true)}
                <span class="cc-fighter-card__wash" aria-hidden="true"></span>
                <span class="cc-fighter-card__name"><small class="${openPrototype ? "is-prototype" : ""}">${availabilityLabel}</small><strong>${candidate.name}</strong></span>
                <span class="cc-fighter-card__owners" aria-hidden="true">${selectedByP1 ? '<i class="is-p1">P1</i>' : ""}${selectedByP2 ? '<i class="is-p2">P2</i>' : ""}</span>
              </button>`;
          }).join("")}
        </div>
      </div>`;
  }

  private rangeMarkup(
    key: "musicVolume" | "effectsVolume" | "shake" | "flashes",
    label: string,
    value: number,
    lowLabel: string,
    highLabel: string,
  ): string {
    const percentage = Math.round(value * 100);
    return `
      <label class="cc-range-row">
        <span class="cc-range-row__label"><strong>${label}</strong><output data-setting-output="${key}">${percentage}%</output></span>
        <input type="range" min="0" max="100" step="1" value="${percentage}" data-ui-setting="${key}" aria-label="${label}">
        <span class="cc-range-row__ends"><small>${lowLabel}</small><small>${highLabel}</small></span>
      </label>`;
  }

  private connectedGamepads(): GamepadUiDevice[] {
    return this.gamepadSnapshot.devices.filter((device) => device.connected);
  }

  private gamepadForPlayer(slot: PlayerSlot): GamepadUiDevice | undefined {
    const source = this.gamepadSnapshot.sources[slot];
    if (source.type !== "gamepad") return undefined;
    return this.gamepadSnapshot.devices.find((device) => device.index === source.index);
  }

  private diagnosticGamepad(): GamepadUiDevice | undefined {
    const connected = this.connectedGamepads();
    const assigned = this.gamepadForPlayer(this.gamepadPlayer);
    const requested = connected.find((device) => device.index === this.gamepadDiagnosticIndex);
    const selected = requested ?? assigned ?? connected[0];
    this.gamepadDiagnosticIndex = selected?.index;
    return selected;
  }

  private gamepadWorkbenchMarkup(): string {
    const snapshot = this.gamepadSnapshot;
    const connected = this.connectedGamepads();
    const selectedDevice = this.diagnosticGamepad();
    const assignedDevice = this.gamepadForPlayer(this.gamepadPlayer);
    const mappingDevice = assignedDevice ?? selectedDevice;
    const family = mappingDevice?.family ?? "generic";
    const capture = snapshot.capture;
    const activationMessage = connected.length === 0 || snapshot.activationRequired;

    return `
      <div class="cc-gamepad-status${connected.length > 0 ? " is-connected" : " is-waiting"}">
        <span class="cc-gamepad-status__signal" aria-hidden="true"><i></i><i></i><i></i></span>
        <div><strong>${connected.length > 0 ? `${connected.length} controller${connected.length === 1 ? "" : "s"} ready` : "Looking for a controller"}</strong><small>${activationMessage ? "Press a button to connect the controller" : "Automatic connection active • hot-plug supported"}</small></div>
        <b>${connected.length > 0 ? "ONLINE" : "WAITING"}</b>
      </div>

      <section class="cc-gamepad-routing" aria-labelledby="cc-gamepad-routing-title">
        <header>
          <div><small>01 / Assignment</small><h2 id="cc-gamepad-routing-title">Who controls whom?</h2></div>
          <button type="button" data-ui-action="gamepad-swap" ${connected.length === 0 ? "disabled" : ""}><span aria-hidden="true">⇄</span> Swap P1 / P2</button>
        </header>
        <div class="cc-gamepad-routing__players">
          ${([0, 1] as const).map((slot) => this.gamepadAssignmentMarkup(slot)).join("")}
        </div>
      </section>

      <div class="cc-gamepad-player-tabs" role="tablist" aria-label="Player to configure">
        ${([0, 1] as const).map((slot) => `
          <button type="button" role="tab" aria-selected="${this.gamepadPlayer === slot}" class="${this.gamepadPlayer === slot ? "is-active" : ""}" data-ui-action="gamepad-player" data-player-slot="${slot}">
            <span>P${slot + 1}</span><strong>${escapeHtml(gamepadSourceLabel(snapshot.sources[slot], snapshot.devices))}</strong>
          </button>`).join("")}
      </div>

      <div class="cc-gamepad-config-grid">
        <section class="cc-gamepad-mapping" aria-labelledby="cc-gamepad-mapping-title">
          <header>
            <div><small>02 / Mapping P${this.gamepadPlayer + 1}</small><h2 id="cc-gamepad-mapping-title">Actions</h2></div>
            <button type="button" data-ui-action="gamepad-reset" data-player-slot="${this.gamepadPlayer}">Restore default controls</button>
          </header>
          <div class="cc-gamepad-stick-map" aria-label="Sticks analogiques">
            <div><span aria-hidden="true" class="cc-stick-glyph"><i></i></span><strong>Left stick</strong><small>Movement • down drops through platforms</small></div>
            <div><span aria-hidden="true" class="cc-stick-glyph cc-stick-glyph--smash"><i></i></span><strong>Right stick</strong><small>Directional smash attacks</small></div>
          </div>
          <div class="cc-gamepad-binding-list">
            ${ACTIONS.map((action) => {
              const value = snapshot.bindings[this.gamepadPlayer][action.id];
              const listening = capture?.player === this.gamepadPlayer && capture.action === action.id;
              return `
                <div class="cc-gamepad-binding-row${listening ? " is-listening" : ""}">
                  <span><strong>${action.shortLabel}</strong><small>${action.label}</small></span>
                  <button type="button" data-ui-action="gamepad-binding-capture" data-player-slot="${this.gamepadPlayer}" data-binding-action="${action.id}" ${connected.length === 0 ? "disabled" : ""} aria-label="Add a button for ${action.label}">
                    ${listening ? '<em>Press…</em>' : `<kbd>${escapeHtml(gamepadButtonLabel(value, family))}</kbd>`}
                  </button>
                </div>`;
            }).join("")}
          </div>
          <label class="cc-gamepad-deadzone">
            <span><strong>Stick deadzone</strong><small>Removes drift without losing small movements</small></span>
            <input type="range" min="5" max="35" step="1" value="${Math.round(snapshot.deadzone * 100)}" data-ui-gamepad-deadzone aria-label="Stick deadzone">
            <output data-gamepad-deadzone-output>${Math.round(snapshot.deadzone * 100)}%</output>
          </label>
        </section>

        <section class="cc-gamepad-diagnostic" aria-labelledby="cc-gamepad-diagnostic-title">
          <header>
            <div><small>03 / Live signal</small><h2 id="cc-gamepad-diagnostic-title">Controller tester</h2></div>
            ${connected.length > 1 ? `
              <select data-ui-field="gamepad-diagnostic" aria-label="Tested controller">
                ${connected.map((device) => `<option value="${device.index}"${device.index === selectedDevice?.index ? " selected" : ""}>${escapeHtml(gamepadDeviceName(device))}</option>`).join("")}
              </select>` : ""}
          </header>
          ${selectedDevice ? this.gamepadDiagnosticMarkup(selectedDevice) : `
            <div class="cc-gamepad-empty">
              <span aria-hidden="true">◌</span>
              <strong>Press a button to connect the controller</strong>
              <p>Some Mac browsers reveal a controller only after its first button press. This step cannot be skipped.</p>
            </div>`}
        </section>
      </div>
      <p class="cc-controls-note cc-controls-note--gamepad"><span aria-hidden="true">◉</span> A confirms, B goes back, the left stick or D-pad navigates, and + opens pause. The system button is never used.</p>`;
  }

  private gamepadAssignmentMarkup(slot: PlayerSlot): string {
    const snapshot = this.gamepadSnapshot;
    const source = snapshot.sources[slot];
    const device = this.gamepadForPlayer(slot);
    return `
      <article class="cc-gamepad-assignment cc-gamepad-assignment--p${slot + 1}">
        <span class="cc-gamepad-assignment__player">P${slot + 1}</span>
        <div><small>Active source</small><strong>${escapeHtml(gamepadSourceLabel(source, snapshot.devices))}</strong><em>${device?.connected ? "Connected" : source.type === "keyboard" ? "Ready" : "Disconnected"}</em></div>
        <label>
          <span class="cc-visually-hidden">Player ${slot + 1} source</span>
          <select data-ui-field="gamepad-assignment" data-player-slot="${slot}">
            <option value="keyboard"${source.type === "keyboard" ? " selected" : ""}>Keyboard P${slot + 1}</option>
            ${this.gamepadSnapshot.devices.map((candidate) => {
              const selected = source.type === "gamepad" && source.index === candidate.index;
              const unavailable = candidate.assignedPlayer !== null && candidate.assignedPlayer !== slot;
              return `<option value="gamepad:${candidate.index}"${selected ? " selected" : ""}${!candidate.connected || unavailable ? " disabled" : ""}>${escapeHtml(gamepadDeviceName(candidate))}${unavailable ? ` • P${candidate.assignedPlayer! + 1}` : candidate.connected ? "" : " • offline"}</option>`;
            }).join("")}
          </select>
        </label>
      </article>`;
  }

  private gamepadDiagnosticMarkup(device: GamepadUiDevice): string {
    const pressed = device.buttons.filter((button) => button.pressed || button.value > 0.5);
    const axisNames = ["LX", "LY", "RX", "RY"];
    const axes = axisNames.map((label, index) => ({
      label,
      raw: device.axesRaw[index] ?? 0,
      processed: device.axes[index] ?? 0,
    }));
    const assigned = device.assignedPlayer === null ? "Unassigned" : `P${device.assignedPlayer + 1}`;
    return `
      <div class="cc-gamepad-device-card" data-gamepad-device-index="${device.index}">
        <div class="cc-gamepad-device-card__identity">
          <span class="cc-gamepad-device-icon" aria-hidden="true"><i></i><b></b></span>
          <div><strong data-gamepad-live-name>${escapeHtml(gamepadDeviceName(device))}</strong><small data-gamepad-live-meta>${escapeHtml(device.mapping || "Browser mapping")} • ${assigned}</small></div>
          <em class="${device.connected ? "is-connected" : ""}" data-gamepad-live-status>${device.connected ? "Connected" : "Disconnected"}</em>
        </div>
        <div class="cc-gamepad-live-block">
          <span class="cc-gamepad-live-block__label">Pressed buttons</span>
          <div class="cc-gamepad-button-signal" data-gamepad-live-buttons>${pressed.length > 0 ? pressed.map((button) => `<kbd>${escapeHtml(gamepadButtonLabel(button.index, device.family))}</kbd>`).join("") : "<small>None</small>"}</div>
        </div>
        <div class="cc-gamepad-live-block">
          <span class="cc-gamepad-live-block__label">Axes • raw / after deadzone</span>
          <div class="cc-gamepad-axes" data-gamepad-live-axes>
            ${axes.map((axis, index) => this.gamepadAxisMarkup(axis.label, axis.raw, axis.processed, index)).join("")}
          </div>
        </div>
        <div class="cc-gamepad-live-block cc-gamepad-live-block--map">
          <span class="cc-gamepad-live-block__label">Active mapping P${this.gamepadPlayer + 1}</span>
          <div>${ACTIONS.filter((action) => ["attack", "special", "jump", "shield", "grab", "pause"].includes(action.id)).map((action) => `<span><strong>${action.shortLabel}</strong><kbd>${escapeHtml(gamepadButtonLabel(this.gamepadSnapshot.bindings[this.gamepadPlayer][action.id], device.family))}</kbd></span>`).join("")}</div>
        </div>
      </div>`;
  }

  private gamepadAxisMarkup(label: string, raw: number, processed: number, index: number): string {
    const safeRaw = Math.max(-1, Math.min(1, Number.isFinite(raw) ? raw : 0));
    const safeProcessed = Math.max(-1, Math.min(1, Number.isFinite(processed) ? processed : 0));
    return `
      <div class="cc-gamepad-axis" data-gamepad-axis="${index}">
        <strong>${label}</strong>
        <span class="cc-gamepad-axis__track"><i style="--axis-position:${(50 + safeProcessed * 46).toFixed(2)}%"></i></span>
        <code data-gamepad-axis-values>${safeRaw.toFixed(2)} / ${safeProcessed.toFixed(2)}</code>
      </div>`;
  }

  private controlPanelMarkup(slot: PlayerSlot): string {
    return `
      <article class="cc-control-panel cc-control-panel--p${slot + 1}">
        <header><span>P${slot + 1}</span><div><h2>Player ${slot + 1}</h2><p>${slot === 0 ? "Left side • Keyboard" : "Right side • Arrow keys"}</p></div><button type="button" data-ui-action="bindings-reset-slot" data-player-slot="${slot}">Reset</button></header>
        <div class="cc-binding-list">
          ${ACTIONS.map((action) => {
            const code = this.settings.bindings[slot][action.id];
            return `<div class="cc-binding-row"><span><strong>${action.shortLabel}</strong><small>${action.label}</small></span><button type="button" data-ui-action="binding-capture" data-player-slot="${slot}" data-binding-action="${action.id}" aria-label="Change ${action.label}, currently ${escapeHtml(this.keyLabel(code))}"><kbd>${escapeHtml(this.keyLabel(code))}</kbd></button></div>`;
          }).join("")}
        </div>
      </article>`;
  }

  private hudPlayerMarkup(slot: PlayerSlot, state: HUDPlayerState): string {
    const fighter = fighterById(state.fighter);
    return `
      <article class="cc-hud-player cc-hud-player--p${slot + 1}${state.damage >= 100 ? " is-danger" : ""}" data-hud-player="${slot}">
        <div class="cc-hud-player__portrait">${portraitMarkup(state.fighter, true, state.skin ?? "00")}</div>
        <div class="cc-hud-player__identity"><span>P${slot + 1}</span><strong data-hud-name>${escapeHtml(state.name ?? fighter.name)}</strong></div>
        <div class="cc-hud-player__damage"><strong data-hud-damage>${Math.max(0, Math.round(state.damage))}</strong><span>%</span></div>
        <div class="cc-hud-player__stocks" data-hud-stocks>${this.stockMarkup(state.stocks)}</div>
      </article>`;
  }

  private stockMarkup(stocks: number): string {
    return Array.from({ length: Math.max(0, stocks) }, () => '<i aria-hidden="true"></i>').join("");
  }

  private pauseKeysMarkup(slot: PlayerSlot): string {
    const controller = this.gamepadForPlayer(slot);
    const source = this.gamepadSnapshot.sources[slot];
    if (source.type === "gamepad") {
      const bindings = this.gamepadSnapshot.bindings[slot];
      const family = controller?.family ?? "generic";
      return `
        <div><strong>P${slot + 1} • ${escapeHtml(controller ? gamepadDeviceName(controller) : "Controller")}</strong>
          <span><kbd>${escapeHtml(gamepadButtonLabel(bindings.attack, family))}</kbd> attack</span>
          <span><kbd>${escapeHtml(gamepadButtonLabel(bindings.special, family))}</kbd> special</span>
          <span><kbd>${escapeHtml(gamepadButtonLabel(bindings.shield, family))}</kbd> shield</span>
          <span><kbd>${escapeHtml(gamepadButtonLabel(bindings.grab, family))}</kbd> grab</span>
        </div>`;
    }
    const bindings = this.settings.bindings[slot];
    return `
      <div><strong>P${slot + 1}</strong>
        <span><kbd>${escapeHtml(this.keyLabel(bindings.attack))}</kbd> attack</span>
        <span><kbd>${escapeHtml(this.keyLabel(bindings.special))}</kbd> special</span>
        <span><kbd>${escapeHtml(this.keyLabel(bindings.shield))}</kbd> shield</span>
        <span><kbd>${escapeHtml(this.keyLabel(bindings.grab))}</kbd> grab</span>
      </div>`;
  }

  private startMatch(): void {
    if (this.matchLaunch) return;
    const config = this.getMatchConfig();
    const generation = ++this.matchLaunchGeneration;
    const controller = new AbortController();
    this.matchLaunch = { controller, generation };
    this.showMatchLoading(config);

    const complete = (): void => {
      if (
        this.destroyed ||
        controller.signal.aborted ||
        this.matchLaunch?.generation !== generation
      ) return;
      this.matchLaunch = undefined;
      this.lastMatchConfig = config;
      this.emit("startmatch", config);
      this.showHud();
    };
    const fail = (error: unknown): void => {
      if (this.matchLaunch?.generation !== generation) return;
      this.matchLaunch = undefined;
      if (controller.signal.aborted) return;
      console.error("Could not prepare the battle", error);
      this.showStageSelect();
      this.toast("Loading failed. You can try again.", 3200);
    };

    try {
      const result = this.callbacks.onStartMatch?.(config, {
        signal: controller.signal,
        reportProgress: (progress) => {
          if (this.matchLaunch?.generation === generation) this.updateMatchLoading(progress);
        },
      });
      if (result && typeof result.then === "function") {
        void result.then(complete, fail);
      } else {
        complete();
      }
    } catch (error) {
      fail(error);
    }
  }

  private cancelMatchLaunch(): void {
    const launch = this.matchLaunch;
    if (!launch) return;
    this.matchLaunch = undefined;
    this.matchLaunchGeneration += 1;
    launch.controller.abort(new DOMException("Loading canceled", "AbortError"));
    this.callbacks.onUiSound?.("back");
    this.showStageSelect();
  }

  private publishSettings(): void {
    const settings = this.getSettings();
    this.callbacks.onSettingsChange?.(settings);
    this.emit("settingschange", settings);
  }

  private publishBindings(): void {
    const bindings = cloneBindings(this.settings.bindings);
    this.callbacks.onBindingsChange?.(bindings);
    this.emit("bindingschange", bindings);
    this.publishSettings();
  }

  private emit<K extends keyof UIControllerEventMap>(name: K, detail: UIControllerEventMap[K]): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
    this.root.dispatchEvent(
      new CustomEvent(`super-bash-folds:${name}`, { detail, bubbles: true }),
    );
  }

  private setBinding(slot: PlayerSlot, action: ActionName, code: string): void {
    const bindings = this.settings.bindings[slot];
    const duplicate = ACTIONS.find(
      (candidate) => candidate.id !== action && bindings[candidate.id] === code,
    );
    const oldCode = bindings[action];
    bindings[action] = code;
    if (duplicate) bindings[duplicate.id] = oldCode;
    this.pendingBinding = undefined;
    this.publishBindings();
    this.showControls(this.controlsReturn);
    this.toast(duplicate ? "Keys swapped" : `${this.keyLabel(code)} assigned`);
  }

  private resetSettings(): void {
    this.settings = {
      ...DEFAULT_SETTINGS,
      bindings: cloneBindings(DEFAULT_BINDINGS),
    };
    this.publishSettings();
    this.showSettings();
    this.toast("Settings reset");
  }

  private resumeMatch(): void {
    this.hidePause();
    this.callbacks.onUiSound?.("back");
    this.callbacks.onResume?.();
    this.emit("resume", undefined);
  }

  private restartMatch(): void {
    this.hidePause(false);
    if (!this.callbacks.onRestart && this.lastMatchConfig) {
      this.startMatch();
      return;
    }
    this.callbacks.onRestart?.();
    this.emit("restart", undefined);
    this.showHud();
  }

  private quitToMenu(): void {
    this.hidePause(false);
    this.callbacks.onQuitToMenu?.();
    this.emit("quittomenu", undefined);
    this.showHome();
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest("[data-ui-action]") as HTMLElement | null;
    if (!trigger) return;
    const action = trigger.dataset.uiAction;
    if (!action) return;

    if (
      action !== "set-skin" &&
      !action.startsWith("back") &&
      !action.endsWith("back") &&
      !action.includes("quit")
    ) {
      this.callbacks.onUiSound?.("confirm");
    }

    switch (action) {
      case "boot-skip":
        this.showTitle();
        break;
      case "title-start":
        this.showHome();
        break;
      case "home-play":
        this.playerConfirmed = [false, false];
        this.showCharacterSelect();
        break;
      case "home-settings":
        this.showSettings();
        break;
      case "home-how":
        this.showHowToPlay();
        break;
      case "home-controls":
        this.showControls("home");
        break;
      case "controls-tab":
        if (trigger.dataset.controlsTab === "keyboard" || trigger.dataset.controlsTab === "gamepad") {
          this.controlsTab = trigger.dataset.controlsTab;
          this.pendingBinding = undefined;
          this.gamepadAdapter?.cancelCapture();
          this.gamepadStructureKey = "";
          this.showControls(this.controlsReturn);
        }
        break;
      case "home-lab":
        this.showLab();
        break;
      case "back-home":
        this.callbacks.onUiSound?.("back");
        this.showHome();
        break;
      case "open-controls-settings":
        this.showControls("settings");
        break;
      case "controls-back":
        this.callbacks.onUiSound?.("back");
        this.gamepadAdapter?.cancelCapture();
        if (this.controlsReturn === "settings") this.showSettings();
        else this.showHome();
        break;
      case "pick-fighter": {
        const requestedSlot = this.readSlot(trigger.dataset.fighterSlot);
        const fighter = FIGHTERS.find((candidate) => candidate.id === trigger.dataset.fighter);
        if (requestedSlot !== undefined && fighter) {
          this.selectFighterForPlayer(this.pointerSelectionSlot(requestedSlot), fighter.id);
        }
        break;
      }
      case "activate-player": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        if (slot !== undefined) {
          this.activePlayer = slot;
          this.showCharacterSelect();
        }
        break;
      }
      case "set-player-mode": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        if (slot !== undefined) {
          this.playerCpu[slot] = trigger.dataset.playerCpu === "true";
          this.playerConfirmed[slot] = false;
          this.showCharacterSelect();
        }
        break;
      }
      case "cycle-skin": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        if (slot !== undefined) {
          const skins = getFighterSkins(this.selectedFighters[slot]);
          const currentIndex = skins.findIndex(({ id }) => id === this.selectedSkins[slot]);
          this.selectedSkins[slot] = skins[(currentIndex + 1) % skins.length]!.id;
          this.activePlayer = slot;
          this.playerConfirmed[slot] = false;
          this.showCharacterSelect();
        }
        break;
      }
      case "toggle-player-ready": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        if (slot !== undefined) {
          this.playerConfirmed[slot] = !this.playerConfirmed[slot];
          if (this.playerConfirmed[slot] && !this.playerConfirmed[slot === 0 ? 1 : 0]) {
            this.activePlayer = slot === 0 ? 1 : 0;
          }
          this.showCharacterSelect();
        }
        break;
      }
      case "open-stage-select":
        if (this.playerConfirmed.every(Boolean)) this.showStageSelect();
        else this.toast("Both players must confirm their fighter");
        break;
      case "select-stage":
        if (STAGE_IDS.some((stage) => stage === trigger.dataset.stage)) {
          this.selectedStage = trigger.dataset.stage as StageId;
          this.showStageSelect();
        }
        break;
      case "stage-confirm":
        this.startMatch();
        break;
      case "loading-cancel":
        this.cancelMatchLaunch();
        break;
      case "stage-back":
        this.callbacks.onUiSound?.("back");
        this.showCharacterSelect();
        break;
      case "toggle-items":
        this.settings.items = !this.settings.items;
        this.publishSettings();
        this.showCharacterSelect();
        break;
      case "start-match":
        this.startMatch();
        break;
      case "binding-capture": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        const bindingAction = ACTIONS.find(
          (candidate) => candidate.id === trigger.dataset.bindingAction,
        );
        if (slot !== undefined && bindingAction) {
          this.pendingBinding = { slot, action: bindingAction.id };
          trigger.classList.add("is-listening");
          trigger.innerHTML = "<span>Press…</span>";
          this.liveRegion.textContent = `Press the new key for ${bindingAction.label}. Esc cancels.`;
        }
        break;
      }
      case "bindings-reset-slot": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        if (slot !== undefined) {
          this.settings.bindings[slot] = { ...DEFAULT_BINDINGS[slot] };
          this.publishBindings();
          this.showControls(this.controlsReturn);
          this.toast(`Controls P${slot + 1} reset`);
        }
        break;
      }
      case "gamepad-player": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        if (slot !== undefined) {
          this.gamepadPlayer = slot;
          this.gamepadDiagnosticIndex = this.gamepadForPlayer(slot)?.index ?? this.gamepadDiagnosticIndex;
          this.gamepadAdapter?.cancelCapture();
          this.gamepadStructureKey = "";
          this.refreshGamepadWorkbench(true);
        }
        break;
      }
      case "gamepad-swap":
        this.gamepadAdapter?.swapAssignments();
        this.toast("P1 and P2 sources swapped");
        break;
      case "gamepad-binding-capture": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        const bindingAction = ACTIONS.find(
          (candidate) => candidate.id === trigger.dataset.bindingAction,
        );
        if (slot !== undefined && bindingAction && this.gamepadAdapter) {
          this.gamepadAdapter.startCapture(slot, bindingAction.id);
          this.liveRegion.textContent = `Press an additional button for ${bindingAction.label}. Esc cancels.`;
        }
        break;
      }
      case "gamepad-reset": {
        const slot = this.readSlot(trigger.dataset.playerSlot);
        if (slot !== undefined) {
          this.gamepadAdapter?.resetBindings(slot);
          this.toast(`Controls controller P${slot + 1} restored`);
        }
        break;
      }
      case "reconnect-gamepad": {
        const slot = this.reconnectPlayer;
        const gamepadIndex = Number(trigger.dataset.gamepadIndex);
        if (slot !== undefined && Number.isInteger(gamepadIndex)) {
          this.gamepadAdapter?.assign(gamepadIndex, slot);
          this.hideControllerReconnect();
          this.callbacks.onControllerReconnectResolved?.(slot);
        }
        break;
      }
      case "reconnect-keyboard": {
        const slot = this.reconnectPlayer;
        if (slot !== undefined) {
          this.gamepadAdapter?.useKeyboard(slot);
          this.hideControllerReconnect();
          this.callbacks.onControllerReconnectResolved?.(slot);
        }
        break;
      }
      case "settings-reset":
        this.resetSettings();
        break;
      case "pause-resume":
        this.resumeMatch();
        break;
      case "pause-restart":
        this.restartMatch();
        break;
      case "pause-quit":
        this.quitToMenu();
        break;
      case "result-rematch":
        this.restartMatch();
        break;
      case "result-select":
        this.callbacks.onReturnToCharacterSelect?.();
        this.emit("returntocharacterselect", undefined);
        this.showCharacterSelect();
        break;
      case "result-home":
        this.quitToMenu();
        break;
    }
  };

  private readonly handleChange = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.uiField === "player-skin") {
      const slot = this.readSlot(target.dataset.playerSlot);
      const skin = target.dataset.skin;
      if (
        target.checked &&
        slot !== undefined &&
        isFighterSkinId(this.selectedFighters[slot], skin)
      ) {
        this.callbacks.onUiSound?.("confirm");
        this.selectedSkins[slot] = skin;
        this.playerConfirmed[slot] = false;
        this.showCharacterSelect();
      }
      return;
    }
    if (!(target instanceof HTMLSelectElement)) return;

    if (target.dataset.uiField === "gamepad-assignment") {
      const slot = this.readSlot(target.dataset.playerSlot);
      if (slot !== undefined) {
        if (target.value === "keyboard") {
          this.gamepadAdapter?.useKeyboard(slot);
          this.toast(`P${slot + 1} switched to keyboard`);
        } else if (target.value.startsWith("gamepad:")) {
          const gamepadIndex = Number(target.value.slice("gamepad:".length));
          if (Number.isInteger(gamepadIndex)) {
            this.gamepadAdapter?.assign(gamepadIndex, slot);
            this.gamepadDiagnosticIndex = gamepadIndex;
            this.toast(`Controller assigned to P${slot + 1}`);
          }
        }
      }
      return;
    }

    if (target.dataset.uiField === "gamepad-diagnostic") {
      const index = Number(target.value);
      if (Number.isInteger(index)) {
        this.gamepadDiagnosticIndex = index;
        this.gamepadStructureKey = "";
        this.refreshGamepadWorkbench(true);
      }
      return;
    }

    if (target.dataset.uiField === "player-skin-select") {
      const slot = this.readSlot(target.dataset.playerSlot);
      const skin = target.value;
      if (
        slot !== undefined &&
        isFighterSkinId(this.selectedFighters[slot], skin)
      ) {
        this.callbacks.onUiSound?.("confirm");
        this.selectedSkins[slot] = skin;
        this.playerConfirmed[slot] = false;
        this.showCharacterSelect();
      }
      return;
    }

    if (target.dataset.uiField === "cpu-level") {
      const slot = this.readSlot(target.dataset.playerSlot);
      const level = Number(target.value);
      if (slot !== undefined && (level === 1 || level === 2 || level === 3)) {
        this.cpuLevels[slot] = level;
      }
    }

    if (target.dataset.uiField === "match-stocks") {
      const stocks = Number(target.value);
      if (STOCK_OPTIONS.some((candidate) => candidate === stocks)) {
        this.matchStocks = stocks;
        this.playerConfirmed = [false, false];
        this.showCharacterSelect();
      }
      return;
    }

    if (target.dataset.uiField === "time-limit") {
      const seconds = Number(target.value);
      if (TIME_LIMIT_OPTIONS.some((candidate) => candidate === seconds)) {
        this.timeLimitSeconds = seconds === 0 ? null : seconds;
        this.playerConfirmed = [false, false];
        this.showCharacterSelect();
      }
      return;
    }

    if (
      target.dataset.uiField === "item-frequency" &&
      (target.value === "low" || target.value === "medium" || target.value === "high")
    ) {
      this.settings.itemFrequency = target.value;
      this.publishSettings();
    }
  };

  private readonly handleInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.uiField === "player-name") {
      const slot = this.readSlot(target.dataset.playerSlot);
      if (slot !== undefined) {
        this.playerNames[slot] = target.value.trimStart().slice(0, 12) || `Player ${slot + 1}`;
        this.playerConfirmed[slot] = false;
      }
      return;
    }
    if (target.hasAttribute("data-ui-gamepad-deadzone")) {
      const value = Math.max(0.05, Math.min(0.35, Number(target.value) / 100));
      const output = this.screenRoot.querySelector<HTMLOutputElement>("[data-gamepad-deadzone-output]");
      if (output) output.value = `${Math.round(value * 100)}%`;
      this.gamepadAdapter?.setDeadzone(value);
      return;
    }
    if (!target.dataset.uiSetting) return;
    const key = target.dataset.uiSetting;
    if (key !== "musicVolume" && key !== "effectsVolume" && key !== "shake" && key !== "flashes") return;
    const value = Number(target.value) / 100;
    this.settings[key] = value;
    const output = this.screenRoot.querySelector<HTMLOutputElement>(`[data-setting-output="${key}"]`);
    if (output) output.value = `${Math.round(value * 100)}%`;
    this.publishSettings();
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    this.root.dataset.inputMode = "keyboard";
    this.keyboardFocusSound = true;

    if (
      (this.currentScreen === "boot" || this.currentScreen === "title") &&
      (event.code === "Enter" || event.code === "Space")
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (this.currentScreen === "boot") {
        if (this.bootStarted) this.showTitle();
        else this.startBootSequence();
      } else this.showHome();
      return;
    }

    if (this.reconnectOverlay) {
      if (event.code === "Tab") this.trapFocus(event, this.reconnectOverlay);
      event.stopPropagation();
      return;
    }

    if (this.pendingBinding) {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        this.pendingBinding = undefined;
        this.showControls(this.controlsReturn);
        this.toast("Change canceled");
      } else if (!event.repeat) {
        this.keyboardLayoutLabels.set(event.code, event.key);
        this.setBinding(this.pendingBinding.slot, this.pendingBinding.action, event.code);
      }
      return;
    }

    if (
      this.currentScreen === "controls" &&
      this.controlsTab === "gamepad" &&
      this.gamepadSnapshot.capture &&
      event.code === "Escape"
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.gamepadAdapter?.cancelCapture();
      this.toast("Change canceled");
      return;
    }

    if (this.pauseOverlay) {
      if (event.code === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.resumeMatch();
        return;
      }
      if (event.code === "Tab") this.trapFocus(event, this.pauseOverlay);
      return;
    }

    if (event.code === "Escape" && this.currentScreen !== "home" && this.currentScreen !== "gameplay") {
      event.preventDefault();
      event.stopPropagation();
      this.navigateBack();
      return;
    }

    if (
      this.currentScreen === "home" &&
      (event.code === "ArrowUp" || event.code === "ArrowDown")
    ) {
      const buttons = Array.from(
        this.screenRoot.querySelectorAll<HTMLButtonElement>(".cc-main-menu button"),
      );
      const currentIndex = buttons.findIndex((button) => button === document.activeElement);
      if (buttons.length === 0) return;
      event.preventDefault();
      const direction = event.code === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? (direction > 0 ? 0 : buttons.length - 1)
        : (currentIndex + direction + buttons.length) % buttons.length;
      buttons[nextIndex]?.focus();
      return;
    }

    if (this.currentScreen === "character-select") {
      if (event.code === "Digit1" || event.code === "Digit2") {
        event.preventDefault();
        event.stopPropagation();
        this.activePlayer = event.code === "Digit1" ? 0 : 1;
        this.showCharacterSelect();
        return;
      }

      const rosterDirection = ROSTER_ARROW_DIRECTIONS[event.code];
      if (
        rosterDirection &&
        document.activeElement instanceof HTMLButtonElement &&
        document.activeElement.matches(".cc-roster-grid .cc-fighter-card")
      ) {
        const grid = document.activeElement.closest<HTMLElement>(".cc-roster-grid");
        const cards = Array.from(
          this.screenRoot.querySelectorAll<HTMLButtonElement>(
            ".cc-roster-grid .cc-fighter-card",
          ),
        );
        const currentIndex = cards.indexOf(document.activeElement);
        if (currentIndex >= 0) {
          event.preventDefault();
          event.stopPropagation();
          const target = cards[rosterTargetIndex(
            currentIndex,
            cards.length,
            grid ? rosterColumns(grid) : DEFAULT_ROSTER_COLUMNS,
            rosterDirection,
          )];
          target?.focus({ preventScroll: true });
          target?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
    }

    if (
      this.currentScreen === "stage-select" &&
      (event.code === "ArrowLeft" || event.code === "ArrowRight")
    ) {
      const cards = Array.from(
        this.screenRoot.querySelectorAll<HTMLButtonElement>(".cc-stage-select-card"),
      );
      const currentIndex = cards.findIndex((card) => card === document.activeElement);
      if (cards.length > 0 && currentIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.code === "ArrowRight" ? 1 : -1;
        cards[(currentIndex + direction + cards.length) % cards.length]?.click();
      }
    }
  };

  private readonly handlePointerDown = (): void => {
    this.root.dataset.inputMode = "pointer";
    // A pointer press focuses the clicked control before its click handler
    // plays the confirmation cue. Do not also play a focus-navigation cue.
    this.keyboardFocusSound = false;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.currentScreen !== "home" || event.pointerType === "touch") return;
    const active = document.activeElement;
    if (!(active instanceof HTMLButtonElement) || !active.matches("button.cc-home-tile")) return;
    // Enter/Space gives the first tile keyboard focus for accessibility. As
    // soon as a mouse takes over, release that focus so hover is the only
    // visible selection and moving away restores the neutral menu state.
    this.root.dataset.inputMode = "pointer";
    this.keyboardFocusSound = false;
    active.blur();
  };

  private readonly handlePointerOver = (event: PointerEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("button.cc-home-tile[data-ui-action]")
      : null;
    if (!target) return;
    const previous = event.relatedTarget;
    if (previous instanceof Node && target.contains(previous)) return;
    this.callbacks.onUiSound?.("focus");
  };

  private readonly handleFocusIn = (event: FocusEvent): void => {
    if (
      this.keyboardFocusSound &&
      this.root.dataset.inputMode !== "gamepad" &&
      !this.suppressFocusSound &&
      (event.target instanceof HTMLButtonElement ||
        event.target instanceof HTMLSelectElement)
    ) {
      this.callbacks.onUiSound?.("focus");
    }
  };

  private trapFocus(event: KeyboardEvent, container: HTMLElement): void {
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        "button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private readSlot(value: string | undefined): PlayerSlot | undefined {
    if (value === "0") return 0;
    if (value === "1") return 1;
    return undefined;
  }
}
