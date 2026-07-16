import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { effectiveJumpSquatFrames, type FighterSnapshot } from "./engine";
import {
  MELEE_FIGHTER_IDS,
  OPEN_2D_FIGHTER_IDS,
  OPEN_3D_FIGHTER_IDS,
} from "./contracts";
import { getFighterDefinition } from "./roster";
import {
  CharacterSpriteLibrary,
  FIGHTER_VISUAL_MANIFESTS,
  ICE_CLIMBERS_COMPANION_ASSET_ID,
  MELEE_RUN_PLAYBACK_MULTIPLIER,
  REMOTE_ANIMATION_CONFIG,
  REMOTE_ANIMATION_SLOTS,
  isFighterProductionReady,
  isFighterVisualReady,
  remoteAnimationSetForFighter,
  remoteAnimationSlotForFighter,
} from "./characterAssets";

const loadedSources: string[] = [];
const privatePipelineManifestUrl = new URL(
  "../../.local-private/tooling/scripts/ssbu_pipeline/manifest.json",
  import.meta.url,
);
const pipelineManifest = existsSync(privatePipelineManifestUrl)
  ? JSON.parse(readFileSync(privatePipelineManifestUrl, "utf8")) as Record<
      string,
      { clips: Record<string, string> }
    >
  : {};
const openPipelineManifest = JSON.parse(
  readFileSync(new URL("../../scripts/open_fighter_pipeline/manifest.json", import.meta.url), "utf8"),
) as {
  fighters: Record<string, {
    author: string;
    sourcePage: string;
    license: string;
    sourceFacing: "left" | "right";
  }>;
};
const open2DAnimationMetadata = JSON.parse(
  readFileSync(
    new URL("../../public/assets/characters/open/2d-animation-metadata.json", import.meta.url),
    "utf8",
  ),
) as {
  fighters: Record<string, Record<string, {
    frameCount: number;
    fps: number;
    columns: number;
    cellSize: number;
  }>>;
};

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

class PendingImage extends FakeImage {
  complete = false;
  naturalWidth = 0;
}

class SelectivelyPendingImage extends FakeImage {
  override set src(value: string) {
    super.src = value;
    if (value.includes("/jab.webp") || value.includes("/03/")) {
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
): FighterSnapshot => ({
  slot: 0,
  fighter: "mario",
  skin: "00",
  name: "Mario",
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
  size: { width: 48, height: 72 },
  ...overrides,
  heldItem: overrides.heldItem ?? null,
  itemAction: overrides.itemAction ?? null,
  activeEffects: overrides.activeEffects ?? {
    damageMultiplier: 1,
    speedMultiplier: 1,
    jumpMultiplier: 1,
    defenseMultiplier: 1,
    projectileShieldFrames: 0,
  },
});

afterEach(() => {
  loadedSources.length = 0;
  retryDecodeAttempts = 0;
  vi.unstubAllGlobals();
});

const privateAssetIt = it.runIf(!__PUBLIC_CONTENT_ONLY__);

describe("CharacterSpriteLibrary exact animation loading", () => {
  privateAssetIt("plays a full-speed Melee run cycle at 60 authored frames per second", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const running = fighter({ state: "run", velocity: { x: 702, y: 0 } });

    expect(MELEE_RUN_PLAYBACK_MULTIPLIER).toBe(2);
    expect(library.frameFor(running, 0)?.sourceRect?.x).toBe(0);
    expect(library.frameFor(running, 1 / 60)?.sourceRect?.x).toBe(192);
  });

  it("keeps an open fighter run cycle at its metadata frame rate", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const definition = getFighterDefinition("rgs-stick");
    const running = fighter({
      fighter: "rgs-stick",
      name: definition.displayName,
      state: "run",
      velocity: { x: definition.runSpeed, y: 0 },
      size: definition.size,
    });

    expect(library.frameFor(running, 0)?.sourceRect?.x).toBe(0);
    expect(library.frameFor(running, 1 / 12)?.sourceRect?.x).toBe(192);
  });

  privateAssetIt("keeps jump-squat animation aligned with the responsive jumpsquat cap", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const linkJumpSquat = fighter({
      fighter: "link",
      state: "jump-squat",
      size: { width: 64, height: 91 },
    });

    expect(effectiveJumpSquatFrames(6)).toBe(4);
    expect(library.frameFor(linkJumpSquat, 0)?.sourceRect?.x).toBe(0);
    expect(library.frameFor(linkJumpSquat, 2 / 60)?.sourceRect?.x).toBe(384);
    expect(library.frameFor(linkJumpSquat, 4 / 60)?.sourceRect?.x).toBe(768);
  });

