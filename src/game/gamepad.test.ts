import { describe, expect, it, vi } from "vitest";
import type { ActionName } from "./contracts";
import { createEmptyInputFrame } from "./input";
import {
  GAMEPAD_STORAGE_KEY,
  GamepadManager,
  applyRadialDeadzone,
  mergeInputFrames,
  type GamepadButtonLike,
  type GamepadLike,
  type GamepadNavigatorLike,
  type GamepadStorageLike,
} from "./gamepad";

class FakeStorage implements GamepadStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeNavigator implements GamepadNavigatorLike {
  pads: Array<GamepadLike | null> = [];

  getGamepads(): ArrayLike<GamepadLike | null> {
    return this.pads;
  }
}

class CountingTarget extends EventTarget {
  readonly active = new Map<string, Set<EventListenerOrEventListenerObject>>();

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (callback) {
      const callbacks = this.active.get(type) ?? new Set();
      callbacks.add(callback);
      this.active.set(type, callbacks);
    }
    super.addEventListener(type, callback, options);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    if (callback) this.active.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
}

class FakePad implements GamepadLike {
  connected = true;
  mapping = "standard";
  axes: number[] = [0, 0, 0, 0];
  buttons: GamepadButtonLike[] = Array.from({ length: 18 }, () => ({
    pressed: false,
    value: 0,
  }));

  constructor(
    readonly index: number,
    readonly id = "Xbox Wireless Controller",
  ) {}

  button(index: number, down: boolean, value = down ? 1 : 0): this {
    this.buttons[index] = { pressed: down, value };
    return this;
  }

  stick(leftX: number, leftY: number, rightX = 0, rightY = 0): this {
    this.axes = [leftX, leftY, rightX, rightY];
    return this;
  }
}

const eventWithGamepad = (type: string, gamepad: GamepadLike): Event => {
  const event = new Event(type);
  Object.defineProperty(event, "gamepad", { value: gamepad });
  return event;
};

const managerWith = (
  pads: FakePad[] = [],
  storage: GamepadStorageLike | null = new FakeStorage(),
) => {
  const navigator = new FakeNavigator();
  for (const pad of pads) navigator.pads[pad.index] = pad;
  const target = new CountingTarget();
  const manager = new GamepadManager({ navigator, eventTarget: target, storage });
  return { manager, navigator, target };
};

