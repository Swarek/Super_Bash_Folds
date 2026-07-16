import type { ActionName, PlayerSlot } from "../game/contracts";

/**
 * Narrow UI-facing contract for the native Gamepad implementation.
 *
 * The UI deliberately does not read `navigator.getGamepads()` itself. Discovery,
 * assignment, edge detection, persistence and per-frame polling stay owned by
 * `game/gamepad.ts`; this port only exposes immutable snapshots and commands.
 */
export type GamepadFamily = "nintendo" | "xbox" | "playstation" | "generic";

export interface GamepadButtonDiagnostic {
  index: number;
  pressed: boolean;
  value: number;
}

export interface GamepadUiDevice {
  index: number;
  id: string;
  /** Friendly name when the core can strip vendor/product noise. */
  name?: string;
  family?: GamepadFamily;
  mapping?: string;
  connected: boolean;
  assignedPlayer: PlayerSlot | null;
  buttons: readonly GamepadButtonDiagnostic[];
  /** Browser values before deadzone processing. */
  axesRaw: readonly number[];
  /** Normalized values after deadzone processing. */
  axes: readonly number[];
}

export type GamepadPlayerSource =
  | { type: "keyboard" }
  | { type: "gamepad"; index: number; id: string };

export type GamepadBindingValue = number | readonly number[] | string;
export type GamepadUiBindings = Partial<Record<ActionName, GamepadBindingValue>>;

export interface GamepadCaptureState {
  player: PlayerSlot;
  action: ActionName;
}

export interface GamepadUiSnapshot {
  devices: readonly GamepadUiDevice[];
  sources: readonly [GamepadPlayerSource, GamepadPlayerSource];
  bindings: readonly [GamepadUiBindings, GamepadUiBindings];
  deadzone: number;
  /** True when WebKit has not exposed a connected pad before its first input. */
  activationRequired?: boolean;
  capture?: GamepadCaptureState | null;
}

export type GamepadUiListener = (snapshot: GamepadUiSnapshot) => void;

export interface GamepadUiAdapter {
  getSnapshot(): GamepadUiSnapshot;
  subscribe(listener: GamepadUiListener): () => void;
  assign(gamepadIndex: number, player: PlayerSlot): void;
  useKeyboard(player: PlayerSlot): void;
  swapAssignments(): void;
  startCapture(player: PlayerSlot, action: ActionName): void;
  cancelCapture(): void;
  resetBindings(player: PlayerSlot): void;
  setDeadzone(value: number): void;
}

export const EMPTY_GAMEPAD_SNAPSHOT: GamepadUiSnapshot = {
  devices: [],
  sources: [{ type: "keyboard" }, { type: "keyboard" }],
  bindings: [{}, {}],
  deadzone: 0.18,
  activationRequired: true,
  capture: null,
};

const STANDARD_BUTTON_LABELS: Record<GamepadFamily, readonly string[]> = {
  nintendo: [
    "B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "Left Stick", "Right Stick",
    "↑", "↓", "←", "→", "Home", "Capture",
  ],
  xbox: [
    "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "Left Stick", "Right Stick",
    "↑", "↓", "←", "→", "Xbox", "Share",
  ],
  playstation: [
    "Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Create", "Options",
    "L3", "R3", "↑", "↓", "←", "→", "PS", "Touchpad",
  ],
  generic: [
    "A", "B", "X", "Y", "L", "R", "ZL", "ZR", "Select", "Menu", "Left Stick", "Right Stick",
    "↑", "↓", "←", "→", "System", "Capture",
  ],
};

export function gamepadButtonLabel(
  value: GamepadBindingValue | undefined,
  family: GamepadFamily = "generic",
): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((button) => STANDARD_BUTTON_LABELS[family][button] ?? `Button ${button}`).join(" / ");
  }
  if (typeof value !== "number") return "—";
  return STANDARD_BUTTON_LABELS[family][value] ?? `Button ${value}`;
}

export function gamepadDeviceName(device: GamepadUiDevice): string {
  return device.name?.trim() || device.id.trim() || `Controller ${device.index + 1}`;
}

export function gamepadSourceLabel(
  source: GamepadPlayerSource,
  devices: readonly GamepadUiDevice[],
): string {
  if (source.type === "keyboard") return "Keyboard";
  const device = devices.find((candidate) => candidate.index === source.index);
  return device ? gamepadDeviceName(device) : "Controller disconnected";
}