  privateAssetIt("reuses atlas images and advances frames deterministically", () => {
    vi.stubGlobal("Image", FakeImage);

    const library = new CharacterSpriteLibrary();
    const exactLoads = () =>
      loadedSources.filter((source) => source.includes("/ultimate-sheets-native/"));

    expect(exactLoads()).toHaveLength(0);

    const idleFrame0 = library.frameFor(fighter(), 0);
    expect(idleFrame0?.source).toBe("remote");
    expect(idleFrame0?.sourceRect).toMatchObject({ x: 0, y: 0 });
    expect(exactLoads()).toHaveLength(1);
    expect(exactLoads()).toContain(
      "/assets/characters/ultimate-sheets-native/mario/00/idle.webp?v=clean-animation-4",
    );

    const idleFrame3 = library.frameFor(fighter(), 0.1);
    expect(idleFrame3?.sourceRect).toMatchObject({ x: 576, y: 0 });
    expect(exactLoads()).toHaveLength(1);

    library.frameFor(
      fighter({ state: "attack", currentMove: "jab", moveFrame: 1 }),
      0.2,
    );
    expect(exactLoads()).toContain(
      "/assets/characters/ultimate-sheets-native/mario/00/jab.webp?v=clean-animation-4",
    );
    expect(exactLoads()).toHaveLength(2);

    // Revisiting idle reuses the decoded atlas and restarts only its clock.
    library.frameFor(fighter(), 0.3);
    expect(exactLoads()).toHaveLength(2);

    library.frameFor(
      fighter({ state: "attack", currentMove: "forward-smash", moveFrame: 2 }),
      0.4,
    );
    expect(exactLoads()).toHaveLength(3);
  });

