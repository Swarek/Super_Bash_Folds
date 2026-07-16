// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPEN_FIGHTER_IDS,
  type ActionName,
  type PlayerSlot,
} from "../game/contracts";
import type { GamepadUiAdapter, GamepadUiListener, GamepadUiSnapshot } from "./gamepadUi";
import { UIController } from "./ui";

const bindings = {
  left: "Left stick ←",
  right: "Left stick →",
  up: "Left stick ↑",
  down: "Left stick ↓",
  jump: 1,
  attack: 0,
  special: 2,
  shield: 5,
  grab: 7,
  pause: 9,
} satisfies Partial<Record<ActionName, number | string>>;

const connectedSnapshot = (): GamepadUiSnapshot => ({
  devices: [{
    index: 0,
    id: "Generic USB Pro Controller",
    name: "Generic Pro Controller",
    family: "generic",
    mapping: "standard",
    connected: true,
    assignedPlayer: 0,
    buttons: Array.from({ length: 18 }, (_, index) => ({ index, pressed: index === 1, value: index === 1 ? 1 : 0 })),
    axesRaw: [0.04, -0.5, 0.72, 0],
    axes: [0, -0.39, 0.66, 0],
  }],
  sources: [{ type: "gamepad", index: 0, id: "Generic USB Pro Controller" }, { type: "keyboard" }],
  bindings: [{ ...bindings }, { ...bindings }],
  deadzone: 0.18,
  activationRequired: false,
  capture: null,
});

class FakeGamepadAdapter implements GamepadUiAdapter {
  snapshot: GamepadUiSnapshot;
  listeners = new Set<GamepadUiListener>();
  assign = vi.fn<(index: number, player: PlayerSlot) => void>();
  useKeyboard = vi.fn<(player: PlayerSlot) => void>();
  swapAssignments = vi.fn<() => void>();
  startCapture = vi.fn<(player: PlayerSlot, action: ActionName) => void>((player, action) => {
    this.snapshot = { ...this.snapshot, capture: { player, action } };
    this.emit();
  });
  cancelCapture = vi.fn<() => void>();
  resetBindings = vi.fn<(player: PlayerSlot) => void>();
  setDeadzone = vi.fn<(value: number) => void>();

  constructor(snapshot: GamepadUiSnapshot = connectedSnapshot()) {
    this.snapshot = snapshot;
  }

