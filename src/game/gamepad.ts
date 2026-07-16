import type { ActionName, InputFrame, PlayerSlot } from "./contracts";
import { ACTION_NAMES, createEmptyInputFrame } from "./input";
import type {
  GamepadBindingValue,
  GamepadFamily,
  GamepadUiAdapter,
  GamepadUiBindings,
  GamepadUiDevice,
  GamepadUiListener,
  GamepadUiSnapshot,
} from "../ui/gamepadUi";
import type { MenuGamepadSnapshot } from "../ui/gamepadNavigation";
import { createPersistentBrowserStorage } from "./persistentStorage";

export const GAMEPAD_STORAGE_KEY = "super-bash-folds.gamepads.v1";
export const DEFAULT_GAMEPAD_DEADZONE = 0.18;

const BUTTON_PRESS_THRESHOLD = 0.5;
const DIRECTION_PRESS_THRESHOLD = 0.52;
const DIRECTION_RELEASE_THRESHOLD = 0.36;
const SMASH_PRESS_THRESHOLD = 0.72;
const SMASH_RELEASE_THRESHOLD = 0.42;
const KEYBOARD_SOURCE_SENTINEL = "__keyboard__";

export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface GamepadLike {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonLike[];
  readonly timestamp?: number;
}

export interface GamepadNavigatorLike {
  getGamepads(): ArrayLike<GamepadLike | null>;
}

export interface GamepadStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GamepadManagerOptions {
  navigator?: GamepadNavigatorLike;
  eventTarget?: EventTarget;
  storage?: GamepadStorageLike | null;
  deadzone?: number;
  autoAttach?: boolean;
}

export interface GamepadConnectionEvent {
  readonly type: "connected" | "disconnected" | "assigned" | "capture";
  readonly device: GamepadUiDevice;
  readonly previousPlayer: PlayerSlot | null;
  readonly player: PlayerSlot | null;
  readonly message: string;
}

export type GamepadEventListener = (event: GamepadConnectionEvent) => void;

type MutableActionState = {
  held: Set<ActionName>;
  pressed: Set<ActionName>;
  released: Set<ActionName>;
  direction: { x: number; y: number };
  analog: boolean;
};

type PlayerSource =
  | { type: "keyboard" }
  | { type: "gamepad"; index: number; id: string };

type ButtonOverrides = Partial<Record<ActionName, number[]>>;

interface PersistedGamepads {
  version: 2;
  deadzone: number;
  sources: readonly [string | null, string | null];
  bindings: Record<string, ButtonOverrides>;
}

interface DeviceRecord {
  index: number;
  id: string;
  name: string;
  family: GamepadFamily;
  mapping: string;
  connected: boolean;
  buttons: GamepadButtonLike[];
  axesRaw: number[];
  axes: number[];
}

interface CaptureState {
  player: PlayerSlot;
  action: ActionName;
  armed: boolean;
}

const emptyActionState = (): MutableActionState => ({
  held: new Set<ActionName>(),
  pressed: new Set<ActionName>(),
  released: new Set<ActionName>(),
  direction: { x: 0, y: 0 },
  analog: false,
});