  privateAssetIt("plays Mario's authored turn backwards after the engine flips facing", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const turningMario = fighter({ state: "turn" });
    const atlasIndex = (elapsed: number): number => {
      const rect = library.frameFor(turningMario, elapsed)?.sourceRect;
      return rect ? rect.y / 192 * 8 + rect.x / 192 : -1;
    };

    expect(atlasIndex(0)).toBe(8);
    expect(atlasIndex(4 / 60)).toBe(1);
    expect(REMOTE_ANIMATION_CONFIG.fighters.george["00"]?.turn.reversePlayback).toBe(false);
  });

  privateAssetIt("plays the real start, launch, and fall segments for Fire Fox", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const move = getFighterDefinition("fox").attacks["up-special"];
    const atlasIndex = (snapshot: FighterSnapshot): number => {
      const rect = library.frameFor(snapshot, 0)?.sourceRect;
      return rect ? rect.y / 192 * 8 + rect.x / 192 : -1;
    };
    const fox = {
      fighter: "fox" as const,
      name: "Fox",
      state: "attack" as const,
      currentMove: "up-special" as const,
      grounded: false,
    };

    expect(atlasIndex(fighter({ ...fox, specialPhase: "startup", moveFrame: 0 }))).toBe(0);
    expect(atlasIndex(fighter({ ...fox, specialPhase: "active", moveFrame: move.startup }))).toBe(22);
    expect(atlasIndex(fighter({
      ...fox,
      specialPhase: "recovery",
      moveFrame: move.startup + move.active,
    }))).toBe(38);
  });

  privateAssetIt("never loads or displays legacy sprites while exact mode is pending", () => {
    vi.stubGlobal("Image", PendingImage);

    const library = new CharacterSpriteLibrary();

    expect(library.frameFor(fighter(), 0)).toBeNull();
    expect(library.usesExactAnimations()).toBe(true);
    expect(
      loadedSources.some(
        (source) =>
          source.includes("/assets/characters/mario/") &&
          !source.includes("/ultimate-sheets-native/"),
      ),
    ).toBe(false);
  });

  privateAssetIt("keeps the last exact frame visible while a new atlas is pending", () => {
    vi.stubGlobal("Image", SelectivelyPendingImage);
    const library = new CharacterSpriteLibrary();

    const idle = library.frameFor(fighter(), 0);
    expect(idle?.source).toBe("remote");
    const pendingJab = library.frameFor(
      fighter({ state: "attack", currentMove: "jab", moveFrame: 1 }),
      0.1,
    );
    expect(pendingJab).toBe(idle);
    expect(pendingJab?.image.src).toContain("/idle.webp");
  });

  privateAssetIt("never displays a resolved frame from a different skin as a fallback", () => {
    vi.stubGlobal("Image", SelectivelyPendingImage);
    const library = new CharacterSpriteLibrary();

    expect(library.frameFor(fighter({ skin: "00" }), 0)?.source).toBe("remote");
    expect(library.frameFor(fighter({ skin: "03" }), 0.1)).toBeNull();
  });

  privateAssetIt("retries a rejected decode instead of wedging the exact atlas", async () => {
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
  });

  privateAssetIt("loads a different native atlas when the selected skin changes", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();

    library.frameFor(fighter({ skin: "00" }), 0);
    library.frameFor(fighter({ skin: "03" }), 0.1);

    expect(loadedSources).toEqual([
      "/assets/characters/ultimate-sheets-native/mario/00/idle.webp?v=clean-animation-4",
      "/assets/characters/ultimate-sheets-native/mario/03/idle.webp?v=clean-animation-4",
    ]);
  });

  it("loads George from the open atlas and preserves its right-facing source basis", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const george = fighter({
      fighter: "george",
      skin: "03",
      name: "George",
      size: { width: 82, height: 105 },
    });

    const frame = library.frameFor(george, 0);

    expect(frame?.image.src).toBe("/assets/characters/open/george/00/idle.webp?v=clean-animation-4");
    expect(frame?.sourceFacing).toBe("right");
  });

  privateAssetIt("renders Nana from her own Ultimate atlas in sync with Popo", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();
    const climbers = fighter({
      fighter: "ice-climbers",
      name: "Ice Climbers",
      size: { width: 68, height: 82 },
    });

    const popo = library.frameFor(climbers, 0.1);
    const nana = library.companionFrameFor(climbers, 0.1);

    expect(popo?.sourceRect).toEqual(nana?.sourceRect);
    expect(loadedSources).toContain(
      "/assets/characters/ultimate-sheets-native/ice-climbers/00/idle.webp?v=clean-animation-4",
    );
    expect(loadedSources).toContain(
      `/assets/characters/ultimate-sheets-native/${ICE_CLIMBERS_COMPANION_ASSET_ID}/00/idle.webp?v=clean-animation-4`,
    );
  });

  privateAssetIt("keeps cached atlases only for the selected fighter and skin combinations", () => {
    vi.stubGlobal("Image", FakeImage);
    const library = new CharacterSpriteLibrary();

    library.frameFor(fighter({ skin: "00" }), 0);
    library.frameFor(fighter({ skin: "01" }), 0.1);
    library.prepareMatch([{ fighter: "mario", skin: "01" }]);
    library.frameFor(fighter({ skin: "01" }), 0.2);
    expect(loadedSources).toHaveLength(2);

    library.frameFor(fighter({ skin: "00" }), 0.3);
    expect(loadedSources).toHaveLength(3);
  });

  privateAssetIt("preloads only the selected fighter once with bounded concurrency and monotone progress", async () => {
    vi.stubGlobal("Image", FakeImage);
    const fetchedSources: string[] = [];
    let activeFetches = 0;
    let peakFetches = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const source = String(input);
      fetchedSources.push(source);
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
      { fighter: "mario", skin: "00" },
      { fighter: "mario", skin: "00" },
    ], {
      concurrency: 4,
      onProgress: (value) => progress.push(value),
    });

    const requested = new Set([...loadedSources, ...fetchedSources]);
    expect(requested.size).toBe(REMOTE_ANIMATION_SLOTS.length);
    expect([...requested].every((source) =>
      source.includes("/ultimate-sheets-native/mario/00/")
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
    [fighter({ state: "grab", grabTarget: 1, grabFrames: 8 }), "grab"],
    [fighter({ state: "grab", grabTarget: 1, grabFrames: 11 }), "grab_hold"],
    [fighter({ state: "grabbed", grabbedBy: 1 }), "grabbed"],
    [fighter({ state: "grab", throwAnimation: "down" }), "down_throw"],
    [fighter({ state: "grab", throwAnimation: "forward" }), "forward_throw"],
    [fighter({ state: "grab", throwAnimation: "back" }), "back_throw"],
    [fighter({ state: "grab", throwAnimation: "up" }), "up_throw"],
    [fighter({ state: "dodge", dodgeKind: "spot" }), "spot_dodge"],
    [fighter({ state: "dodge", dodgeKind: "back" }), "roll_back"],
    [fighter({ state: "dodge", dodgeKind: "forward" }), "roll_forward"],
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
    [fighter({ state: "taunt" }), "taunt"],
    [fighter({ state: "hitstun" }), "hurt"],
    [fighter({ state: "hitstun", statusEffect: "bury" }), "downed"],
    [fighter({ state: "hitstun", velocity: { x: 300, y: 240 } }), "knockback"],
    [fighter({ state: "victory" }), "victory"],
  ] as const)("maps the fighter snapshot to %s", (snapshot, expected) => {
    expect(remoteAnimationSlotForFighter(snapshot)).toBe(expected);
  });
});