  getSnapshot(): GamepadUiSnapshot { return this.snapshot; }
  subscribe(listener: GamepadUiListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(): void { for (const listener of this.listeners) listener(this.snapshot); }
}

const click = (root: HTMLElement, selector: string): void => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing control ${selector}`);
  element.click();
};

const openControls = (ui: UIController, root: HTMLElement): void => {
  click(root, "[data-ui-action='boot-skip']");
  click(root, "[data-ui-action='title-start']");
  click(root, "[data-ui-action='home-controls']");
  expect(ui.screen).toBe("controls");
  click(root, "[data-ui-action='controls-tab'][data-controls-tab='gamepad']");
};

describe("controller configuration UI", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("switches between keyboard and controller tabs and exposes live diagnostics", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const adapter = new FakeGamepadAdapter();
    const ui = new UIController(root, {}, { gamepads: adapter });

    openControls(ui, root);
    expect(root.querySelector("[data-gamepad-workbench]")).not.toBeNull();
    expect(root.textContent).toContain("Generic Pro Controller");
    expect(root.textContent).toContain("standard • P1");
    expect(root.textContent).toContain("0.04 / 0.00");
    expect(root.textContent).toContain("A");

    click(root, "[data-ui-action='controls-tab'][data-controls-tab='keyboard']");
    expect(root.querySelectorAll(".cc-control-panel")).toHaveLength(2);
    ui.destroy();
  });

  it("routes assignment, remapping, reset, swap and deadzone commands through the adapter", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const adapter = new FakeGamepadAdapter();
    const ui = new UIController(root, {}, { gamepads: adapter });
    openControls(ui, root);

    const assignment = root.querySelector<HTMLSelectElement>("[data-ui-field='gamepad-assignment'][data-player-slot='1']")!;
    assignment.value = "gamepad:0";
    assignment.dispatchEvent(new Event("change", { bubbles: true }));
    expect(adapter.assign).toHaveBeenCalledWith(0, 1);

    click(root, "[data-ui-action='gamepad-swap']");
    expect(adapter.swapAssignments).toHaveBeenCalledTimes(1);
    click(root, "[data-ui-action='gamepad-binding-capture'][data-binding-action='attack']");
    expect(adapter.startCapture).toHaveBeenCalledWith(0, "attack");
    expect(root.textContent).toContain("Press…");
    click(root, "[data-ui-action='gamepad-reset']");
    expect(adapter.resetBindings).toHaveBeenCalledWith(0);

    const deadzone = root.querySelector<HTMLInputElement>("[data-ui-gamepad-deadzone]")!;
    deadzone.value = "24";
    deadzone.dispatchEvent(new Event("input", { bubbles: true }));
    expect(adapter.setDeadzone).toHaveBeenCalledWith(0.24);
    expect(root.querySelector("[data-gamepad-deadzone-output]")?.textContent).toBe("24%");
    ui.destroy();
  });

  it("keeps mouse selection on the keyboard player while the controller selects its own player", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const adapter = new FakeGamepadAdapter();
    const onFighterSelected = vi.fn();
    const ui = new UIController(root, { onFighterSelected }, { gamepads: adapter });
    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    click(root, "[data-ui-action='home-play']");

    const controllerFighter = OPEN_FIGHTER_IDS[1];
    const keyboardFighter = OPEN_FIGHTER_IDS[0];
    click(root, `[data-ui-action='pick-fighter'][data-fighter='${controllerFighter}']`);
    expect(onFighterSelected).toHaveBeenLastCalledWith(controllerFighter, 1);
    expect(ui.getMatchConfig().players[1].fighter).toBe(controllerFighter);

    const keyboardCard = root.querySelector<HTMLElement>(
      `[data-ui-action='pick-fighter'][data-fighter='${keyboardFighter}']`,
    )!;
    ui.activateCursorTarget(0, keyboardCard);
    expect(onFighterSelected).toHaveBeenLastCalledWith(keyboardFighter, 0);
    expect(ui.getMatchConfig().players[0].fighter).toBe(keyboardFighter);
    ui.destroy();
  });

  it("lets a controller cursor configure and choose for a CPU slot", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const adapter = new FakeGamepadAdapter();
    const ui = new UIController(root, {}, { gamepads: adapter });
    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    click(root, "[data-ui-action='home-play']");

    ui.activateCursorTarget(0, root.querySelector<HTMLElement>(
      "[data-ui-action='set-player-mode'][data-player-slot='1'][data-player-cpu='true']",
    )!);
    ui.activateCursorTarget(0, root.querySelector<HTMLElement>(
      "[data-ui-action='activate-player'][data-player-slot='1']",
    )!);
    const cpuFighter = OPEN_FIGHTER_IDS[1];
    ui.activateCursorTarget(0, root.querySelector<HTMLElement>(
      `[data-ui-action='pick-fighter'][data-fighter='${cpuFighter}']`,
    )!);

    expect(ui.getMatchConfig().players[1]).toMatchObject({ fighter: cpuFighter, cpu: true });
    ui.destroy();
  });

  it("explains browser activation and reports assigned disconnects for the match pause layer", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const adapter = new FakeGamepadAdapter();
    const onControllerDisconnected = vi.fn();
    const onControllerReconnectResolved = vi.fn();
    const ui = new UIController(root, { onControllerDisconnected, onControllerReconnectResolved }, { gamepads: adapter });
    openControls(ui, root);

    adapter.snapshot = {
      ...adapter.snapshot,
      devices: adapter.snapshot.devices.map((device) => ({ ...device, connected: false })),
    };
    adapter.emit();
    expect(onControllerDisconnected).toHaveBeenCalledWith(0, "Generic Pro Controller");

    adapter.snapshot = {
      ...adapter.snapshot,
      devices: [],
      sources: [{ type: "keyboard" }, { type: "keyboard" }],
      activationRequired: true,
    };
    adapter.emit();
    expect(root.textContent).toContain("Press a button to connect the controller");

    ui.showControllerReconnect(0, "Generic Pro Controller");
    expect(root.querySelector("[role='alertdialog']")).not.toBeNull();
    click(root, "[data-ui-action='reconnect-keyboard']");
    expect(adapter.useKeyboard).toHaveBeenCalledWith(0);
    expect(onControllerReconnectResolved).toHaveBeenCalledWith(0);
    expect(root.querySelector("[role='alertdialog']")).toBeNull();
    ui.destroy();
  });
});