const cloneFrame = (state: MutableActionState, consume: boolean): InputFrame => {
  const frame: InputFrame = {
    held: new Set(state.held),
    pressed: new Set(state.pressed),
    released: new Set(state.released),
    direction: { ...state.direction },
    analog: state.analog,
  };
  if (consume) {
    state.pressed.clear();
    state.released.clear();
  }
  return frame;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isActionName = (value: string): value is ActionName =>
  (ACTION_NAMES as readonly string[]).includes(value);

export function detectGamepadFamily(id: string): GamepadFamily {
  if (/nintendo|switch|joy-?con|pro controller/i.test(id)) return "nintendo";
  if (/xbox|xinput|microsoft/i.test(id)) return "xbox";
  if (/playstation|dualshock|dualsense|sony/i.test(id)) return "playstation";
  return "generic";
}

export function friendlyGamepadName(id: string, index = 0): string {
  const cleaned = id
    .replace(/\(standard gamepad\)/gi, "")
    .replace(/vendor:\s*[0-9a-f]+/gi, "")
    .replace(/product:\s*[0-9a-f]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "")
    .trim();
  return cleaned || `Controller ${index + 1}`;
}

/** Radial deadzone with rescaling preserves full stick range after the cutoff. */
export function applyRadialDeadzone(
  x: number,
  y: number,
  deadzone = DEFAULT_GAMEPAD_DEADZONE,
): { x: number; y: number } {
  const safeX = clamp(x, -1, 1);
  const safeY = clamp(y, -1, 1);
  const magnitude = Math.min(1, Math.hypot(safeX, safeY));
  const zone = clamp(deadzone, 0.05, 0.5);
  if (magnitude <= zone || magnitude === 0) return { x: 0, y: 0 };
  const scaled = (magnitude - zone) / (1 - zone);
  return {
    x: (safeX / magnitude) * scaled,
    y: (safeY / magnitude) * scaled,
  };
}

function pressed(button: GamepadButtonLike | undefined): boolean {
  return Boolean(button?.pressed || (button?.value ?? 0) >= BUTTON_PRESS_THRESHOLD);
}

function defaultButtons(family: GamepadFamily): Record<ActionName, readonly number[]> {
  const nintendo = family === "nintendo";
  return {
    left: [],
    right: [],
    up: [],
    down: [],
    jump: [2, 3],
    attack: [nintendo ? 1 : 0],
    special: [nintendo ? 0 : 1],
    shield: [6, 7],
    grab: [4, 5],
    pause: [9],
  };
}

function buttonNames(family: GamepadFamily): readonly string[] {
  switch (family) {
    case "nintendo":
      return ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+"];
    case "playstation":
      return ["Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Create", "Options"];
    case "xbox":
      return ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu"];
    default:
      return ["A", "B", "X", "Y", "L", "R", "ZL", "ZR", "Select", "Menu"];
  }
}

function defaultBindingLabel(action: ActionName, family: GamepadFamily): GamepadBindingValue {
  const axis: Partial<Record<ActionName, string>> = {
    left: "Left stick ←",
    right: "Left stick →",
    up: "Left stick ↑",
    down: "Left stick ↓",
  };
  if (axis[action]) return axis[action]!;
  const buttons = defaultButtons(family)[action];
  const labels = buttonNames(family);
  return buttons.map((index) => labels[index] ?? `Button ${index}`).join(" / ");
}

function browserNavigator(): GamepadNavigatorLike | undefined {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return undefined;
  return navigator as unknown as GamepadNavigatorLike;
}

function browserEventTarget(): EventTarget | undefined {
  return typeof window === "undefined" ? undefined : window;
}

function browserStorage(): GamepadStorageLike | null {
  return createPersistentBrowserStorage();
}

function sanitizePersisted(value: unknown): PersistedGamepads {
  const fallback: PersistedGamepads = {
    version: 2,
    deadzone: DEFAULT_GAMEPAD_DEADZONE,
    sources: [null, null],
    bindings: {},
  };
  if (!isRecord(value)) return fallback;
  const sourcesRaw = Array.isArray(value.sources) ? value.sources : [];
  const sources: [string | null, string | null] = [
    typeof sourcesRaw[0] === "string" && sourcesRaw[0].length <= 256 ? sourcesRaw[0] : null,
    typeof sourcesRaw[1] === "string" && sourcesRaw[1].length <= 256 ? sourcesRaw[1] : null,
  ];
  const bindings: Record<string, ButtonOverrides> = {};
  if (isRecord(value.bindings)) {
    for (const [key, candidate] of Object.entries(value.bindings)) {
      if (key.length > 520 || !isRecord(candidate)) continue;
      const safe: ButtonOverrides = {};
      for (const [action, rawButtons] of Object.entries(candidate)) {
        if (!isActionName(action)) continue;
        const candidates = Array.isArray(rawButtons) ? rawButtons : [rawButtons];
        const buttons = [...new Set(candidates
          .filter((button) =>
            Number.isInteger(button) && Number(button) >= 0 && Number(button) <= 31,
          )
          .map(Number))];
        if (buttons.length > 0) safe[action] = buttons;
      }
      bindings[key] = safe;
    }
  }
  const deadzone = typeof value.deadzone === "number" && Number.isFinite(value.deadzone)
    ? clamp(value.deadzone, 0.05, 0.5)
    : DEFAULT_GAMEPAD_DEADZONE;
  return {
    version: 2,
    deadzone,
    sources,
    bindings,
  };
}

function loadPersisted(storage: GamepadStorageLike | null): PersistedGamepads {
  if (!storage) return sanitizePersisted(undefined);
  try {
    const serialized = storage.getItem(GAMEPAD_STORAGE_KEY);
    return serialized ? sanitizePersisted(JSON.parse(serialized) as unknown) : sanitizePersisted(undefined);
  } catch {
    return sanitizePersisted(undefined);
  }
}

function sourceClone(source: PlayerSource): PlayerSource {
  return source.type === "keyboard" ? { type: "keyboard" } : { ...source };
}

export function mergeInputFrames(first: InputFrame, second: InputFrame): InputFrame {
  const union = (a: Set<ActionName>, b: Set<ActionName>): Set<ActionName> => new Set([...a, ...b]);
  const digitalHorizontal = Math.abs(first.direction.x) > 0;
  return {
    held: union(first.held, second.held),
    pressed: union(first.pressed, second.pressed),
    released: union(first.released, second.released),
    direction: {
      // Digital keyboard axes win over a simultaneous drifting or opposing
      // stick, so a keyboard direction remains an unconditional run.
      x: first.direction.x !== 0
        ? clamp(first.direction.x, -1, 1)
        : clamp(second.direction.x, -1, 1),
      y: first.direction.y !== 0
        ? clamp(first.direction.y, -1, 1)
        : clamp(second.direction.y, -1, 1),
    },
    analog: digitalHorizontal ? false : Boolean(first.analog || second.analog),
  };
}

export class GamepadManager implements GamepadUiAdapter {
  private readonly navigator: GamepadNavigatorLike | undefined;
  private readonly eventTarget: EventTarget | undefined;
  private readonly storage: GamepadStorageLike | null;
  private readonly devices = new Map<number, DeviceRecord>();
  private readonly listeners = new Set<GamepadUiListener>();
  private readonly eventListeners = new Set<GamepadEventListener>();
  private readonly states: [MutableActionState, MutableActionState] = [
    emptyActionState(),
    emptyActionState(),
  ];
  private readonly smashActive: [boolean, boolean] = [false, false];
  private readonly overrides: Record<string, ButtonOverrides>;
  private readonly preferredIds: [string | null, string | null];
  private readonly keyboardLocked: [boolean, boolean];
  private sources: [PlayerSource, PlayerSource];
  private deadzone: number;
  private capture: CaptureState | null = null;
  private attached = false;
  private destroyed = false;
  private lastSnapshotSignature = "";

  private readonly connectedListener: EventListener = (event) => {
    const gamepad = (event as Event & { gamepad?: GamepadLike }).gamepad;
    if (!gamepad) return;
    this.upsertDevice(gamepad, true);
    this.restorePreferredAssignments();
    this.assignUnclaimedDevices();
    this.emitSnapshot(true);
  };

  private readonly disconnectedListener: EventListener = (event) => {
    const gamepad = (event as Event & { gamepad?: GamepadLike }).gamepad;
    if (!gamepad) return;
    const existing = this.devices.get(gamepad.index);
    const previousPlayer = this.playerForIndex(gamepad.index);
    if (existing) existing.connected = false;
    else {
      this.upsertDevice(gamepad, false);
      this.devices.get(gamepad.index)!.connected = false;
    }
    this.clearSlot(previousPlayer);
    const device = this.deviceSnapshot(this.devices.get(gamepad.index)!);
    this.emitEvent({
      type: "disconnected",
      device,
      previousPlayer,
      player: previousPlayer,
      message: previousPlayer === null
        ? "Controller disconnected"
        : `Controller P${previousPlayer + 1} disconnected`,
    });
    this.emitSnapshot(true);
  };

  constructor(options: GamepadManagerOptions = {}) {
    this.navigator = options.navigator ?? browserNavigator();
    this.eventTarget = options.eventTarget ?? browserEventTarget();
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    const persisted = loadPersisted(this.storage);
    this.deadzone = options.deadzone === undefined
      ? persisted.deadzone
      : clamp(options.deadzone, 0.05, 0.5);
    this.keyboardLocked = [
      persisted.sources[0] === KEYBOARD_SOURCE_SENTINEL,
      persisted.sources[1] === KEYBOARD_SOURCE_SENTINEL,
    ];
    this.preferredIds = [
      this.keyboardLocked[0] ? null : persisted.sources[0],
      this.keyboardLocked[1] ? null : persisted.sources[1],
    ];
    this.overrides = persisted.bindings;
    this.sources = [{ type: "keyboard" }, { type: "keyboard" }];
    if (options.autoAttach !== false) this.attach();
    else this.poll();
  }

  attach(): this {
    if (this.attached || this.destroyed) return this;
    this.eventTarget?.addEventListener("gamepadconnected", this.connectedListener);
    this.eventTarget?.addEventListener("gamepaddisconnected", this.disconnectedListener);
    this.attached = true;
    this.poll();
    return this;
  }

  detach(): this {
    if (!this.attached) return this;
    this.eventTarget?.removeEventListener("gamepadconnected", this.connectedListener);
    this.eventTarget?.removeEventListener("gamepaddisconnected", this.disconnectedListener);
    this.attached = false;
    return this;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detach();
    this.listeners.clear();
    this.eventListeners.clear();
    this.clear();
  }

  poll(): void {
    if (this.destroyed) return;
    const visible = this.readVisibleGamepads();
    const visibleIndices = new Set<number>();
    for (const gamepad of visible) {
      visibleIndices.add(gamepad.index);
      this.upsertDevice(gamepad, gamepad.connected !== false);
    }
    for (const record of this.devices.values()) {
      if (record.connected && !visibleIndices.has(record.index)) {
        // Events are authoritative, but polling also catches browsers that
        // silently drop an index after sleep or Bluetooth loss.
        const previousPlayer = this.playerForIndex(record.index);
        record.connected = false;
        this.clearSlot(previousPlayer);
        this.emitEvent({
          type: "disconnected",
          device: this.deviceSnapshot(record),
          previousPlayer,
          player: previousPlayer,
          message: previousPlayer === null
            ? "Controller disconnected"
            : `Controller P${previousPlayer + 1} disconnected`,
        });
      }
    }

    this.restorePreferredAssignments();
    this.assignUnclaimedDevices();
    this.processCapture();
    for (const slot of [0, 1] as const) this.updatePlayerState(slot);
    this.emitSnapshot();
  }

  getSnapshot(): GamepadUiSnapshot {
    const devices = [...this.devices.values()]
      .sort((a, b) => a.index - b.index)
      .map((device) => this.deviceSnapshot(device));
    return {
      devices,
      sources: [sourceClone(this.sources[0]), sourceClone(this.sources[1])],
      bindings: [this.uiBindings(0), this.uiBindings(1)],
      deadzone: this.deadzone,
      activationRequired: !devices.some((device) => device.connected),
      capture: this.capture ? { player: this.capture.player, action: this.capture.action } : null,
    };
  }

  subscribe(listener: GamepadUiListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeEvents(listener: GamepadEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  assign(gamepadIndex: number, player: PlayerSlot): void {
    const record = this.devices.get(gamepadIndex);
    if (!record?.connected) return;
    const oldPlayer = this.playerForIndex(gamepadIndex);
    if (oldPlayer !== null && oldPlayer !== player) {
      this.sources[oldPlayer] = { type: "keyboard" };
      this.preferredIds[oldPlayer] = null;
      this.keyboardLocked[oldPlayer] = true;
      this.clearSlot(oldPlayer);
    }
    const displaced = this.sources[player];
    if (displaced.type === "gamepad" && displaced.index !== gamepadIndex) {
      this.clearSlot(player);
    }
    this.sources[player] = { type: "gamepad", index: gamepadIndex, id: record.id };
    this.preferredIds[player] = record.id;
    this.keyboardLocked[player] = false;
    this.persist();
    const device = this.deviceSnapshot(record);
    this.emitEvent({
      type: "assigned",
      device,
      previousPlayer: oldPlayer,
      player,
      message: `${record.name} assigned to P${player + 1}`,
    });
    this.emitSnapshot(true);
  }

  useKeyboard(player: PlayerSlot): void {
    this.sources[player] = { type: "keyboard" };
    this.preferredIds[player] = null;
    this.keyboardLocked[player] = true;
    this.clearSlot(player);
    this.persist();
    this.emitSnapshot(true);
  }

  swapAssignments(): void {
    this.sources = [this.sources[1], this.sources[0]];
    const firstId = this.preferredIds[0];
    this.preferredIds[0] = this.preferredIds[1];
    this.preferredIds[1] = firstId;
    const firstLock = this.keyboardLocked[0];
    this.keyboardLocked[0] = this.keyboardLocked[1];
    this.keyboardLocked[1] = firstLock;
    this.clearSlot(0);
    this.clearSlot(1);
    this.persist();
    this.emitSnapshot(true);
  }

  startCapture(player: PlayerSlot, action: ActionName): void {
    const device = this.deviceForPlayer(player);
    if (!device?.connected) return;
    this.capture = { player, action, armed: device.buttons.every((button) => !pressed(button)) };
    this.emitSnapshot(true);
  }

  cancelCapture(): void {
    if (!this.capture) return;
    this.capture = null;
    this.emitSnapshot(true);
  }

  resetBindings(player: PlayerSlot): void {
    const source = this.sources[player];
    const id = source.type === "gamepad" ? source.id : this.preferredIds[player];
    if (id) delete this.overrides[this.bindingKey(player, id)];
    this.capture = null;
    this.persist();
    this.emitSnapshot(true);
  }

  setDeadzone(value: number): void {
    const next = clamp(value, 0.05, 0.5);
    if (Math.abs(next - this.deadzone) < 0.0001) return;
    this.deadzone = next;
    this.persist();
    this.emitSnapshot(true);
  }

  peekFrame(player: PlayerSlot): InputFrame {
    return cloneFrame(this.states[player], false);
  }

  consumeFrame(player: PlayerSlot): InputFrame {
    return cloneFrame(this.states[player], true);
  }

  consumeFrames(): [InputFrame, InputFrame] {
    return [this.consumeFrame(0), this.consumeFrame(1)];
  }

  consumePausePress(): boolean {
    const result = this.states[0].pressed.has("pause") || this.states[1].pressed.has("pause");
    this.states[0].pressed.delete("pause");
    this.states[1].pressed.delete("pause");
    return result;
  }

  menuSnapshots(): MenuGamepadSnapshot[] {
    return [...this.devices.values()]
      .filter((device) => device.connected)
      .map((device) => {
        const face = device.family === "nintendo"
          ? { confirm: 1, back: 0 }
          : { confirm: 0, back: 1 };
        const captureOwnsDevice = this.capture?.player === this.playerForIndex(device.index);
        return {
          key: `${device.index}:${device.id}`,
          connected: true,
          x: device.axes[0] ?? 0,
          y: device.axes[1] ?? 0,
          dpadUp: pressed(device.buttons[12]),
          dpadDown: pressed(device.buttons[13]),
          dpadLeft: pressed(device.buttons[14]),
          dpadRight: pressed(device.buttons[15]),
          confirm: !captureOwnsDevice && pressed(device.buttons[face.confirm]),
          back: !captureOwnsDevice && pressed(device.buttons[face.back]),
          pause: !captureOwnsDevice && pressed(device.buttons[9]),
        };
      });
  }

  /** Clear queued edges while preserving physical held state. */
  clear(): void {
    for (const state of this.states) {
      state.pressed.clear();
      state.released.clear();
    }
  }

  private readVisibleGamepads(): GamepadLike[] {
    if (!this.navigator) return [];
    try {
      return Array.from(this.navigator.getGamepads()).filter(
        (candidate): candidate is GamepadLike => candidate != null,
      );
    } catch {
      return [];
    }
  }

  private upsertDevice(gamepad: GamepadLike, emitConnected: boolean): void {
    const existing = this.devices.get(gamepad.index);
    const wasConnected = existing?.connected ?? false;
    const left = applyRadialDeadzone(gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0, this.deadzone);
    const right = applyRadialDeadzone(gamepad.axes[2] ?? 0, gamepad.axes[3] ?? 0, this.deadzone);
    const record: DeviceRecord = existing ?? {
      index: gamepad.index,
      id: gamepad.id,
      name: friendlyGamepadName(gamepad.id, gamepad.index),
      family: detectGamepadFamily(gamepad.id),
      mapping: gamepad.mapping,
      connected: gamepad.connected,
      buttons: [],
      axesRaw: [],
      axes: [],
    };
    record.id = gamepad.id;
    record.name = friendlyGamepadName(gamepad.id, gamepad.index);
    record.family = detectGamepadFamily(gamepad.id);
    record.mapping = gamepad.mapping;
    record.connected = gamepad.connected !== false;
    record.buttons = Array.from(gamepad.buttons, (button) => ({
      pressed: Boolean(button.pressed),
      value: clamp(button.value, 0, 1),
    }));
    record.axesRaw = Array.from(gamepad.axes, (axis) => clamp(axis, -1, 1));
    record.axes = [left.x, left.y, right.x, right.y];
    this.devices.set(record.index, record);

    if (!wasConnected && record.connected && emitConnected) {
      const player = this.playerForIndex(record.index);
      this.emitEvent({
        type: "connected",
        device: this.deviceSnapshot(record),
        previousPlayer: null,
        player,
        message: player === null ? "Controller connected" : `Controller P${player + 1} connected`,
      });
    }
  }

  private restorePreferredAssignments(): void {
    for (const slot of [0, 1] as const) {
      const source = this.sources[slot];
      if (source.type === "gamepad" && this.devices.get(source.index)?.connected) continue;
      if (this.keyboardLocked[slot]) continue;
      const preferredId = source.type === "gamepad" ? source.id : this.preferredIds[slot];
      if (!preferredId) continue;
      const candidate = [...this.devices.values()].find(
        (device) => device.connected && device.id === preferredId && this.playerForIndex(device.index) === null,
      );
      if (candidate) {
        this.sources[slot] = { type: "gamepad", index: candidate.index, id: candidate.id };
        this.preferredIds[slot] = candidate.id;
        this.keyboardLocked[slot] = false;
      }
    }
  }

  private assignUnclaimedDevices(): void {
    for (const device of [...this.devices.values()].sort((a, b) => a.index - b.index)) {
      if (!device.connected || this.playerForIndex(device.index) !== null) continue;
      const slot = ([0, 1] as const).find(
        (candidate) => this.sources[candidate].type === "keyboard" && !this.keyboardLocked[candidate],
      );
      if (slot === undefined) break;
      this.sources[slot] = { type: "gamepad", index: device.index, id: device.id };
      this.preferredIds[slot] = device.id;
      this.keyboardLocked[slot] = false;
      this.persist();
      this.emitEvent({
        type: "assigned",
        device: this.deviceSnapshot(device),
        previousPlayer: null,
        player: slot,
        message: `${device.name} assigned to P${slot + 1}`,
      });
    }
  }

  private processCapture(): void {
    if (!this.capture) return;
    const device = this.deviceForPlayer(this.capture.player);
    if (!device?.connected) {
      this.capture = null;
      return;
    }
    const pressedIndices = device.buttons
      .map((button, index) => pressed(button) ? index : -1)
      .filter((index) => index >= 0);
    if (!this.capture.armed) {
      if (pressedIndices.length === 0) this.capture.armed = true;
      return;
    }
    const button = pressedIndices[0];
    if (button === undefined || button === 16) return; // Never bind Home/PS/Xbox.
    const { player, action } = this.capture;
    const source = this.sources[player];
    if (source.type !== "gamepad") return;
    const key = this.bindingKey(player, source.id);
    const overrides = { ...(this.overrides[key] ?? {}) };
    const currentButtons = [...this.effectiveButtons(player, action, device)];
    let nextButtons = [...new Set([...currentButtons, button])];
    let collisionResolved = false;
    for (const candidate of ACTION_NAMES) {
      if (candidate === action) continue;
      const candidateButtons = [...this.effectiveButtons(player, candidate, device)];
      if (!candidateButtons.includes(button)) continue;
      collisionResolved = true;
      if (candidateButtons.length > 1) {
        overrides[candidate] = candidateButtons.filter((candidateButton) => candidateButton !== button);
        continue;
      }
      const replacement = currentButtons.find((candidateButton) => candidateButton !== button);
      if (replacement !== undefined) {
        overrides[candidate] = [replacement];
        nextButtons = nextButtons.filter((candidateButton) => candidateButton !== replacement);
      }
    }
    overrides[action] = nextButtons;
    this.overrides[key] = overrides;
    this.capture = null;
    this.persist();
    this.emitEvent({
      type: "capture",
      device: this.deviceSnapshot(device),
      previousPlayer: player,
      player,
      message: collisionResolved ? "Button added and conflict resolved" : "Button added",
    });
  }

  private updatePlayerState(slot: PlayerSlot): void {
    const state = this.states[slot];
    const device = this.deviceForPlayer(slot);
    if (!device?.connected || this.capture?.player === slot) {
      this.replaceHeld(state, new Set<ActionName>());
      state.direction = { x: 0, y: 0 };
      state.analog = false;
      this.smashActive[slot] = false;
      return;
    }
    const next = new Set<ActionName>();
    let direction = { x: device.axes[0] ?? 0, y: -(device.axes[1] ?? 0) };
    const axisHeld = (action: ActionName, value: number): boolean => {
      const threshold = state.held.has(action) ? DIRECTION_RELEASE_THRESHOLD : DIRECTION_PRESS_THRESHOLD;
      return value >= threshold;
    };
    if (axisHeld("left", -direction.x)) next.add("left");
    if (axisHeld("right", direction.x)) next.add("right");
    if (axisHeld("up", direction.y)) next.add("up");
    if (axisHeld("down", -direction.y)) next.add("down");

    for (const action of ACTION_NAMES) {
      if (this.effectiveButtons(slot, action, device).some((index) => pressed(device.buttons[index]))) {
        next.add(action);
      }
    }

    const digitalX = Number(next.has("right")) - Number(next.has("left"));
    const digitalY = Number(next.has("up")) - Number(next.has("down"));
    if (digitalX !== 0 && Math.abs(direction.x) < DIRECTION_PRESS_THRESHOLD) direction.x = digitalX;
    if (digitalY !== 0 && Math.abs(direction.y) < DIRECTION_PRESS_THRESHOLD) direction.y = digitalY;

    const right = { x: device.axes[2] ?? 0, y: -(device.axes[3] ?? 0) };
    const rightMagnitude = Math.hypot(right.x, right.y);
    const smashThreshold = this.smashActive[slot] ? SMASH_RELEASE_THRESHOLD : SMASH_PRESS_THRESHOLD;
    if (rightMagnitude >= smashThreshold) {
      this.smashActive[slot] = true;
      direction = right;
      next.add("attack");
      const horizontal = Math.abs(right.x) >= Math.abs(right.y);
      next.add(horizontal ? (right.x < 0 ? "left" : "right") : (right.y < 0 ? "down" : "up"));
    } else this.smashActive[slot] = false;

    // D-pad taunts through the engine's existing shield + grab gesture.
    if ([12, 13, 14, 15].some((index) => pressed(device.buttons[index]))) {
      next.add("shield");
      next.add("grab");
    }

    this.replaceHeld(state, next);
    state.direction = {
      x: clamp(direction.x, -1, 1),
      y: clamp(direction.y, -1, 1),
    };
    state.analog = true;
  }

  private replaceHeld(state: MutableActionState, next: Set<ActionName>): void {
    for (const action of next) {
      if (!state.held.has(action)) state.pressed.add(action);
      state.released.delete(action);
    }
    for (const action of state.held) {
      if (!next.has(action)) {
        state.released.add(action);
        state.pressed.delete(action);
      }
    }
    state.held = next;
  }

  private effectiveButtons(
    slot: PlayerSlot,
    action: ActionName,
    device: DeviceRecord,
  ): readonly number[] {
    const override = this.overrides[this.bindingKey(slot, device.id)]?.[action];
    return override === undefined ? defaultButtons(device.family)[action] : override;
  }

  private uiBindings(slot: PlayerSlot): GamepadUiBindings {
    const source = this.sources[slot];
    const id = source.type === "gamepad" ? source.id : this.preferredIds[slot];
    const device = source.type === "gamepad" ? this.devices.get(source.index) : undefined;
    const family = device?.family ?? (id ? detectGamepadFamily(id) : "generic");
    const overrides = id ? this.overrides[this.bindingKey(slot, id)] ?? {} : {};
    const result: GamepadUiBindings = {};
    for (const action of ACTION_NAMES) {
      result[action] = overrides[action] ?? defaultBindingLabel(action, family);
    }
    return result;
  }

  private deviceForPlayer(slot: PlayerSlot): DeviceRecord | undefined {
    const source = this.sources[slot];
    return source.type === "gamepad" ? this.devices.get(source.index) : undefined;
  }

  private playerForIndex(index: number): PlayerSlot | null {
    if (this.sources[0].type === "gamepad" && this.sources[0].index === index) return 0;
    if (this.sources[1].type === "gamepad" && this.sources[1].index === index) return 1;
    return null;
  }

  private clearSlot(slot: PlayerSlot | null): void {
    if (slot === null) return;
    const state = this.states[slot];
    for (const action of state.held) state.released.add(action);
    state.held.clear();
    state.pressed.clear();
    state.direction = { x: 0, y: 0 };
    state.analog = false;
    this.smashActive[slot] = false;
  }

  private deviceSnapshot(device: DeviceRecord): GamepadUiDevice {
    return {
      index: device.index,
      id: device.id,
      name: device.name,
      family: device.family,
      mapping: device.mapping,
      connected: device.connected,
      assignedPlayer: this.playerForIndex(device.index),
      buttons: device.buttons.map((button, index) => ({ index, ...button })),
      axesRaw: [...device.axesRaw],
      axes: [...device.axes],
    };
  }

  private bindingKey(slot: PlayerSlot, id: string): string {
    return `${slot}:${id}`;
  }

  private persist(): void {
    const payload: PersistedGamepads = {
      version: 2,
      deadzone: this.deadzone,
      sources: [
        this.keyboardLocked[0] ? KEYBOARD_SOURCE_SENTINEL : this.preferredIds[0],
        this.keyboardLocked[1] ? KEYBOARD_SOURCE_SENTINEL : this.preferredIds[1],
      ],
      bindings: this.overrides,
    };
    try {
      this.storage?.setItem(GAMEPAD_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage failure must never disable local input.
    }
  }

  private emitEvent(event: GamepadConnectionEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  private emitSnapshot(force = false): void {
    const snapshot = this.getSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === this.lastSnapshotSignature) return;
    this.lastSnapshotSignature = signature;
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function createGamepadManager(options?: GamepadManagerOptions): GamepadManager {
  return new GamepadManager(options);
}

export function emptyGamepadFrames(): [InputFrame, InputFrame] {
  return [createEmptyInputFrame(), createEmptyInputFrame()];
}
