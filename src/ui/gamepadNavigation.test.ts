// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GamepadMenuNavigation,
  gamepadToMenuSnapshot,
  gamepadUiDeviceToMenuSnapshot,
  type MenuGamepadSnapshot,
} from "./gamepadNavigation";

const neutral = (key = "pad-0"): MenuGamepadSnapshot => ({
  key,
  connected: true,
  x: 0,
  y: 0,
  confirm: false,
  back: false,
  pause: false,
});

const withState = (
  patch: Partial<MenuGamepadSnapshot>,
  key = "pad-0",
): MenuGamepadSnapshot => ({ ...neutral(key), ...patch, key });

describe("GamepadMenuNavigation", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("main");
    root.innerHTML = `
      <button id="one">One</button>
      <button id="two">Two</button>
      <button id="three">Three</button>`;
    document.body.append(root);
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("navigates with an initial delay and controlled held-stick repeat", () => {
    const navigation = new GamepadMenuNavigation(root, {
      repeatDelayMs: 300,
      repeatIntervalMs: 100,
    });
    const down = [withState({ y: 0.9 })];

    navigation.update(down, 0);
    expect(document.activeElement).toBe(root.querySelector("#one"));
    navigation.update(down, 299);
    expect(document.activeElement).toBe(root.querySelector("#one"));
    navigation.update(down, 300);
    expect(document.activeElement).toBe(root.querySelector("#two"));
    navigation.update(down, 399);
    expect(document.activeElement).toBe(root.querySelector("#two"));
    navigation.update(down, 400);
    expect(document.activeElement).toBe(root.querySelector("#three"));
    navigation.destroy();
  });

  it("uses hysteresis to absorb stick drift without vibrating direction", () => {
    const navigation = new GamepadMenuNavigation(root, {
      axisThreshold: 0.58,
      axisReleaseThreshold: 0.34,
    });
    navigation.update([withState({ x: 0.22 })], 0);
    expect(document.activeElement).toBe(document.body);
    navigation.update([withState({ x: 0.8 })], 10);
    expect(document.activeElement).toBe(root.querySelector("#one"));
    navigation.update([withState({ x: 0.4 })], 20);
    expect(document.activeElement).toBe(root.querySelector("#one"));
    // Noise on the other axis must cross the full engage threshold before it
    // can replace the latched direction.
    navigation.update([withState({ x: 0.4, y: -0.45 })], 25);
    expect(document.activeElement).toBe(root.querySelector("#one"));
    navigation.update([withState({ x: 0.2 })], 30);
    navigation.update([withState({ x: 0.8 })], 40);
    expect(document.activeElement).toBe(root.querySelector("#two"));
    navigation.destroy();
  });

  it("navigates a real 13 by 2 fighter grid by row and column", () => {
    root.innerHTML = Array.from(
      { length: 26 },
      (_, index) => `<button id="fighter-${index}">Fighter ${index + 1}</button>`,
    ).join("");
    const cards = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
    for (const [index, card] of cards.entries()) {
      const column = index % 13;
      const row = Math.floor(index / 13);
      vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
        x: column * 80,
        y: row * 90,
        left: column * 80,
        top: row * 90,
        right: column * 80 + 72,
        bottom: row * 90 + 82,
        width: 72,
        height: 82,
        toJSON: () => ({}),
      });
    }
    const navigation = new GamepadMenuNavigation(root);
    cards[0]!.focus();

    navigation.update([withState({ x: 1 })], 0);
    expect(document.activeElement).toBe(cards[1]);
    navigation.update([neutral()], 10);
    navigation.update([withState({ y: 1 })], 20);
    expect(document.activeElement).toBe(cards[14]);
    navigation.update([neutral()], 30);
    navigation.update([withState({ y: -1 })], 40);
    expect(document.activeElement).toBe(cards[1]);

    navigation.clearFocus();
    cards[12]!.focus();
    navigation.update([neutral()], 50);
    navigation.update([withState({ x: 1 })], 60);
    expect(document.activeElement).toBe(cards[0]);
    navigation.destroy();
  });

  it("fires confirm once per press and never crosses a newly rendered screen", () => {
    const navigation = new GamepadMenuNavigation(root);
    const first = root.querySelector<HTMLButtonElement>("#one")!;
    let clicks = 0;
    first.addEventListener("click", () => {
      clicks += 1;
      root.innerHTML = '<button id="next">Next screen</button>';
    });

    navigation.update([withState({ y: 1 })], 0);
    navigation.update([neutral()], 10);
    navigation.update([withState({ confirm: true })], 20);
    navigation.update([withState({ confirm: true })], 40);
    navigation.update([withState({ confirm: true })], 1_000);
    expect(clicks).toBe(1);
    expect(root.querySelector("#next")).not.toBeNull();

    navigation.update([neutral()], 1_010);
    navigation.update([withState({ confirm: true })], 1_020);
    expect(document.activeElement).toBe(root.querySelector("#next"));
    navigation.destroy();
  });

  it("maps B to back, plus to pause, and does not let two pads duplicate a held action", () => {
    const onBack = vi.fn();
    const onPause = vi.fn();
    const navigation = new GamepadMenuNavigation(root, { onBack, onPause });

    navigation.update([
      withState({ back: true }, "pad-a"),
      withState({ back: true }, "pad-b"),
    ], 0);
    navigation.update([
      withState({ back: true }, "pad-a"),
      withState({ back: true }, "pad-b"),
    ], 30);
    expect(onBack).toHaveBeenCalledTimes(1);

    navigation.update([neutral("pad-a"), neutral("pad-b")], 40);
    navigation.update([withState({ pause: true }, "pad-b")], 50);
    expect(onPause).toHaveBeenCalledTimes(1);
    navigation.destroy();
  });

  it("falls back to the visible screen back action when no callback is supplied", () => {
    root.innerHTML = `
      <button data-ui-action="back-home">Back</button>
      <button data-ui-action="pause-resume" hidden>Resume</button>`;
    const back = vi.fn();
    root.querySelector("[data-ui-action='back-home']")?.addEventListener("click", back);
    const navigation = new GamepadMenuNavigation(root);
    navigation.update([withState({ back: true })], 0);
    expect(back).toHaveBeenCalledTimes(1);
    navigation.destroy();
  });

  it("adjusts ranges and selects without stealing mouse or keyboard controls", () => {
    root.innerHTML = `
      <input id="range" type="range" min="0" max="10" step="1" value="5">
      <select id="select"><option>A</option><option>B</option></select>`;
    const inputEvents = vi.fn();
    root.querySelector("#range")?.addEventListener("input", inputEvents);
    const navigation = new GamepadMenuNavigation(root);

    navigation.update([withState({ y: 1 })], 0);
    navigation.update([neutral()], 10);
    navigation.update([withState({ x: 1 })], 20);
    expect(root.querySelector<HTMLInputElement>("#range")?.value).toBe("6");
    expect(inputEvents).toHaveBeenCalledTimes(1);

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(root.dataset.inputMode).toBe("pointer");
    expect(root.querySelector(".cc-gamepad-focus")).toBeNull();
    navigation.destroy();
  });

  it("cleans event listeners and classes on destroy", () => {
    const navigation = new GamepadMenuNavigation(root);
    navigation.update([withState({ y: 1 })], 0);
    expect(root.dataset.inputMode).toBe("gamepad");
    navigation.destroy();
    expect(root.hasAttribute("data-input-mode")).toBe(false);
    expect(root.querySelector(".cc-gamepad-focus")).toBeNull();

    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowDown" }));
    expect(root.hasAttribute("data-input-mode")).toBe(false);
  });

  it("converts the Web Gamepad standard mapping", () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    buttons[0] = { pressed: true, touched: true, value: 1 };
    buttons[9] = { pressed: true, touched: true, value: 1 };
    buttons[14] = { pressed: true, touched: true, value: 1 };
    const gamepad = {
      axes: [0.25, -0.75, 0, 0],
      buttons,
      connected: true,
      id: "Wireless Controller",
      index: 1,
      mapping: "standard",
      timestamp: 0,
      vibrationActuator: null,
      hapticActuators: [],
    } as unknown as Gamepad;

    expect(gamepadToMenuSnapshot(gamepad)).toMatchObject({
      key: "1:Wireless Controller",
      x: 0.25,
      y: -0.75,
      dpadLeft: true,
      confirm: true,
      back: false,
      pause: true,
    });
  });

  it("uses physical A to confirm and B to return on Nintendo controllers", () => {
    const device = {
      index: 0,
      id: "Nintendo Switch Pro Controller",
      family: "nintendo" as const,
      connected: true,
      assignedPlayer: 0 as const,
      buttons: [
        { index: 0, pressed: false, value: 0 },
        { index: 1, pressed: true, value: 1 },
        { index: 9, pressed: false, value: 0 },
      ],
      axesRaw: [0, 0, 0, 0],
      axes: [0.4, -0.2, 0, 0],
    };
    expect(gamepadUiDeviceToMenuSnapshot(device)).toMatchObject({
      key: "0:Nintendo Switch Pro Controller",
      x: 0.4,
      y: -0.2,
      confirm: true,
      back: false,
    });
  });
});