describe("exact SSBU animation manifest", () => {
  it("keeps the runtime slots identical to every pipeline fighter manifest", () => {
    const runtimeSlots = [...REMOTE_ANIMATION_SLOTS].sort();
    for (const fighter of Object.values(pipelineManifest)) {
      expect(Object.keys(fighter.clips).sort()).toEqual(runtimeSlots);
    }
  });

  privateAssetIt("declares every clean native atlas and falls back to skin 00 for incomplete variants", () => {
    const allDefinitions = [];
    for (const fighterId of MELEE_FIGHTER_IDS) {
      const skins = REMOTE_ANIMATION_CONFIG.fighters[fighterId];
      expect(Object.keys(skins)).toEqual(["00", "01", "02", "03"]);
      for (const [skinId, animations] of Object.entries(skins)) {
        const entries = Object.entries(animations);
        const definitions = entries.map(([, definition]) => definition);
        expect(definitions).toHaveLength(50);
        expect(new Set(definitions.map(({ mediaUrl }) => mediaUrl)).size).toBe(50);
        expect(definitions.every(({ containsHitboxOverlay }) => !containsHitboxOverlay)).toBe(true);
        expect(definitions.every(({ frameCount }) => frameCount > 1)).toBe(true);
        expect(definitions.every(({ columns }) => columns === 8)).toBe(true);
        for (const [slot, definition] of entries) {
          const selectedAtlas = new URL(
            `../../public/assets/characters/ultimate-sheets-native/${fighterId}/${skinId}/${slot}.webp`,
            import.meta.url,
          );
          const resolvedSkin = existsSync(selectedAtlas) ? skinId : "00";
          expect(definition.mediaUrl).toBe(
            `/assets/characters/ultimate-sheets-native/${fighterId}/${resolvedSkin}/${slot}.webp?v=clean-animation-4`,
          );
          expect(existsSync(new URL(
            `../../public/assets/characters/ultimate-sheets-native/${fighterId}/${resolvedSkin}/${slot}.webp`,
            import.meta.url,
          ))).toBe(true);
        }
        allDefinitions.push(...definitions);
      }
    }
    const expectedAtlasCount = MELEE_FIGHTER_IDS.length * 4 * REMOTE_ANIMATION_SLOTS.length;
    expect(allDefinitions).toHaveLength(expectedAtlasCount);
    expect(new Set(allDefinitions.map(({ mediaUrl }) => mediaUrl)).size).toBeLessThanOrEqual(expectedAtlasCount);
    expect(REMOTE_ANIMATION_CONFIG.fighters.jigglypuff["01"]?.jab.mediaUrl).toContain(
      "/jigglypuff/00/jab.webp",
    );
  });

  it("keeps every open 3D fighter on one CC0 right-facing atlas contract", () => {
    expect(Object.keys(openPipelineManifest.fighters).sort()).toEqual(
      [...OPEN_3D_FIGHTER_IDS].sort(),
    );
    for (const fighter of OPEN_3D_FIGHTER_IDS) {
      const pipelineFighter = openPipelineManifest.fighters[fighter];
      expect(pipelineFighter).toBeDefined();
      const skins = REMOTE_ANIMATION_CONFIG.fighters[fighter];
      expect(Object.keys(skins)).toEqual(["00"]);
      const animations = remoteAnimationSetForFighter(fighter, "03").animations;
      expect(Object.keys(animations)).toHaveLength(REMOTE_ANIMATION_SLOTS.length);
      for (const [slot, definition] of Object.entries(animations)) {
        expect(definition.mediaUrl).toBe(
          `/assets/characters/open/${fighter}/00/${slot}.webp?v=clean-animation-4`,
        );
        expect(definition.sourceFacing).toBe("right");
        expect(definition.containsHitboxOverlay).toBe(false);
      }
      expect(FIGHTER_VISUAL_MANIFESTS[fighter].license.id).toBe(pipelineFighter?.license);
      expect(FIGHTER_VISUAL_MANIFESTS[fighter].sourceKind).toBe("open-3d");
      expect(FIGHTER_VISUAL_MANIFESTS[fighter].sourcePage).toBe(pipelineFighter?.sourcePage);
      expect(FIGHTER_VISUAL_MANIFESTS[fighter].sourceFacing).toBe(pipelineFighter?.sourceFacing);
    }
    expect(isFighterProductionReady("quaternius-hero")).toBe(false);
  });

  it("unlocks Quaternius Ranger as a complete open prototype, not a production fighter", () => {
    const fighter = "quaternius-hero" as const;
    const runtimeSlots = [...REMOTE_ANIMATION_SLOTS].sort();
    const atlasFiles = readdirSync(new URL(
      `../../public/assets/characters/open/${fighter}/00/`,
      import.meta.url,
    )).filter((file) => file.endsWith(".webp")).sort();
    expect(atlasFiles).toEqual(runtimeSlots.map((slot) => `${slot}.webp`).sort());
    expect(existsSync(new URL(
      `../../public/assets/ui/fighters/${fighter}/select/00.png`,
      import.meta.url,
    ))).toBe(true);

    const provenance = JSON.parse(readFileSync(new URL(
      `../../public/assets/characters/open/${fighter}/PROVENANCE.json`,
      import.meta.url,
    ), "utf8")) as {
      sourcePage: string;
      license: string;
      licenseUrl: string;
    };
    expect(FIGHTER_VISUAL_MANIFESTS[fighter]).toMatchObject({
      sourceKind: "open-3d",
      sourcePage: provenance.sourcePage,
      sourceFacing: "right",
      license: { id: provenance.license, url: provenance.licenseUrl },
    });
    expect(remoteAnimationSetForFighter(fighter, "03").animations).toHaveProperty(
      "victory",
    );
    expect(isFighterVisualReady(fighter)).toBe(true);
    expect(isFighterProductionReady(fighter)).toBe(false);
  });

  it("consumes every complete open 2D atlas and its audited provenance", () => {
    expect(Object.keys(open2DAnimationMetadata.fighters)).toEqual(OPEN_2D_FIGHTER_IDS);
    const runtimeSlots = [...REMOTE_ANIMATION_SLOTS].sort();

    for (const fighter of OPEN_2D_FIGHTER_IDS) {
      const metadata = open2DAnimationMetadata.fighters[fighter];
      expect(metadata).toBeDefined();
      expect(Object.keys(metadata ?? {}).sort()).toEqual(runtimeSlots);

      const atlasDirectory = new URL(
        `../../public/assets/characters/open/${fighter}/00/`,
        import.meta.url,
      );
      const atlasFiles = readdirSync(atlasDirectory)
        .filter((file) => file.endsWith(".webp"))
        .sort();
      expect(atlasFiles).toEqual(runtimeSlots.map((slot) => `${slot}.webp`).sort());
      expect(existsSync(new URL(
        `../../public/assets/ui/fighters/${fighter}/select/00.png`,
        import.meta.url,
      ))).toBe(true);
      expect(existsSync(new URL(
        `../../public/assets/characters/open/${fighter}/SHA256SUMS`,
        import.meta.url,
      ))).toBe(true);

      const provenance = JSON.parse(readFileSync(new URL(
        `../../public/assets/characters/open/${fighter}/PROVENANCE.json`,
        import.meta.url,
      ), "utf8")) as {
        displayName: string;
        author: string;
        sourcePage: string;
        license: string;
        licenseUrl: string;
      };
      const manifest = FIGHTER_VISUAL_MANIFESTS[fighter];
      expect(manifest.sourceKind).toBe("open-2d");
      expect(manifest.attribution).toBe(`${provenance.displayName} — ${provenance.author}`);
      expect(manifest.sourcePage).toBe(provenance.sourcePage);
      expect(manifest.license).toEqual({
        id: provenance.license,
        url: provenance.licenseUrl,
      });
      expect(manifest.sourceFacing).toBe("right");
      expect(isFighterVisualReady(fighter)).toBe(true);
      expect(isFighterProductionReady(fighter)).toBe(false);

      const animations = remoteAnimationSetForFighter(fighter, "03").animations;
      for (const slot of REMOTE_ANIMATION_SLOTS) {
        const definition = animations[slot];
        const slotMetadata = metadata?.[slot];
        expect(definition.mediaUrl).toBe(
          `/assets/characters/open/${fighter}/00/${slot}.webp?v=clean-animation-4`,
        );
        expect(definition).toMatchObject({
          frameCount: slotMetadata?.frameCount,
          fps: slotMetadata?.fps,
          columns: slotMetadata?.columns,
          cellSize: slotMetadata?.cellSize,
          sourceFacing: "right",
          containsHitboxOverlay: false,
        });
      }
    }
  });
});