describe("GamepadManager discovery and assignment", () => {
  it("reports the browser activation requirement when no pad is exposed", () => {
    const { manager } = managerWith();
    expect(manager.getSnapshot()).toMatchObject({
      devices: [],
      activationRequired: true,
      sources: [{ type: "keyboard" }, { type: "keyboard" }],
    });
    manager.destroy();
  });

  it("assigns the first visible pad to P1 and the second to P2", () => {
    const first = new FakePad(0);
    const second = new FakePad(1, "DualSense Wireless Controller");
    const { manager } = managerWith([first, second]);
    const snapshot = manager.getSnapshot();
    expect(snapshot.sources).toEqual([
      { type: "gamepad", index: 0, id: first.id },
      { type: "gamepad", index: 1, id: second.id },
    ]);
    expect(snapshot.devices.map((device) => device.assignedPlayer)).toEqual([0, 1]);
    manager.destroy();
  });

  it("supports keyboard plus pad and never assigns one pad twice", () => {
    const first = new FakePad(0);
    const second = new FakePad(1);
    const { manager } = managerWith([first, second]);
    manager.useKeyboard(0);
    manager.assign(0, 1);
    manager.poll();

    const snapshot = manager.getSnapshot();
    expect(snapshot.sources[0]).toEqual({ type: "keyboard" });
    expect(snapshot.sources[1]).toEqual({ type: "gamepad", index: 0, id: first.id });
    expect(snapshot.devices.find((device) => device.index === 0)?.assignedPlayer).toBe(1);
    expect(snapshot.devices.find((device) => device.index === 1)?.assignedPlayer).toBeNull();
    manager.destroy();
  });

  it("keeps an explicit keyboard choice across polls and refreshes", () => {
    const storage = new FakeStorage();
    const pad = new FakePad(0);
    const first = managerWith([pad], storage);
    first.manager.useKeyboard(0);
    first.manager.poll();
    expect(first.manager.getSnapshot().sources[0]).toEqual({ type: "keyboard" });
    first.manager.destroy();

    const refreshed = managerWith([pad], storage);
    expect(refreshed.manager.getSnapshot().sources[0]).toEqual({ type: "keyboard" });
    refreshed.manager.destroy();
  });

  it("handles disconnect and reconnect by id, including a changed index", () => {
    const pad = new FakePad(0, "Generic Pro Controller");
    const { manager, navigator, target } = managerWith([pad]);
    const events = vi.fn();
    manager.subscribeEvents(events);

    pad.connected = false;
    navigator.pads = [];
    target.dispatchEvent(eventWithGamepad("gamepaddisconnected", pad));
    expect(manager.getSnapshot().sources[0]).toEqual({
      type: "gamepad",
      index: 0,
      id: pad.id,
    });
    expect(manager.getSnapshot().devices[0]?.connected).toBe(false);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({
      type: "disconnected",
      previousPlayer: 0,
    }));

    const reconnected = new FakePad(2, pad.id);
    navigator.pads[2] = reconnected;
    target.dispatchEvent(eventWithGamepad("gamepadconnected", reconnected));
    expect(manager.getSnapshot().sources[0]).toEqual({
      type: "gamepad",
      index: 2,
      id: pad.id,
    });
    expect(manager.getSnapshot().devices.find((device) => device.index === 2)?.assignedPlayer).toBe(0);
    manager.destroy();
  });

  it("swaps assignments without creating a duplicate", () => {
    const first = new FakePad(0);
    const second = new FakePad(1, "DualSense Wireless Controller");
    const { manager } = managerWith([first, second]);
    manager.swapAssignments();
    expect(manager.getSnapshot().sources).toEqual([
      { type: "gamepad", index: 1, id: second.id },
      { type: "gamepad", index: 0, id: first.id },
    ]);
    expect(new Set(manager.getSnapshot().devices.map((device) => device.assignedPlayer)).size).toBe(2);
    manager.destroy();
  });
});

