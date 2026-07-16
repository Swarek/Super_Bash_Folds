import { afterEach, describe, expect, it, vi } from "vitest";
import { FIGHTER_IDS } from "./contracts";
import type { FighterSnapshot } from "./engine";
import { getFighterDefinition } from "./roster";
import {
  CHARACTER_ATLAS_REVISION,
  CHARACTER_PORTRAITS,
  CharacterSpriteLibrary,
  FIGHTER_VISUAL_MANIFESTS,
  REMOTE_ANIMATION_CONFIG,
  REMOTE_ANIMATION_SLOTS,
  remoteAnimationSetForFighter,
  remoteAnimationSlotForFighter,
} from "./characterAssets";

const loadedSources: string[] = [];

class FakeImage {
  decoding = "auto";
  referrerPolicy = "";
  complete = true;
  naturalWidth = 320;
  private source = "";

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    loadedSources.push(value);
  }

  addEventListener(): void {}
}

class SelectivelyPendingImage extends FakeImage {
  override set src(value: string) {
    super.src = value;
    if (value.includes("/jab.webp")) {
      this.complete = false;
      this.naturalWidth = 0;
    }
  }

  override get src(): string {
    return super.src;
  }
}

let retryDecodeAttempts = 0;

class RetryDecodeImage extends FakeImage {
  decode(): Promise<void> {
    retryDecodeAttempts += 1;
    return retryDecodeAttempts === 1
      ? Promise.reject(new Error("transient decode failure"))
      : Promise.resolve();
  }
}

const fighter = (
  overrides: Partial<FighterSnapshot> = {},
): FighterSnapshot => {
  const fighterId = overrides.fighter ?? "george";
  const definition = getFighterDefinition(fighterId);
  return {
    slot: 0,
    fighter: fighterId,
    skin: "00",
    name: definition.displayName,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 1,
    percent: 0,
    stocks: 3,
    state: "idle",
    grounded: true,
    fastFalling: false,
    jumpsRemaining: 2,
    shield: 100,
    maxShield: 100,
    invulnerableFrames: 0,
    currentMove: null,
    moveFrame: 0,
    specialPhase: null,
    visualRotation: 0,
    hitstunFrames: 0,
    respawnFrames: 0,
    charge: 0,
    grabTarget: null,
    grabbedBy: null,
    grabFrames: 0,
    dodgeKind: null,
    throwAnimation: null,
    ledge: null,
    size: definition.size,
    heldItem: null,
    itemAction: null,
    activeEffects: {
      damageMultiplier: 1,
      speedMultiplier: 1,
      jumpMultiplier: 1,
      defenseMultiplier: 1,
      projectileShieldFrames: 0,
    },
    ...overrides,
  };
};

afterEach(() => {
  loadedSources.length = 0;
  retryDecodeAttempts = 0;
  vi.unstubAllGlobals();
});

