import type { GamepadFamily, GamepadUiDevice } from "./gamepadUi";

/**
 * Normalised menu state for one controller.
 *
 * The gamepad discovery layer owns polling and assignments. Keeping this small
 * shape here lets menu navigation share the same snapshots without depending
 * on combat input or starting a second requestAnimationFrame loop.
 */
export interface MenuGamepadSnapshot {
  readonly key: string;
  readonly connected?: boolean;
  readonly x: number;
  readonly y: number;
  readonly dpadLeft?: boolean;
  readonly dpadRight?: boolean;
  readonly dpadUp?: boolean;
  readonly dpadDown?: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
  readonly pause: boolean;
}

export type MenuDirection = "left" | "right" | "up" | "down";

export interface GamepadMenuNavigationOptions {
  /** Stick threshold after the discovery layer's deadzone. */
  readonly axisThreshold?: number;
  /** Lower release threshold prevents a drifting stick from flickering. */
  readonly axisReleaseThreshold?: number;
  readonly repeatDelayMs?: number;
  readonly repeatIntervalMs?: number;
  readonly eventTarget?: EventTarget;
  readonly onBack?: () => void;
  readonly onPause?: () => void;
  readonly onFocus?: (element: HTMLElement) => void;
  readonly onConfirm?: (element: HTMLElement) => void;
}

interface ButtonMemory {
  confirm: boolean;
  back: boolean;
  pause: boolean;
}

interface Point {
  x: number;
  y: number;
}

const DEFAULT_AXIS_THRESHOLD = 0.58;
const DEFAULT_AXIS_RELEASE_THRESHOLD = 0.34;
const DEFAULT_REPEAT_DELAY_MS = 330;
const DEFAULT_REPEAT_INTERVAL_MS = 105;

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const DEFAULT_BACK_ACTIONS = [
  "pause-resume",
  "controls-back",
  "stage-back",
  "back-home",
  "result-home",
] as const;

function buttonPressed(button: GamepadButton | undefined): boolean {
  return Boolean(button?.pressed || (button?.value ?? 0) >= 0.5);
}

function familyFromId(id: string): GamepadFamily {
  if (/nintendo|switch|joy-?con|pro controller/i.test(id)) return "nintendo";
  if (/playstation|dualshock|dualsense|sony|wireless controller/i.test(id)) return "playstation";
  if (/xbox|xinput|microsoft/i.test(id)) return "xbox";
  return "generic";
}

function menuFaceButtons(family: GamepadFamily): { confirm: number; back: number } {
  // Standard mapping preserves Nintendo's physical A/B labels at indices 1/0.
  return family === "nintendo"
    ? { confirm: 1, back: 0 }
    : { confirm: 0, back: 1 };
}

/** Convert a standard Web Gamepad snapshot to the menu-only shape. */
export function gamepadToMenuSnapshot(gamepad: Gamepad): MenuGamepadSnapshot {
  const face = menuFaceButtons(familyFromId(gamepad.id));
  return {
    key: `${gamepad.index}:${gamepad.id}`,
    connected: gamepad.connected,
    x: gamepad.axes[0] ?? 0,
    y: gamepad.axes[1] ?? 0,
    dpadUp: buttonPressed(gamepad.buttons[12]),
    dpadDown: buttonPressed(gamepad.buttons[13]),
    dpadLeft: buttonPressed(gamepad.buttons[14]),
    dpadRight: buttonPressed(gamepad.buttons[15]),
    // Standard mapping: primary face button, secondary face button and Start.
    confirm: buttonPressed(gamepad.buttons[face.confirm]),
    back: buttonPressed(gamepad.buttons[face.back]),
    pause: buttonPressed(gamepad.buttons[9]),
  };
}

/** Convert the immutable diagnostic snapshot exposed by the central manager. */
export function gamepadUiDeviceToMenuSnapshot(device: GamepadUiDevice): MenuGamepadSnapshot {
  const pressed = (index: number): boolean => {
    const button = device.buttons.find((candidate) => candidate.index === index);
    return Boolean(button?.pressed || (button?.value ?? 0) >= 0.5);
  };
  const face = menuFaceButtons(device.family ?? familyFromId(device.id));
  return {
    key: `${device.index}:${device.id}`,
    connected: device.connected,
    x: device.axes[0] ?? 0,
    y: device.axes[1] ?? 0,
    dpadUp: pressed(12),
    dpadDown: pressed(13),
    dpadLeft: pressed(14),
    dpadRight: pressed(15),
    confirm: pressed(face.confirm),
    back: pressed(face.back),
    pause: pressed(9),
  };
}

