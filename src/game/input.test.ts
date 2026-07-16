import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BINDINGS,
  KeyboardInput,
  formatKeyCode,
} from "./input";

describe("KeyboardInput", () => {
  it("keeps physical defaults while formatting QWERTY labels by default", () => {
    expect(DEFAULT_BINDINGS[0]).toMatchObject({
      left: "KeyA",
      right: "KeyD",
      up: "KeyW",
      down: "KeyS",
      jump: "KeyH",
      attack: "KeyF",
      special: "KeyG",
      shield: "KeyR",
      grab: "KeyT",
    });
    expect(DEFAULT_BINDINGS[1]).toMatchObject({
      left: "ArrowLeft",
      right: "ArrowRight",
      up: "ArrowUp",
      down: "ArrowDown",
      jump: "Semicolon",
      attack: "KeyK",
      special: "KeyL",
      shield: "KeyO",
      grab: "KeyP",
    });
    expect(formatKeyCode("KeyQ")).toBe("Q");
    expect(formatKeyCode("KeyA")).toBe("A");
    expect(formatKeyCode("KeyW")).toBe("W");
    expect(formatKeyCode("KeyZ")).toBe("Z");
    expect(formatKeyCode("KeyA", true)).toBe("Q");
  });

  it("captures both players in the same simulation tick", () => {
    const input = new KeyboardInput();
    input.handleKeyDown({ code: "KeyF" });
    input.handleKeyDown({ code: "KeyK" });

    const [playerOne, playerTwo] = input.consumeFrames();
    expect(playerOne.pressed.has("attack")).toBe(true);
    expect(playerTwo.pressed.has("attack")).toBe(true);
    expect(playerOne.held.has("attack")).toBe(true);
    expect(playerTwo.held.has("attack")).toBe(true);

    const [nextOne, nextTwo] = input.consumeFrames();
    expect(nextOne.pressed.size).toBe(0);
    expect(nextTwo.pressed.size).toBe(0);
    expect(nextOne.held.has("attack")).toBe(true);
    expect(nextTwo.held.has("attack")).toBe(true);
  });

  it("reports held, pressed and released edges without key-repeat noise", () => {
    const input = new KeyboardInput();
    input.handleKeyDown({ code: "KeyH" });
    input.handleKeyDown({ code: "KeyH", repeat: true });

    expect(input.consumeFrame(0).pressed).toEqual(new Set(["jump"]));
    expect(input.consumeFrame(0).pressed.size).toBe(0);

    input.handleKeyUp({ code: "KeyH" });
    const released = input.consumeFrame(0);
    expect(released.held.has("jump")).toBe(false);
    expect(released.released).toEqual(new Set(["jump"]));
  });

  it("combines opposing movement into a deterministic direction", () => {
    const input = new KeyboardInput();
    input.handleKeyDown({ code: "KeyA" });
    input.handleKeyDown({ code: "KeyW" });
    expect(input.peekFrame(0).direction).toEqual({ x: -1, y: 1 });

    input.handleKeyDown({ code: "KeyD" });
    expect(input.peekFrame(0).direction).toEqual({ x: 0, y: 1 });
  });

  it("prevents browser shortcuts only for active gameplay bindings", () => {
    const input = new KeyboardInput();
    const preventDefault = vi.fn();
    input.handleKeyDown({ code: "ArrowUp", preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();

    const unrelated = vi.fn();
    input.handleKeyDown({ code: "Numpad9", preventDefault: unrelated });
    expect(unrelated).not.toHaveBeenCalled();
  });

  it("clears all state on blur/disable so no control remains stuck", () => {
    const input = new KeyboardInput();
    input.handleKeyDown({ code: "KeyF" });
    input.handleKeyDown({ code: "KeyK" });
    input.clear();
    expect(input.consumeFrames()).toEqual([
      {
        held: new Set(),
        pressed: new Set(),
        released: new Set(),
        direction: { x: 0, y: 0 },
      },
      {
        held: new Set(),
        pressed: new Set(),
        released: new Set(),
        direction: { x: 0, y: 0 },
      },
    ]);

    input.setEnabled(false);
    input.handleKeyDown({ code: "KeyF" });
    expect(input.isHeld(0, "attack")).toBe(false);
  });

  it("treats pause as one global edge even though either player can pause", () => {
    const input = new KeyboardInput();
    input.handleKeyDown({ code: "Escape" });
    expect(input.consumePausePress()).toBe(true);
    expect(input.consumePausePress()).toBe(false);
    expect(input.peekFrame(0).held.has("pause")).toBe(true);
    expect(input.peekFrame(1).held.has("pause")).toBe(true);
  });
});
