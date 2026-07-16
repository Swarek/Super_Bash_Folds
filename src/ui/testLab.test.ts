// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TEST_LAB_ANIMATION_SLOTS,
  TEST_LAB_EFFECTS,
  TestLabController,
  labFrameAtTime,
} from "./testLab";
import { OPEN_FIGHTER_IDS } from "../game/contracts";

const loadedSources: string[] = [];

class LabImage {
  decoding = "auto";
  complete = false;
  naturalWidth = 0;
  private source = "";

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    loadedSources.push(value);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
}

afterEach(() => {
  loadedSources.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Test Lab animation transport", () => {
  it("exposes every required inspection slot exactly once", () => {
    expect(TEST_LAB_ANIMATION_SLOTS).toHaveLength(50);
    expect(new Set(TEST_LAB_ANIMATION_SLOTS).size).toBe(50);
    expect(TEST_LAB_ANIMATION_SLOTS).toEqual(expect.arrayContaining([
      "idle", "crouch", "walk", "turn", "dash", "run", "jump_squat", "jump", "double_jump", "fall", "fast_fall",
      "jab", "dash_attack", "forward_tilt", "up_tilt", "down_tilt",
      "forward_smash", "up_smash", "down_smash", "neutral_air", "forward_air",
      "back_air", "up_air", "down_air", "neutral_special", "side_special",
      "up_special", "down_special", "spot_dodge", "roll_forward", "roll_back",
      "air_dodge", "shield", "item_hold", "item_pickup", "item_attack", "grab", "grab_hold", "grabbed", "forward_throw",
      "back_throw", "up_throw", "down_throw", "hurt", "knockback", "downed", "ledge",
      "entrance", "taunt", "victory",
    ]));
  });

  it("exposes the complete isolated visual-effect bank", () => {
    expect(TEST_LAB_EFFECTS).toEqual([
      "none", "hit", "shield", "projectile", "explosion", "smoke", "speed", "invincible", "ko",
    ]);
  });

  it("loops deterministically at the selected playback speed", () => {
    const clip = { frameCount: 6, fps: 12 };
    expect(labFrameAtTime(clip, 0, 1, true)).toBe(0);
    expect(labFrameAtTime(clip, 0.25, 1, true)).toBe(3);
    expect(labFrameAtTime(clip, 0.25, 2, true)).toBe(0);
  });

  it("clamps non-looping playback to the last frame", () => {
    const clip = { frameCount: 8, fps: 10 };
    expect(labFrameAtTime(clip, -2, 1, false)).toBe(0);
    expect(labFrameAtTime(clip, 0.31, 1, false)).toBe(3);
    expect(labFrameAtTime(clip, 99, 1, false)).toBe(7);
  });

  it("loads the selected open atlas without a CSS colour filter", () => {
    vi.stubGlobal("Image", LabImage);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const root = document.createElement("div");
    document.body.append(root);
    const controller = new TestLabController(root);

    expect(root.querySelector("[data-lab-overlay='collision']")?.getAttribute("viewBox")).toBe(
      "0 0 1920 1080",
    );
    const fighterSelect = root.querySelector<HTMLSelectElement>("[data-lab-field='fighter']")!;
    fighterSelect.value = OPEN_FIGHTER_IDS[0];
    fighterSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const hurtbox = root.querySelector<HTMLElement>("[data-lab-overlay='hurt']")!;
    const standingHeight = Number.parseFloat(hurtbox.style.height);
    const animation = root.querySelector<HTMLSelectElement>("[data-lab-field='animation']")!;
    animation.value = "crouch";
    animation.dispatchEvent(new Event("change", { bubbles: true }));
    expect(hurtbox.dataset.hurtboxState).toBe("crouch");
    expect(Number.parseFloat(hurtbox.style.height)).toBeLessThan(standingHeight);

    expect(loadedSources.at(-1)).toBe(
      `/assets/characters/open/${OPEN_FIGHTER_IDS[0]}/00/crouch.webp?v=clean-animation-4`,
    );
    animation.value = "idle";
    animation.dispatchEvent(new Event("change", { bubbles: true }));
    const skin = root.querySelector<HTMLSelectElement>("[data-lab-field='skin']")!;
    expect(Array.from(skin.options, ({ value }) => value)).toEqual(["00"]);

    expect(loadedSources.at(-1)).toBe(
      `/assets/characters/open/${OPEN_FIGHTER_IDS[0]}/00/idle.webp?v=clean-animation-4`,
    );
    expect(root.querySelector<HTMLCanvasElement>("[data-lab-canvas]")?.style.filter).toBe("none");
    controller.destroy();
  });
});
