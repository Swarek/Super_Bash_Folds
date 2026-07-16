import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRIVATE_STAGE_DEFINITIONS, PRIVATE_STAGE_IDS } from "./privateStages";
import {
  DEFAULT_STAGE_ID,
  STAGE_DEFINITIONS,
  STAGE_IDS,
  stageSurfaceYAt,
} from "./stages";

describe.runIf(__PRIVATE_CONTENT_MODE__)("private local stage overlay", () => {
  it("restores the three Nintendo stages before the open catalog", () => {
    expect(STAGE_IDS).toEqual([
      "battlefield",
      "pokemon-stadium",
      "hyrule-castle",
      "verdant-grove",
    ]);
    expect(DEFAULT_STAGE_ID).toBe("battlefield");
    expect(Object.keys(STAGE_DEFINITIONS)).toEqual(STAGE_IDS);
  });

  it.each(PRIVATE_STAGE_IDS)("uses only local public-directory URLs for %s", (id) => {
    const definition = STAGE_DEFINITIONS[id];
    expect(definition).toBe(PRIVATE_STAGE_DEFINITIONS[id]);
    expect(definition.license.id).toBe("private-content");
    expect(definition.previewUrl).toBe(`/assets/stages/${id}/preview.png`);
    expect(definition.thumbnailUrl).toBe(`/assets/stages/${id}/preview.thumb.webp`);
    expect(definition.renderUrl).toBe(`/assets/stages/${id}/arena.webp`);
    expect(definition.backdropUrl).toBe(`/assets/stages/${id}/backdrop.webp`);
    expect(definition.scene?.url).toBe(`/assets/stages/${id}/scene.glb`);
    for (const name of [
      "preview.png",
      "preview.thumb.webp",
      "arena.webp",
      "backdrop.webp",
      "scene.glb",
    ]) {
      expect(existsSync(`public/assets/stages/${id}/${name}`), `${id}/${name}`).toBe(true);
    }
  });

  it("keeps the recovered pixel-calibrated collision surfaces", () => {
    const battlefield = STAGE_DEFINITIONS.battlefield;
    expect(battlefield.platforms.map((platform) =>
      stageSurfaceYAt(platform, platform.x)
    )).toEqual([0, 163.68, 163.68, 329.22]);

    const pokemon = STAGE_DEFINITIONS["pokemon-stadium"];
    expect(pokemon.platforms.map((platform) =>
      stageSurfaceYAt(platform, platform.x)
    )).toEqual([0, 131.04, 131.04]);

    const hyrule = STAGE_DEFINITIONS["hyrule-castle"];
    const expectedHyruleSurfaces = [
      [0, 0],
      [-185.07, 0],
      [-185.07, -185.07],
      [-160.89, -60.45],
      [-60.45, -160.89],
      [158.1, 158.1],
      [311.55, 311.55],
    ] as const;
    hyrule.platforms.forEach((platform, index) => {
      expect(platform.surfaceY?.[0]).toBeCloseTo(expectedHyruleSurfaces[index]![0], 6);
      expect(platform.surfaceY?.[1]).toBeCloseTo(expectedHyruleSurfaces[index]![1], 6);
    });
  });

  it("keeps the recovered native-scene transforms", () => {
    expect(STAGE_DEFINITIONS.battlefield.scene).toMatchObject({
      scale: 1112 / 167.787094,
      offset: { x: 3.74015 * (1112 / 167.787094), y: 0 },
      cameraDirection: 1,
    });
    expect(STAGE_DEFINITIONS["pokemon-stadium"].scene).toMatchObject({
      scale: 1401 / 140.705383,
      offset: { x: 0, y: 0 },
      cameraDirection: -1,
    });
    expect(STAGE_DEFINITIONS["hyrule-castle"].scene).toMatchObject({
      scale: 1670 / 302.636978,
      offset: { x: -2.453499 * (1670 / 302.636978), y: -168 },
      cameraDirection: 1,
    });
  });
});