function isUnavailable(element: HTMLElement): boolean {
  if (!element.isConnected || element.hidden) return true;
  if (element.getAttribute("aria-hidden") === "true") return true;
  if (element.getAttribute("aria-disabled") === "true") return true;
  if (element instanceof HTMLButtonElement && element.disabled) return true;
  if (element instanceof HTMLInputElement && element.disabled) return true;
  if (element instanceof HTMLSelectElement && element.disabled) return true;
  if (element instanceof HTMLTextAreaElement && element.disabled) return true;

  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") return true;
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return true;
    current = current.parentElement;
  }
  return false;
}

function center(element: HTMLElement): Point {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function directionVector(direction: MenuDirection): Point {
  switch (direction) {
    case "left": return { x: -1, y: 0 };
    case "right": return { x: 1, y: 0 };
    case "up": return { x: 0, y: -1 };
    case "down": return { x: 0, y: 1 };
  }
}

function allRectsCollapsed(elements: readonly HTMLElement[]): boolean {
  return elements.every((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0;
  });
}

function linearFallback(
  elements: readonly HTMLElement[],
  current: HTMLElement,
  direction: MenuDirection,
): HTMLElement | undefined {
  const index = elements.indexOf(current);
  if (index < 0 || elements.length === 0) return elements[0];
  const delta = direction === "left" || direction === "up" ? -1 : 1;
  return elements[(index + delta + elements.length) % elements.length];
}

function findSpatialTarget(
  elements: readonly HTMLElement[],
  current: HTMLElement,
  direction: MenuDirection,
): HTMLElement | undefined {
  if (allRectsCollapsed(elements)) return linearFallback(elements, current, direction);

  const origin = center(current);
  const vector = directionVector(direction);
  let best: { element: HTMLElement; score: number } | undefined;

  for (const element of elements) {
    if (element === current) continue;
    const candidate = center(element);
    const dx = candidate.x - origin.x;
    const dy = candidate.y - origin.y;
    const primary = dx * vector.x + dy * vector.y;
    if (primary <= 1) continue;
    const perpendicular = Math.abs(dx * vector.y - dy * vector.x);
    // Strongly prefer the requested direction while allowing staggered grids.
    const score = primary + perpendicular * 0.52 + (perpendicular * perpendicular) / Math.max(80, primary * 6);
    if (!best || score < best.score) best = { element, score };
  }
  if (best) return best.element;

  // Wrap to the opposite edge, then choose the closest row/column.
  const candidates = elements.filter((element) => element !== current);
  candidates.sort((first, second) => {
    const a = center(first);
    const b = center(second);
    const aPrimary = a.x * vector.x + a.y * vector.y;
    const bPrimary = b.x * vector.x + b.y * vector.y;
    if (Math.abs(aPrimary - bPrimary) > 1) return aPrimary - bPrimary;
    const aPerpendicular = Math.abs((a.x - origin.x) * vector.y - (a.y - origin.y) * vector.x);
    const bPerpendicular = Math.abs((b.x - origin.x) * vector.y - (b.y - origin.y) * vector.x);
    return aPerpendicular - bPerpendicular;
  });
  return candidates[0];
}

/**
 * DOM adapter for controller-driven menus.
 *
 * Call update() from the application's existing animation frame after gamepads
 * are polled. Button edges, stick hysteresis and held-direction repeat are all
 * handled here, so a held A can never activate a control on the next screen.
 */
export class GamepadMenuNavigation {
  private readonly root: HTMLElement;
  private readonly options: Required<Pick<GamepadMenuNavigationOptions,
    "axisThreshold" | "axisReleaseThreshold" | "repeatDelayMs" | "repeatIntervalMs">>
    & Omit<GamepadMenuNavigationOptions,
      "axisThreshold" | "axisReleaseThreshold" | "repeatDelayMs" | "repeatIntervalMs">;
  private readonly buttonMemory = new Map<string, ButtonMemory>();
  private activeDirection: MenuDirection | undefined;
  private directionStartedAt = 0;
  private nextRepeatAt = 0;
  private currentFocus: HTMLElement | undefined;
  private actionsLockedUntilRelease = false;
  private destroyed = false;

  private readonly pointerListener = (): void => this.setInputMode("pointer");
  private readonly keyboardListener = (): void => this.setInputMode("keyboard");

  constructor(root: HTMLElement, options: GamepadMenuNavigationOptions = {}) {
    this.root = root;
    this.options = {
      ...options,
      axisThreshold: options.axisThreshold ?? DEFAULT_AXIS_THRESHOLD,
      axisReleaseThreshold: options.axisReleaseThreshold ?? DEFAULT_AXIS_RELEASE_THRESHOLD,
      repeatDelayMs: options.repeatDelayMs ?? DEFAULT_REPEAT_DELAY_MS,
      repeatIntervalMs: options.repeatIntervalMs ?? DEFAULT_REPEAT_INTERVAL_MS,
    };
    const eventTarget = this.options.eventTarget ?? window;
    eventTarget.addEventListener("pointerdown", this.pointerListener);
    eventTarget.addEventListener("keydown", this.keyboardListener);
  }

  update(snapshots: readonly MenuGamepadSnapshot[], now = performance.now()): void {
    if (this.destroyed) return;
    const connected = snapshots.filter((snapshot) => snapshot.connected !== false);
    const connectedKeys = new Set(connected.map((snapshot) => snapshot.key));
    for (const key of this.buttonMemory.keys()) {
      if (!connectedKeys.has(key)) this.buttonMemory.delete(key);
    }

    let confirmEdge = false;
    let backEdge = false;
    let pauseEdge = false;
    let anyActionHeld = false;
    for (const snapshot of connected) {
      const previous = this.buttonMemory.get(snapshot.key) ?? {
        confirm: false,
        back: false,
        pause: false,
      };
      confirmEdge ||= snapshot.confirm && !previous.confirm;
      backEdge ||= snapshot.back && !previous.back;
      pauseEdge ||= snapshot.pause && !previous.pause;
      anyActionHeld ||= snapshot.confirm || snapshot.back || snapshot.pause;
      this.buttonMemory.set(snapshot.key, {
        confirm: snapshot.confirm,
        back: snapshot.back,
        pause: snapshot.pause,
      });
    }

    if (!anyActionHeld) this.actionsLockedUntilRelease = false;
    const direction = this.readDirection(connected);
    this.updateDirection(direction, now);

    if (this.actionsLockedUntilRelease) return;
    if (pauseEdge) {
      this.useGamepadMode();
      this.actionsLockedUntilRelease = true;
      this.resetDirection();
      this.options.onPause?.();
      return;
    }
    if (backEdge) {
      this.useGamepadMode();
      this.actionsLockedUntilRelease = true;
      this.resetDirection();
      if (this.options.onBack) this.options.onBack();
      else this.activateDefaultBack();
      return;
    }
    if (confirmEdge) {
      this.useGamepadMode();
      this.actionsLockedUntilRelease = true;
      this.resetDirection();
      const target = this.resolveCurrentFocus() ?? this.focusFirst();
      if (target) {
        this.options.onConfirm?.(target);
        target.click();
      }
    }
  }

  /** Keep edge memory current while another interaction model owns the screen. */
  suspend(snapshots: readonly MenuGamepadSnapshot[]): void {
    if (this.destroyed) return;
    const connected = snapshots.filter((snapshot) => snapshot.connected !== false);
    const connectedKeys = new Set(connected.map((snapshot) => snapshot.key));
    for (const key of this.buttonMemory.keys()) {
      if (!connectedKeys.has(key)) this.buttonMemory.delete(key);
    }
    let anyActionHeld = false;
    for (const snapshot of connected) {
      anyActionHeld ||= snapshot.confirm || snapshot.back || snapshot.pause;
      this.buttonMemory.set(snapshot.key, {
        confirm: snapshot.confirm,
        back: snapshot.back,
        pause: snapshot.pause,
      });
    }
    this.actionsLockedUntilRelease = anyActionHeld;
    this.resetDirection();
    this.clearFocus();
  }

  focusFirst(): HTMLElement | undefined {
    const first = this.focusables()[0];
    if (first) this.focus(first);
    return first;
  }

  clearFocus(): void {
    this.currentFocus?.classList.remove("cc-gamepad-focus");
    this.currentFocus = undefined;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const eventTarget = this.options.eventTarget ?? window;
    eventTarget.removeEventListener("pointerdown", this.pointerListener);
    eventTarget.removeEventListener("keydown", this.keyboardListener);
    this.clearFocus();
    this.buttonMemory.clear();
    this.root.removeAttribute("data-input-mode");
  }

  private readDirection(snapshots: readonly MenuGamepadSnapshot[]): MenuDirection | undefined {
    let best: { direction: MenuDirection; magnitude: number } | undefined;

    const consider = (direction: MenuDirection, magnitude: number): void => {
      const threshold = direction === this.activeDirection
        ? this.options.axisReleaseThreshold
        : this.options.axisThreshold;
      if (magnitude < threshold) return;
      if (!best || magnitude > best.magnitude) best = { direction, magnitude };
    };

    for (const snapshot of snapshots) {
      consider("left", snapshot.dpadLeft ? 1.2 : -snapshot.x);
      consider("right", snapshot.dpadRight ? 1.2 : snapshot.x);
      consider("up", snapshot.dpadUp ? 1.2 : -snapshot.y);
      consider("down", snapshot.dpadDown ? 1.2 : snapshot.y);
    }
    return best?.direction;
  }

  private updateDirection(direction: MenuDirection | undefined, now: number): void {
    if (!direction) {
      this.resetDirection();
      return;
    }
    if (direction !== this.activeDirection) {
      this.activeDirection = direction;
      this.directionStartedAt = now;
      this.nextRepeatAt = now + this.options.repeatDelayMs;
      this.move(direction);
      return;
    }
    if (now < this.nextRepeatAt) return;
    this.move(direction);
    // Skip missed repeats instead of firing a burst after a suspended tab.
    this.nextRepeatAt = Math.max(
      now + this.options.repeatIntervalMs,
      this.directionStartedAt + this.options.repeatDelayMs,
    );
  }

  private resetDirection(): void {
    this.activeDirection = undefined;
    this.directionStartedAt = 0;
    this.nextRepeatAt = 0;
  }

  private move(direction: MenuDirection): void {
    this.useGamepadMode();
    const focusables = this.focusables();
    if (focusables.length === 0) return;
    const current = this.resolveCurrentFocus();
    if (!current || !focusables.includes(current)) {
      this.focus(focusables[0]!);
      return;
    }

    if (this.adjustNativeControl(current, direction)) return;
    const target = findSpatialTarget(focusables, current, direction);
    if (target) this.focus(target);
  }

  private adjustNativeControl(element: HTMLElement, direction: MenuDirection): boolean {
    if (direction !== "left" && direction !== "right") return false;
    const delta = direction === "right" ? 1 : -1;
    if (element instanceof HTMLInputElement && element.type === "range") {
      const minimum = element.min === "" ? 0 : Number(element.min);
      const maximum = element.max === "" ? 100 : Number(element.max);
      const step = element.step === "" || element.step === "any" ? 1 : Number(element.step);
      const next = Math.max(minimum, Math.min(maximum, Number(element.value) + delta * step));
      element.value = String(next);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    if (element instanceof HTMLSelectElement && element.options.length > 0) {
      const next = Math.max(0, Math.min(element.options.length - 1, element.selectedIndex + delta));
      if (next !== element.selectedIndex) {
        element.selectedIndex = next;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => !isUnavailable(element));
  }

  private resolveCurrentFocus(): HTMLElement | undefined {
    if (this.currentFocus && !isUnavailable(this.currentFocus)) return this.currentFocus;
    this.currentFocus?.classList.remove("cc-gamepad-focus");
    const active = document.activeElement;
    this.currentFocus = active instanceof HTMLElement && this.root.contains(active) && !isUnavailable(active)
      ? active
      : undefined;
    return this.currentFocus;
  }

  private focus(element: HTMLElement): void {
    if (this.currentFocus !== element) this.currentFocus?.classList.remove("cc-gamepad-focus");
    this.currentFocus = element;
    element.classList.add("cc-gamepad-focus");
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    this.options.onFocus?.(element);
  }

  private activateDefaultBack(): void {
    for (const action of DEFAULT_BACK_ACTIONS) {
      const target = this.root.querySelector<HTMLElement>(`[data-ui-action='${action}']`);
      if (target && !isUnavailable(target)) {
        target.click();
        return;
      }
    }
  }

  private useGamepadMode(): void {
    this.root.dataset.inputMode = "gamepad";
  }

  private setInputMode(mode: "pointer" | "keyboard"): void {
    this.clearFocus();
    this.root.dataset.inputMode = mode;
  }
}
