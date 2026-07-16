// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GamepadUiDevice, GamepadUiSnapshot } from "./gamepadUi";
import { CharacterSelectCursors } from "./characterSelectCursors";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function device(index: number, assignedPlayer: 0 | 1, confirm: boolean): GamepadUiDevice {
  return {
    index,
    id: `pad-${index}`,
    family: "xbox",
    connected: true,
    assignedPlayer,
    buttons: [{ index: 0, pressed: confirm, value: confirm ? 1 : 0 }],
    axesRaw: [0, 0],
    axes: [0, 0],
  };
}

function snapshot(confirmP1: boolean, confirmP2: boolean): GamepadUiSnapshot {
  return {
    devices: [device(0, 0, confirmP1), device(1, 1, confirmP2)],
    sources: [
      { type: "gamepad", index: 0, id: "pad-0" },
      { type: "gamepad", index: 1, id: "pad-1" },
    ],
    bindings: [{}, {}],
    deadzone: 0.18,
  };
}

describe("CharacterSelectCursors", () => {
  afterEach(() => document.body.replaceChildren());

  it("uses the distributable cursor art", () => {
    const root = document.createElement("div");
    document.body.append(root);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rect(0, 0, 1000, 700));
    const cursors = new CharacterSelectCursors(root, {
      selectedFighter: () => "george",
      activate: vi.fn(),
      onBack: vi.fn(),
    });
    cursors.update({
      ...snapshot(false, false),
      devices: [device(0, 0, false)],
      sources: [{ type: "gamepad", index: 0, id: "pad-0" }, { type: "keyboard" }],
    }, 0);

    expect(root.querySelector<HTMLImageElement>(".cc-player-cursor__pointer")?.getAttribute("src"))
      .toBe("/assets/open/ui/cursor-pointer.svg");
    expect(root.querySelector<HTMLImageElement>(".cc-player-cursor__grab")?.getAttribute("src"))
      .toBe("/assets/open/ui/cursor-grab.svg");
    cursors.destroy();
  });

  it("keeps two controller cursors independent and activates for their assigned players", () => {
    const root = document.createElement("div");
    const firstCard = document.createElement("button");
    const secondCard = document.createElement("button");
    firstCard.dataset.uiAction = "pick-fighter";
    firstCard.dataset.fighter = "george";
    secondCard.dataset.uiAction = "pick-fighter";
    secondCard.dataset.fighter = "kaykit-knight";
    root.append(firstCard, secondCard);
    document.body.append(root);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rect(0, 0, 1000, 700));
    vi.spyOn(firstCard, "getBoundingClientRect").mockReturnValue(rect(100, 100, 120, 100));
    vi.spyOn(secondCard, "getBoundingClientRect").mockReturnValue(rect(700, 100, 120, 100));
    const activate = vi.fn();
    const cursors = new CharacterSelectCursors(root, {
      selectedFighter: (slot) => slot === 0 ? "george" : "kaykit-knight",
      activate,
      onBack: vi.fn(),
      hitTest: (x) => x < 500 ? firstCard : secondCard,
    });

    cursors.update(snapshot(false, false), 0);
    expect(root.querySelectorAll(".cc-player-cursor")).toHaveLength(2);
    expect(firstCard.classList.contains("is-cursor-p1")).toBe(true);
    expect(secondCard.classList.contains("is-cursor-p2")).toBe(true);

    cursors.update(snapshot(true, true), 16);
    expect(activate).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenNthCalledWith(1, 0, firstCard, { x: 160, y: 150 });
    expect(activate).toHaveBeenNthCalledWith(2, 1, secondCard, { x: 760, y: 150 });
    cursors.destroy();
  });

  it("continues onto generic controls after leaving character select", () => {
    const root = document.createElement("div");
    const fighter = document.createElement("button");
    fighter.dataset.uiAction = "pick-fighter";
    fighter.dataset.fighter = "george";
    const stage = document.createElement("button");
    stage.textContent = "Verdant Grove";
    root.append(fighter, stage);
    document.body.append(root);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rect(0, 0, 1000, 700));
    vi.spyOn(fighter, "getBoundingClientRect").mockReturnValue(rect(100, 100, 120, 100));
    const activate = vi.fn();
    let target: Element = fighter;
    const cursors = new CharacterSelectCursors(root, {
      selectedFighter: () => "george",
      activate,
      onBack: vi.fn(),
      hitTest: () => target,
    });

    cursors.update({ ...snapshot(false, false), devices: [device(0, 0, false)], sources: [{ type: "gamepad", index: 0, id: "pad-0" }, { type: "keyboard" }] }, 0);
    target = stage;
    cursors.update({ ...snapshot(false, false), devices: [device(0, 0, false)], sources: [{ type: "gamepad", index: 0, id: "pad-0" }, { type: "keyboard" }] }, 16);
    expect(stage.classList.contains("is-cursor-p1")).toBe(true);
    cursors.update({ ...snapshot(true, false), devices: [device(0, 0, true)], sources: [{ type: "gamepad", index: 0, id: "pad-0" }, { type: "keyboard" }] }, 32);
    expect(activate).toHaveBeenCalledWith(0, stage, { x: 160, y: 150 });
    cursors.destroy();
  });
});