describe("open fighter atlases", () => {
  it("declares a complete clean atlas set for every runtime fighter", () => {
    expect(Object.keys(REMOTE_ANIMATION_CONFIG.fighters)).toEqual([...FIGHTER_IDS]);
    for (const fighter of FIGHTER_IDS) {
      const manifest = FIGHTER_VISUAL_MANIFESTS[fighter];
      expect(manifest.sourceKind).toMatch(/^open-/);
      expect(manifest.availableSkins).toEqual(["00"]);
      expect(CHARACTER_PORTRAITS[fighter]).toBe(
        `/assets/ui/fighters/${fighter}/select/00.png`,
      );

      const resolved = remoteAnimationSetForFighter(fighter, "03");
      expect(resolved.skin).toBe("00");
      expect(Object.keys(resolved.animations)).toEqual([...REMOTE_ANIMATION_SLOTS]);
      for (const definition of Object.values(resolved.animations)) {
        expect(definition.mediaUrl).toContain(`/assets/characters/open/${fighter}/00/`);
        expect(definition.mediaUrl).toContain(CHARACTER_ATLAS_REVISION);
        expect(definition.containsHitboxOverlay).toBe(false);
        expect(definition.frameCount).toBeGreaterThan(0);
        expect(definition.columns).toBeGreaterThan(0);
        expect(definition.cellSize).toBeGreaterThan(0);
      }
    }
  });

  it("uses atlas animation rendering by default", () => {
    const library = new CharacterSpriteLibrary();
    expect(library.usesAtlasAnimations()).toBe(true);
    library.destroy();
  });

  it("loads open atlases, advances authored frames, and falls back to skin 00", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const running = fighter({
      fighter: "rgs-stick",
      skin: "03",
      state: "run",
      velocity: { x: getFighterDefinition("rgs-stick").runSpeed, y: 0 },
    });

    const first = library.frameFor(running, 0);
    const next = library.frameFor(running, 1 / 12);

    expect(first?.image.src).toBe(
      `/assets/characters/open/rgs-stick/00/run.webp?v=${CHARACTER_ATLAS_REVISION}`,
    );
    expect(first?.sourceFacing).toBe("right");
    expect(first?.sourceRect?.x).toBe(0);
    expect(next?.sourceRect?.x).toBe(192);
    expect(loadedSources).toHaveLength(1);
    library.destroy();
  });

  it("keeps the last resolved frame while the next open atlas is pending", () => {
    vi.stubGlobal("Image", SelectivelyPendingImage);
    const library = new CharacterSpriteLibrary();

    const idle = library.frameFor(fighter(), 0);
    const pendingJab = library.frameFor(
      fighter({ state: "attack", currentMove: "jab", moveFrame: 1 }),
      0.1,
    );

    expect(idle?.source).toBe("remote");
    expect(pendingJab).toBe(idle);
    expect(pendingJab?.image.src).toContain("/idle.webp");
    library.destroy();
  });

  it("retries a rejected atlas decode instead of wedging the animation", async () => {
    vi.stubGlobal("Image", RetryDecodeImage);
    const library = new CharacterSpriteLibrary();

    expect(library.frameFor(fighter(), 0)).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(library.frameFor(fighter(), 0.05)).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(library.frameFor(fighter(), 0.1)?.source).toBe("remote");
    expect(retryDecodeAttempts).toBe(2);
    library.destroy();
  });

  it("keeps cached atlases only for the selected open fighters", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const george = fighter({ fighter: "george" });
    const knight = fighter({ fighter: "kaykit-knight" });

    library.frameFor(george, 0);
    library.frameFor(knight, 0.1);
    library.prepareMatch([{ fighter: "kaykit-knight", skin: "00" }]);
    library.frameFor(knight, 0.2);
    expect(loadedSources).toHaveLength(2);

    library.frameFor(george, 0.3);
    expect(loadedSources).toHaveLength(3);
    library.destroy();
  });

  it("deduplicates match atlases with bounded concurrency and monotone progress", async () => {
    vi.stubGlobal("Image", FakeImage);
    const fetchedSources: string[] = [];
    let activeFetches = 0;
    let peakFetches = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      fetchedSources.push(String(input));
      activeFetches += 1;
      peakFetches = Math.max(peakFetches, activeFetches);
      await Promise.resolve();
      activeFetches -= 1;
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response;
    }));
    const progress: Array<{ completed: number; total: number }> = [];
    const library = new CharacterSpriteLibrary();

    await library.preloadMatch([
      { fighter: "george", skin: "00" },
      { fighter: "george", skin: "00" },
    ], {
      concurrency: 4,
      onProgress: (value) => progress.push(value),
    });

    const requested = new Set([...loadedSources, ...fetchedSources]);
    expect(requested.size).toBe(REMOTE_ANIMATION_SLOTS.length);
    expect([...requested].every((source) =>
      source.includes("/assets/characters/open/george/00/")
    )).toBe(true);
    expect(peakFetches).toBeLessThanOrEqual(4);
    expect(progress[0]).toEqual({ completed: 0, total: REMOTE_ANIMATION_SLOTS.length });
    expect(progress.at(-1)).toEqual({
      completed: REMOTE_ANIMATION_SLOTS.length,
      total: REMOTE_ANIMATION_SLOTS.length,
    });
    expect(progress.every((value, index) =>
      index === 0 || value.completed >= progress[index - 1]!.completed
    )).toBe(true);
    library.destroy();
  });
});

