// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_FIGHTER_IDS } from "../game/contracts";
import { UIController } from "./ui";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe.runIf(__PUBLIC_CONTENT_ONLY__)("public-content-only UI", () => {
  it("starts with two fighters that exist in the open runtime roster", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    const root = document.createElement("div");
    document.body.append(root);
    const ui = new UIController(root);

    expect(ui.getMatchConfig().players.every(({ fighter }) =>
      (OPEN_FIGHTER_IDS as readonly string[]).includes(fighter)
    )).toBe(true);

    ui.destroy();
  });
});
