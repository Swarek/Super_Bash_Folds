import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  assertPrivateOverlayReady,
  findPrivateAssetsInDirectory,
  isBlockedPublicRuntimeRequestPath,
  isForbiddenPublicRepositoryPath,
  isPrivateDevelopmentRequestPath,
  isPrivatePublicAssetPath,
  purgePrivateAssetsFromDirectory,
} from "./public_asset_boundary.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const fixture = (path: string): string => {
  const root = temporaryRoots[0] ?? mkdtempSync(join(tmpdir(), "super-bash-folds-public-dist-"));
  if (temporaryRoots.length === 0) temporaryRoots.push(root);
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "fixture");
  return root;
};

describe("public asset boundary", () => {
  it("refuses private mode with an actionable incomplete-overlay error", () => {
    expect(() => assertPrivateOverlayReady({
      missingFighters: ["mario"],
      missingFiles: ["public/assets/audio/sfx/ko.wav"],
    })).toThrowError(
      /Nintendo mode refused:[\s\S]*incomplete fighter: mario[\s\S]*missing file: public\/assets\/audio\/sfx\/ko\.wav/,
    );
    expect(() => assertPrivateOverlayReady({})).not.toThrow();
  });

  it("blocks private requests without confusing audited open assets", () => {
    expect(isPrivatePublicAssetPath("/assets/audio/fighters/mario/jump.wav?v=1")).toBe(true);
    expect(isPrivatePublicAssetPath("/assets/stages/battlefield/scene.glb")).toBe(true);
    expect(isPrivatePublicAssetPath("/assets/ui/fighters/pikachu/select/00.png")).toBe(true);
    expect(isPrivatePublicAssetPath(
      "/@fs/workspace/public/assets/audio/sfx/ko.wav",
    )).toBe(true);
    expect(isPrivatePublicAssetPath("/assets/open/../audio/sfx/ko.wav")).toBe(true);
    expect(isPrivatePublicAssetPath("/assets/open/%2e%2e/audio/sfx/ko.wav")).toBe(true);
    expect(isPrivatePublicAssetPath("//assets//audio//sfx//ko.wav")).toBe(true);
    expect(isPrivatePublicAssetPath("/assets/audio/open/sfx/dodge.ogg")).toBe(false);
    expect(isPrivatePublicAssetPath("/assets/open/items/power-orb.svg")).toBe(false);
  });

  it("blocks ignored workspace vaults and every Vite /@fs escape in public mode", () => {
    expect(isPrivateDevelopmentRequestPath("/assets-source/mega-complete/archive.7z")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/ASSETS-SOURCE/MEGA-COMPLETE/ARCHIVE.7Z")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/%61ssets-source/mega-complete/archive.7z")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/validation/browser-match-matrix.json")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/.generated/private/frame.png")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/.tools/bin/tool")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/.env.local")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/.npmrc")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/certificates/local.pem")).toBe(true);
    expect(isPrivateDevelopmentRequestPath("/GOAL_SPEC.md")).toBe(true);
    expect(isPrivateDevelopmentRequestPath(
      "/@fs/" + "/" + "Users/example/Super%20Open%20Bros/assets-source/private.7z",
    )).toBe(true);
    expect(isPrivateDevelopmentRequestPath(
      "/%2540fs/" + "/" + "Users/example/Super%2520Open%2520Bros/.generated/private.png",
    )).toBe(true);
    expect(isPrivateDevelopmentRequestPath(
      "/@fs/" + "/" + "Users/example/elsewhere/public/assets/audio/open/sfx/dodge.ogg",
    )).toBe(true);
    expect(isBlockedPublicRuntimeRequestPath("/public/assets/audio/sfx/ko.wav")).toBe(true);
    expect(isBlockedPublicRuntimeRequestPath("/PUBLIC/ASSETS/AUDIO/SFX/KO.WAV")).toBe(true);
    expect(isBlockedPublicRuntimeRequestPath("/src/main.ts")).toBe(false);
    expect(isBlockedPublicRuntimeRequestPath("/assets/audio/open/sfx/dodge.ogg")).toBe(false);
  });

  it("rejects proprietary extraction tooling from the public repository", () => {
    expect(isForbiddenPublicRepositoryPath("assets-source/mega-complete/archive.7z")).toBe(true);
    expect(isForbiddenPublicRepositoryPath("public/assets/characters/ultimate-sheets/mario/idle.webp")).toBe(true);
    expect(isForbiddenPublicRepositoryPath("scripts/ssbu_pipeline/render_all.sh")).toBe(true);
    expect(isForbiddenPublicRepositoryPath("scripts/generate_local_music.mjs")).toBe(true);
    expect(isForbiddenPublicRepositoryPath("scripts/open_fighter_pipeline/render_all.sh")).toBe(false);
    expect(isForbiddenPublicRepositoryPath("public/assets/characters/open/cactus/00/idle.webp")).toBe(false);
  });

  it("purges only private overlay files from a generated public dist", () => {
    const root = fixture("assets/audio/fighters/mario/jump.wav");
    fixture("assets/ui/cursor/ultimate-pointer.png");
    fixture("assets/ui/fighters/link/select/00.png");
    fixture("assets/audio/open/sfx/dodge.ogg");
    fixture("assets/open/items/power-orb.svg");

    expect(findPrivateAssetsInDirectory(root)).toEqual([
      "assets/audio/fighters/mario/jump.wav",
      "assets/ui/cursor/ultimate-pointer.png",
      "assets/ui/fighters/link/select/00.png",
    ]);
    purgePrivateAssetsFromDirectory(root);
    expect(findPrivateAssetsInDirectory(root)).toEqual([]);
    expect(existsSync(join(root, "assets/audio/open/sfx/dodge.ogg"))).toBe(true);
    expect(existsSync(join(root, "assets/open/items/power-orb.svg"))).toBe(true);
  });
});
