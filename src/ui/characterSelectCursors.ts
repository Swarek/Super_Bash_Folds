import type { FighterId, PlayerSlot } from "../game/contracts";
import type { GamepadUiDevice, GamepadUiSnapshot } from "./gamepadUi";
import { gamepadUiDeviceToMenuSnapshot } from "./gamepadNavigation";

interface CursorState {
  slot: PlayerSlot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  confirm: boolean;
  back: boolean;
  element: HTMLDivElement;
  hover?: HTMLElement;
}

export interface CharacterSelectCursorOptions {
  selectedFighter: (slot: PlayerSlot) => FighterId;
  activate: (slot: PlayerSlot, target: HTMLElement, point: { x: number; y: number }) => void;
  onBack: () => void;
  onMove?: () => void;
  hitTest?: (x: number, y: number) => Element | null;
}

const CURSOR_SPEED = 920;
const CURSOR_MARGIN = 22;
const AUTO_SCROLL_EDGE = 88;
const INTERACTIVE_SELECTOR = [
  "[data-ui-action]:not([disabled]):not([aria-disabled='true'])",
  "button:not([disabled]):not([aria-disabled='true'])",
  "select:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "textarea:not([disabled])",
  "a[href]",
  "[role='button']:not([aria-disabled='true'])",
].join(",");

function handMarkup(slot: PlayerSlot): string {
  const pointer = __PRIVATE_CONTENT_MODE__
    ? "/assets/ui/cursor/ultimate-pointer.png"
    : "/assets/open/ui/cursor-pointer.svg";
  const grab = __PRIVATE_CONTENT_MODE__
    ? "/assets/ui/cursor/ultimate-grab.png"
    : "/assets/open/ui/cursor-grab.svg";
  return `
    <span class="cc-player-cursor__hand" aria-hidden="true">
      <img class="cc-player-cursor__pointer" src="${pointer}" alt="" draggable="false">
      <img class="cc-player-cursor__grab" src="${grab}" alt="" draggable="false">
    </span>
    <span>P${slot + 1}</span>`;
}

function sourceDevice(snapshot: GamepadUiSnapshot, slot: PlayerSlot): GamepadUiDevice | undefined {
  const source = snapshot.sources[slot];
  if (source.type !== "gamepad") return undefined;
  return snapshot.devices.find((device) => device.connected && device.index === source.index);
}

export class CharacterSelectCursors {
  private readonly root: HTMLElement;
  private readonly options: CharacterSelectCursorOptions;
  private readonly layer: HTMLDivElement;
  private readonly cursors = new Map<PlayerSlot, CursorState>();
  private lastTime?: number;

  constructor(root: HTMLElement, options: CharacterSelectCursorOptions) {
    this.root = root;
    this.options = options;
    this.layer = document.createElement("div");
    this.layer.className = "cc-player-cursors";
    this.layer.setAttribute("aria-hidden", "true");
    this.root.append(this.layer);
  }