describe("GamepadManager mapping and analog input", () => {
  it("normalizes a radial deadzone and removes drift", () => {
    expect(applyRadialDeadzone(0.1, -0.08, 0.18)).toEqual({ x: 0, y: 0 });
    const moved = applyRadialDeadzone(0.59, 0, 0.18);
    expect(moved.x).toBeCloseTo(0.5, 2);
    expect(moved.y).toBe(0);
  });

  it("uses analog movement after the deadzone without repeated direction edges", () => {
    const pad = new FakePad(0).stick(0.12, 0);
    const { manager } = managerWith([pad]);
    manager.poll();
    expect(manager.consumeFrame(0).direction.x).toBe(0);

    pad.stick(0.7, 0);
    manager.poll();
    const first = manager.consumeFrame(0);
    expect(first.direction.x).toBeGreaterThan(0.6);
    expect(first.analog).toBe(true);
    expect(first.pressed.has("right")).toBe(true);
    manager.poll();
    expect(manager.consumeFrame(0).pressed.has("right")).toBe(false);
    manager.destroy();
  });

  it("separates held buttons from new presses and releases", () => {
    const pad = new FakePad(0).button(0, true);
    const { manager } = managerWith([pad]);
    manager.poll();
    const first = manager.consumeFrame(0);
    expect(first.held.has("attack")).toBe(true);
    expect(first.pressed.has("attack")).toBe(true);

    manager.poll();
    expect(manager.consumeFrame(0).pressed.has("attack")).toBe(false);
    pad.button(0, false);
    manager.poll();
    expect(manager.consumeFrame(0).released.has("attack")).toBe(true);
    manager.destroy();
  });

  it("maps both triggers to shield and both bumpers to grab by default", () => {
    const pad = new FakePad(0);
    const { manager } = managerWith([pad]);
    expect(manager.getSnapshot().bindings[0]).toMatchObject({
      shield: "LT / RT",
      grab: "LB / RB",
      jump: "X / Y",
    });

    for (const button of [6, 7]) {
      pad.button(button, true);
      manager.poll();
      expect(manager.consumeFrame(0).pressed.has("shield")).toBe(true);
      pad.button(button, false);
      manager.poll();
      manager.consumeFrame(0);
    }
    for (const button of [4, 5]) {
      pad.button(button, true);
      manager.poll();
      expect(manager.consumeFrame(0).pressed.has("grab")).toBe(true);
      pad.button(button, false);
      manager.poll();
      manager.consumeFrame(0);
    }
    manager.destroy();
  });

  it("turns a right-stick flick into one directional Smash press", () => {
    const pad = new FakePad(0).stick(0, 0, -1, 0);
    const { manager } = managerWith([pad]);
    manager.poll();
    const smash = manager.consumeFrame(0);
    expect(smash.direction.x).toBeLessThan(-0.95);
    expect(smash.pressed.has("left")).toBe(true);
    expect(smash.pressed.has("attack")).toBe(true);

    manager.poll();
    const held = manager.consumeFrame(0);
    expect(held.held.has("attack")).toBe(true);
    expect(held.pressed.has("attack")).toBe(false);
    manager.destroy();
  });

  it("maps the D-pad to the engine's taunt gesture", () => {
    const pad = new FakePad(0).button(12, true);
    const { manager } = managerWith([pad]);
    manager.poll();
    const frame = manager.consumeFrame(0);
    expect(frame.held.has("shield")).toBe(true);
    expect(frame.pressed.has("grab")).toBe(true);
    manager.destroy();
  });

  it("uses the standard face-button mapping for gameplay and menus", () => {
    const pad = new FakePad(0, "Generic Pro Controller").button(0, true);
    const { manager } = managerWith([pad]);
    manager.poll();
    expect(manager.consumeFrame(0).pressed.has("attack")).toBe(true);
    expect(manager.menuSnapshots()[0]).toMatchObject({ confirm: true, back: false });
    manager.destroy();
  });

  it("adds a binding after release, resolves conflicts, and persists per player and id", () => {
    const storage = new FakeStorage();
    const pad = new FakePad(0);
    const first = managerWith([pad], storage);
    first.manager.startCapture(0, "attack");
    first.manager.poll();
    pad.button(5, true);
    first.manager.poll();
    expect(first.manager.getSnapshot().capture).toBeNull();
    expect(first.manager.getSnapshot().bindings[0].attack).toEqual([0, 5]);
    // Button 5 was one of the two grab defaults; its sibling remains available.
    expect(first.manager.getSnapshot().bindings[0].grab).toEqual([4]);
    expect(storage.getItem(GAMEPAD_STORAGE_KEY)).toContain(pad.id);
    first.manager.destroy();

    pad.button(5, false);
    const refreshed = managerWith([pad], storage);
    pad.button(5, true);
    refreshed.manager.poll();
    expect(refreshed.manager.consumeFrame(0).pressed.has("attack")).toBe(true);
    refreshed.manager.resetBindings(0);
    expect(refreshed.manager.getSnapshot().bindings[0].attack).toBe("A");
    refreshed.manager.destroy();
  });

  it("does not capture the button that opened the remapping control", () => {
    const pad = new FakePad(0).button(0, true);
    const { manager } = managerWith([pad]);
    manager.startCapture(0, "jump");
    manager.poll();
    expect(manager.getSnapshot().capture).toEqual({ player: 0, action: "jump" });
    pad.button(0, false);
    manager.poll();
    pad.button(4, true);
    manager.poll();
    expect(manager.getSnapshot().bindings[0].jump).toEqual([2, 3, 4]);
    expect(manager.getSnapshot().bindings[0].grab).toEqual([5]);
    manager.destroy();
  });

  it("can remap a digital direction and persists the configured deadzone", () => {
    const storage = new FakeStorage();
    const pad = new FakePad(0);
    const first = managerWith([pad], storage);
    first.manager.startCapture(0, "left");
    first.manager.poll();
    pad.button(10, true);
    first.manager.poll();
    const frame = first.manager.consumeFrame(0);
    expect(frame.held.has("left")).toBe(true);
    expect(frame.direction.x).toBe(-1);
    first.manager.setDeadzone(0.24);
    first.manager.destroy();

    pad.button(10, false);
    const refreshed = managerWith([pad], storage);
    expect(refreshed.manager.getSnapshot().deadzone).toBe(0.24);
    expect(refreshed.manager.getSnapshot().bindings[0].left).toEqual([10]);
    refreshed.manager.destroy();
  });

  it("never binds the system button", () => {
    const pad = new FakePad(0);
    const { manager } = managerWith([pad]);
    manager.startCapture(0, "attack");
    manager.poll();
    pad.button(16, true);
    manager.poll();
    expect(manager.getSnapshot().capture).toEqual({ player: 0, action: "attack" });
    manager.destroy();
  });
});