describe("remoteAnimationSlotForFighter", () => {
  it.each([
    [fighter(), "idle"],
    [fighter({ state: "crouch" }), "crouch"],
    [fighter({ state: "walk", velocity: { x: 80, y: 0 } }), "walk"],
    [fighter({ velocity: { x: 80, y: 0 } }), "run"],
    [fighter({ grounded: false, velocity: { x: 0, y: 120 } }), "jump"],
    [fighter({ grounded: false, jumpsRemaining: 0, velocity: { x: 0, y: 120 } }), "double_jump"],
    [fighter({ grounded: false, velocity: { x: 0, y: -120 } }), "fall"],
    [fighter({ grounded: false, fastFalling: true, velocity: { x: 0, y: -600 } }), "fast_fall"],
    [fighter({ state: "attack", currentMove: "jab" }), "jab"],
    [fighter({ state: "attack", currentMove: "dash-attack" }), "dash_attack"],
    [fighter({ state: "attack", currentMove: "forward-tilt" }), "forward_tilt"],
    [fighter({ state: "attack", currentMove: "up-tilt" }), "up_tilt"],
    [fighter({ state: "attack", currentMove: "down-tilt" }), "down_tilt"],
    [fighter({ state: "attack", currentMove: "forward-smash" }), "forward_smash"],
    [fighter({ state: "attack", currentMove: "up-smash" }), "up_smash"],
    [fighter({ state: "attack", currentMove: "down-smash" }), "down_smash"],
    [fighter({ state: "attack", currentMove: "neutral-air" }), "neutral_air"],
    [fighter({ state: "attack", currentMove: "forward-air" }), "forward_air"],
    [fighter({ state: "attack", currentMove: "back-air" }), "back_air"],
    [fighter({ state: "attack", currentMove: "up-air" }), "up_air"],
    [fighter({ state: "attack", currentMove: "down-air" }), "down_air"],
    [fighter({ state: "attack", currentMove: "neutral-special" }), "neutral_special"],
    [fighter({ state: "attack", currentMove: "side-special" }), "side_special"],
    [fighter({ state: "attack", currentMove: "up-special" }), "up_special"],
    [fighter({ state: "attack", currentMove: "down-special" }), "down_special"],
    [fighter({ state: "grab" }), "grab"],
    [fighter({ state: "grab", grabTarget: 1, grabFrames: 11 }), "grab_hold"],
    [fighter({ state: "grabbed", grabbedBy: 1 }), "grabbed"],
    [fighter({ state: "grab", throwAnimation: "forward" }), "forward_throw"],
    [fighter({ state: "grab", throwAnimation: "back" }), "back_throw"],
    [fighter({ state: "grab", throwAnimation: "up" }), "up_throw"],
    [fighter({ state: "grab", throwAnimation: "down" }), "down_throw"],
    [fighter({ state: "dodge", dodgeKind: "spot" }), "spot_dodge"],
    [fighter({ state: "dodge", dodgeKind: "forward" }), "roll_forward"],
    [fighter({ state: "dodge", dodgeKind: "back" }), "roll_back"],
    [fighter({ state: "dodge", grounded: false, dodgeKind: "air" }), "air_dodge"],
    [fighter({ state: "shield" }), "shield"],
    [fighter({ heldItem: { kind: "plasma-blade", charges: 3 } }), "item_hold"],
    [fighter({ heldItem: { kind: "plasma-blade", charges: 3 }, itemAction: "pickup" }), "item_pickup"],
    [fighter({ state: "attack", heldItem: { kind: "plasma-blade", charges: 2 }, itemAction: "attack" }), "item_attack"],
    [fighter({ state: "jump-squat" }), "jump_squat"],
    [fighter({ state: "dash" }), "dash"],
    [fighter({ state: "turn" }), "turn"],
    [fighter({ state: "ledge" }), "ledge"],
    [fighter({ state: "entrance" }), "entrance"],
    [fighter({ state: "respawn" }), "entrance"],
    [fighter({ state: "taunt" }), "taunt"],
    [fighter({ state: "hitstun" }), "hurt"],
    [fighter({ state: "hitstun", statusEffect: "bury" }), "downed"],
    [fighter({ state: "hitstun", velocity: { x: 300, y: 240 } }), "knockback"],
    [fighter({ state: "ko" }), "knockback"],
    [fighter({ state: "victory" }), "victory"],
  ] as const)("maps an open fighter snapshot to %s", (snapshot, expected) => {
    expect(remoteAnimationSlotForFighter(snapshot)).toBe(expected);
  });
});