  update(snapshot: GamepadUiSnapshot, now = performance.now()): void {
    const dt = Math.min(0.04, Math.max(0, (now - (this.lastTime ?? now)) / 1000));
    this.lastTime = now;
    const activeSlots = new Set<PlayerSlot>();

    for (const slot of [0, 1] as const) {
      const device = sourceDevice(snapshot, slot);
      if (!device) continue;
      activeSlots.add(slot);
      const state = this.cursors.get(slot) ?? this.createCursor(slot);
      const menu = gamepadUiDeviceToMenuSnapshot(device);
      const dpadX = menu.dpadLeft ? -1 : menu.dpadRight ? 1 : 0;
      const dpadY = menu.dpadUp ? -1 : menu.dpadDown ? 1 : 0;
      const inputX = dpadX || menu.x;
      const inputY = dpadY || menu.y;
      const targetVx = inputX * CURSOR_SPEED;
      const targetVy = inputY * CURSOR_SPEED;
      const response = 1 - Math.exp(-18 * dt);
      state.vx += (targetVx - state.vx) * response;
      state.vy += (targetVy - state.vy) * response;

      const bounds = this.root.getBoundingClientRect();
      state.x = Math.max(bounds.left + CURSOR_MARGIN, Math.min(bounds.right - CURSOR_MARGIN, state.x + state.vx * dt));
      state.y = Math.max(bounds.top + CURSOR_MARGIN, Math.min(bounds.bottom - CURSOR_MARGIN, state.y + state.vy * dt));
      this.autoScroll(state, inputY, dt, bounds);
      this.renderCursor(state, Math.hypot(inputX, inputY) > 0.25);
      this.updateHover(state);

      const confirmEdge = menu.confirm && !state.confirm;
      const backEdge = menu.back && !state.back;
      state.confirm = menu.confirm;
      state.back = menu.back;
      state.element.classList.toggle("is-pressing", menu.confirm);
      if (confirmEdge && state.hover) {
        this.options.activate(slot, state.hover, { x: state.x, y: state.y });
      }
      else if (backEdge) this.options.onBack();
    }

    for (const [slot, state] of this.cursors) {
      if (activeSlots.has(slot)) continue;
      this.clearHover(state);
      state.element.remove();
      this.cursors.delete(slot);
    }
  }

  reset(): void {
    this.lastTime = undefined;
    for (const state of this.cursors.values()) {
      this.clearHover(state);
      state.element.remove();
    }
    this.cursors.clear();
  }

  destroy(): void {
    this.reset();
    this.layer.remove();
  }

  private createCursor(slot: PlayerSlot): CursorState {
    const element = document.createElement("div");
    element.className = `cc-player-cursor cc-player-cursor--p${slot + 1}`;
    element.innerHTML = handMarkup(slot);
    this.layer.append(element);
    const selected = this.options.selectedFighter(slot);
    const card = this.root.querySelector<HTMLElement>(`[data-ui-action="pick-fighter"][data-fighter="${selected}"]`);
    const bounds = (card ?? this.root).getBoundingClientRect();
    const state: CursorState = {
      slot,
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
      vx: 0,
      vy: 0,
      confirm: true,
      back: true,
      element,
    };
    this.cursors.set(slot, state);
    this.renderCursor(state, false);
    return state;
  }

  private renderCursor(state: CursorState, moving: boolean): void {
    state.element.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
    state.element.classList.toggle("is-moving", moving);
  }

  private autoScroll(state: CursorState, inputY: number, dt: number, bounds: DOMRect): void {
    if (Math.abs(inputY) < 0.2) return;
    const surface = this.root.querySelector<HTMLElement>("[data-cc-screen-root]");
    if (!surface || surface.scrollHeight <= surface.clientHeight) return;
    const nearTop = state.y <= bounds.top + AUTO_SCROLL_EDGE;
    const nearBottom = state.y >= bounds.bottom - AUTO_SCROLL_EDGE;
    if ((inputY < 0 && nearTop) || (inputY > 0 && nearBottom)) {
      surface.scrollTop += inputY * CURSOR_SPEED * 0.72 * dt;
    }
  }

  private updateHover(state: CursorState): void {
    const hit = (this.options.hitTest ?? ((x, y) => document.elementFromPoint(x, y)))(state.x, state.y);
    const target = hit instanceof Element ? hit.closest<HTMLElement>(INTERACTIVE_SELECTOR) : null;
    const next = target && this.root.contains(target) ? target : undefined;
    if (next === state.hover && next?.isConnected) return;
    this.clearHover(state);
    state.hover = next;
    if (next) {
      next.classList.add(`is-cursor-p${state.slot + 1}`);
      this.options.onMove?.();
    }
  }

  private clearHover(state: CursorState): void {
    state.hover?.classList.remove(`is-cursor-p${state.slot + 1}`);
    state.hover = undefined;
  }
}
