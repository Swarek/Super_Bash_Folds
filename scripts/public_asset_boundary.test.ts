import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  findForbiddenAssetsInDirectory,
  findForbiddenRuntimeMarkers,
  findForbiddenSourceMarkers,
  isBlockedPublicRuntimeRequestPath,
  isForbiddenPublicAssetPath,
  isForbiddenPublicRepositoryPath,
  isSensitiveDevelopmentRequestPath,
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
  it("blocks legacy asset roots without confusing audited open assets", () => {
    expect(isForbiddenPublicAssetPath("/assets/audio/fighters/mario/jump.wav?v=1")).toBe(true);
    expect(isForbiddenPublicAssetPath("/assets/stages/battlefield/scene.glb")).toBe(true);
    expect(isForbiddenPublicAssetPath("/assets/ui/fighters/pikachu/select/00.png")).toBe(true);
    expect(isForbiddenPublicAssetPath("/@fs/workspace/public/assets/audio/sfx/ko.wav")).toBe(true);
    expect(isForbiddenPublicAssetPath("/assets/open/../audio/sfx/ko.wav")).toBe(true);
    expect(isForbiddenPublicAssetPath("/assets/open/%2e%2e/audio/sfx/ko.wav")).toBe(true);
    expect(isForbiddenPublicAssetPath("//assets//audio//sfx//ko.wav")).toBe(true);
    expect(isForbiddenPublicAssetPath("/assets/audio/open/sfx/dodge.ogg")).toBe(false);
    expect(isForbiddenPublicAssetPath("/assets/open/items/power-orb.svg")).toBe(false);
  });

  it("blocks ignored workspace vaults and every Vite /@fs escape", () => {
    expect(isSensitiveDevelopmentRequestPath("/assets-source/archive.7z")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/ASSETS-SOURCE/ARCHIVE.7Z")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/%61ssets-source/archive.7z")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/validation/browser-match-matrix.json")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/.generated/local/frame.png")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/.tools/bin/tool")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/.env.local")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/.npmrc")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/certificates/local.pem")).toBe(true);
    expect(isSensitiveDevelopmentRequestPath("/GOAL_SPEC.md")).toBe(true);
    const home = "/" + "Users/example";
    expect(isSensitiveDevelopmentRequestPath(`/@fs/${home}/project/assets-source/archive.7z`)).toBe(true);
    expect(isSensitiveDevelopmentRequestPath(`/%2540fs/${home}/project/.generated/frame.png`)).toBe(true);
    expect(isSensitiveDevelopmentRequestPath(`/@fs/${home}/elsewhere/public/assets/audio/open/sfx/dodge.ogg`)).toBe(true);
    expect(isBlockedPublicRuntimeRequestPath("/public/assets/audio/sfx/ko.wav")).toBe(true);
    expect(isBlockedPublicRuntimeRequestPath("/PUBLIC/ASSETS/AUDIO/SFX/KO.WAV")).toBe(true);
    expect(isBlockedPublicRuntimeRequestPath("/src/main.ts")).toBe(false);
    expect(isBlockedPublicRuntimeRequestPath("/assets/audio/open/sfx/dodge.ogg")).toBe(false);
  });

  it("rejects local extraction tooling from the public repository", () => {
    expect(isForbiddenPublicRepositoryPath("assets-source/archive.7z")).toBe(true);
    expect(isForbiddenPublicRepositoryPath("public/assets/characters/ultimate-sheets/mario/idle.webp")).toBe(true);
    expect(isForbiddenPublicRepositoryPath("scripts/ssbu_pipeline/render_all.sh")).toBe(true);
    expect(isForbiddenPublicRepositoryPath("scripts/generate_local_music.mjs")).toBe(true);
    expect(isForbiddenPublicRepositoryPath("scripts/open_fighter_pipeline/render_all.sh")).toBe(false);
    expect(isForbiddenPublicRepositoryPath("public/assets/audio/open")).toBe(false);
    expect(isForbiddenPublicRepositoryPath("public/assets/characters/open")).toBe(false);
    expect(isForbiddenPublicRepositoryPath("public/assets/characters/open/cactus/00/idle.webp")).toBe(false);
  });

  it("detects proprietary markers while allowing controller interoperability", () => {
    expect(findForbiddenSourceMarkers("src/game/example.ts", "const id = 'mario';")).toContain("legacy fighter identifier");
    expect(findForbiddenSourceMarkers("src/game/example.ts", "const fighter = 'link';")).toContain("legacy fighter identifier");
    expect(findForbiddenRuntimeMarkers("document.createElement('link')")).toEqual([]);
    expect(findForbiddenSourceMarkers("src/styles.css", ".cc-portrait--pikachu {}")).toContain("legacy fighter-specific styling");
    expect(findForbiddenSourceMarkers("src/game/example.ts", "const root = '/assets/effects/ultimate/common';")).toContain("proprietary asset root");
    expect(findForbiddenSourceMarkers("src/game/example.ts", "Nintendo content — local only")).toContain("Nintendo content marker");
    expect(findForbiddenSourceMarkers("src/game/gamepad.ts", "return /nintendo|switch/i.test(id)")).toEqual([]);
    expect(findForbiddenRuntimeMarkers("Local SSBU files supplied by the user")).toContain("SSBU extraction marker");
    expect(findForbiddenRuntimeMarkers("Super Open Bros")).toContain("former project identity");
    expect(findForbiddenRuntimeMarkers("super-open-bros.settings.v1")).toContain("former project identity");
    expect(findForbiddenRuntimeMarkers("cousins-clash.gamepads.v1")).toContain("former project identity");
    expect(findForbiddenRuntimeMarkers("libreledge.settings.v1")).toContain("former project identity");
    expect(findForbiddenRuntimeMarkers("Nintendo Switch Pro Controller")).toEqual([]);
  });

  it("finds only forbidden legacy files in a generated public dist", () => {
    const root = fixture("assets/audio/fighters/mario/jump.wav");
    fixture("assets/ui/cursor/ultimate-pointer.png");
    fixture("assets/ui/fighters/link/select/00.png");
    fixture("assets/audio/open/sfx/dodge.ogg");
    fixture("assets/open/items/power-orb.svg");

    expect(findForbiddenAssetsInDirectory(root)).toEqual([
      "assets/audio/fighters/mario/jump.wav",
      "assets/ui/cursor/ultimate-pointer.png",
      "assets/ui/fighters/link/select/00.png",
    ]);
  });
});
