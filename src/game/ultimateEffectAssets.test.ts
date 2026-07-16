import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { MELEE_FIGHTER_IDS, OPEN_FIGHTER_IDS } from "./contracts";
import { resolveAttackEffectProfile } from "./effects";
import { getFighterDefinition, type MoveName } from "./roster";
import {
  removeOpaqueEffectMatte,
  UltimateEffectSpriteLibrary,
  selectOfficialFighterEffectTexture,
} from "./ultimateEffectAssets";

const marioManifest = {
  fighter: "mario" as const,
  ultimateSource: "mario",
  embeddedTextures: [
    "/assets/effects/ultimate/fighters/mario/embedded/ef_mario_impact00.png",
    "/assets/effects/ultimate/fighters/mario/embedded/ef_mario_fire00.png",
    "/assets/effects/ultimate/fighters/mario/embedded/ef_mario_water00.png",
  ],
  textures: [],
};

const privateAssetIt = it.runIf(!__PUBLIC_CONTENT_ONLY__);

describe("official Ultimate effect texture routing", () => {
  it("removes an opaque black matte and replaces its green channel with the move tint", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 255, 0, 255,
      128, 0, 0, 255,
    ]);

    expect(removeOpaqueEffectMatte(pixels, [216, 239, 255])).toBe(true);
    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...pixels.slice(8, 12)]).toEqual([216, 239, 255, 255]);
    expect([...pixels.slice(12, 16)]).toEqual([216, 239, 255, 128]);
  });

  it("does not modify a texture that already has real transparency", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 0,
      255, 255, 255, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const original = [...pixels];

    expect(removeOpaqueEffectMatte(pixels, [216, 239, 255])).toBe(false);
    expect([...pixels]).toEqual(original);
  });

  it("also neutralizes the green channel of an untinted common mask", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 180, 0, 255,
      0, 255, 0, 255,
    ]);

    expect(removeOpaqueEffectMatte(pixels)).toBe(true);
    expect([...pixels.slice(8, 12)]).toEqual([255, 255, 255, 180]);
    expect([...pixels.slice(12, 16)]).toEqual([255, 255, 255, 255]);
  });

  it("uses the fighter move hint before the generic material", () => {
    expect(selectOfficialFighterEffectTexture(marioManifest, "neutral-special", "fire"))
      .toContain("ef_mario_fire00.png");
    expect(selectOfficialFighterEffectTexture(marioManifest, "down-special", "water"))
      .toContain("ef_mario_water00.png");
  });

  it("falls back only to an official common Ultimate texture", () => {
    expect(selectOfficialFighterEffectTexture(undefined, "jab", "physical"))
      .toBe("/assets/effects/ultimate/common/ef_cmn_impact08.png");
  });

  privateAssetIt("resolves every move for all 26 fighters to a published official texture", () => {
    const manifests = JSON.parse(readFileSync(
      new URL("../../public/assets/effects/ultimate/fighters.json", import.meta.url),
      "utf8",
    )) as Array<{
      fighter: (typeof MELEE_FIGHTER_IDS)[number];
      ultimateSource: string;
      embeddedTextures: string[];
      textures: string[];
    }>;
    const byFighter = new Map(manifests.map((manifest) => [manifest.fighter, manifest]));
    let resolvedMoves = 0;
    for (const fighter of MELEE_FIGHTER_IDS) {
      const manifest = byFighter.get(fighter);
      expect(manifest, fighter).toBeDefined();
      const moves = Object.keys(getFighterDefinition(fighter).attacks) as MoveName[];
      for (const move of moves) {
        const texture = selectOfficialFighterEffectTexture(
          manifest,
          move,
          resolveAttackEffectProfile(fighter, move).material,
        );
        expect(texture, `${fighter}/${move}`).toMatch(/^\/assets\/effects\/ultimate\//);
        expect(
          existsSync(new URL(`../../public${texture}`, import.meta.url)),
          `${fighter}/${move}: ${texture}`,
        ).toBe(true);
        resolvedMoves += 1;
      }
    }
    expect(resolvedMoves).toBe(26 * 17);
  });

  it("never routes open fighter attacks through private Ultimate textures", () => {
    const library = new UltimateEffectSpriteLibrary();
    for (const fighter of OPEN_FIGHTER_IDS) {
      expect(library.drawAttack(
        {} as CanvasRenderingContext2D,
        fighter,
        "jab",
        "physical",
        { x: 0, y: 0, width: 10 },
      )).toBe(false);
    }
  });

  it.runIf(__PUBLIC_CONTENT_ONLY__)("never requests private Ultimate sprites in public mode", () => {
    const requestedUrls: string[] = [];
    const previousImage = globalThis.Image;
    class ImageProbe {
      decoding = "";
      onload: (() => void) | null = null;

      set src(value: string) {
        requestedUrls.push(value);
      }
    }
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: ImageProbe,
    });
    try {
      const library = new UltimateEffectSpriteLibrary();
      expect(library.drawParticle(
        {} as CanvasRenderingContext2D,
        "spark",
        { x: 0, y: 0, width: 10 },
      )).toBe(false);
      expect(library.drawTransient(
        {} as CanvasRenderingContext2D,
        "ring",
        "light",
        { x: 0, y: 0, width: 10 },
      )).toBe(false);
      expect(requestedUrls).toEqual([]);
    } finally {
      if (previousImage === undefined) {
        Reflect.deleteProperty(globalThis, "Image");
      } else {
        Object.defineProperty(globalThis, "Image", {
          configurable: true,
          value: previousImage,
        });
      }
    }
  });
});