describe("GamepadManager integration surfaces", () => {
  it("merges keyboard and gamepad actions into one abstract frame", () => {
    const keyboard = createEmptyInputFrame();
    keyboard.held.add("jump");
    keyboard.pressed.add("jump");
    keyboard.direction.x = -1;
    const gamepad = createEmptyInputFrame();
    gamepad.held.add("attack");
    gamepad.pressed.add("attack");
    gamepad.direction.y = 0.8;

    expect(mergeInputFrames(keyboard, gamepad)).toEqual({
      held: new Set<ActionName>(["jump", "attack"]),
      pressed: new Set<ActionName>(["jump", "attack"]),
      released: new Set<ActionName>(),
      direction: { x: -1, y: 0.8 },
      analog: false,
    });
  });

  it("gives a digital keyboard axis priority over opposing stick drift", () => {
    const keyboard = createEmptyInputFrame();
    keyboard.direction.x = 1;
    keyboard.held.add("right");
    const gamepad = createEmptyInputFrame();
    gamepad.direction.x = -0.35;
    gamepad.analog = true;
    gamepad.held.add("left");

    expect(mergeInputFrames(keyboard, gamepad)).toMatchObject({
      direction: { x: 1, y: 0 },
      analog: false,
    });
  });

  it("exposes a global pause edge once", () => {
    const pad = new FakePad(0).button(9, true);
    const { manager } = managerWith([pad]);
    manager.poll();
    expect(manager.consumePausePress()).toBe(true);
    expect(manager.consumePausePress()).toBe(false);
    manager.destroy();
  });

  it("publishes raw and deadzoned diagnostic axes", () => {
    const pad = new FakePad(0).stick(0.1, 0, 0.8, 0);
    const { manager } = managerWith([pad]);
    manager.poll();
    const device = manager.getSnapshot().devices[0]!;
    expect(device.axesRaw.slice(0, 4)).toEqual([0.1, 0, 0.8, 0]);
    expect(device.axes[0]).toBe(0);
    expect(device.axes[2]).toBeGreaterThan(0.7);
    manager.destroy();
  });

  it("removes connection listeners on destroy", () => {
    const { manager, target } = managerWith();
    expect(target.active.get("gamepadconnected")?.size).toBe(1);
    expect(target.active.get("gamepaddisconnected")?.size).toBe(1);
    manager.destroy();
    expect(target.active.get("gamepadconnected")?.size).toBe(0);
    expect(target.active.get("gamepaddisconnected")?.size).toBe(0);
  });
});
