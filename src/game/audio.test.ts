import { describe, expect, it, vi } from "vitest";
import {
  FIGHTER_AUDIO,
  LOCAL_AUDIO_SAMPLES,
  LOCAL_MUSIC_TRACKS,
  createAudioEngine,
} from "./audio";
import { DEFAULT_STAGE_ID, STAGE_IDS } from "./stages";

class FakeAudio {
  readonly source: string;
  paused = true;
  currentTime = 0;
  volume = 1;
  loop = false;
  preload = "";
  readonly play = vi.fn(async () => {
    this.paused = false;
  });
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  readonly load = vi.fn();
  readonly removeAttribute = vi.fn();
  readonly addEventListener = vi.fn();

  constructor(source: string) {
    this.source = source;
  }
}

const harness = () => {
  const players: FakeAudio[] = [];
  const audio = createAudioEngine({
    masterVolume: 0.5,
    musicVolume: 0.6,
    effectsVolume: 0.8,
    audioFactory: (source) => {
      const player = new FakeAudio(source);
      players.push(player);
      return player as unknown as HTMLAudioElement;
    },
  });
  return { audio, players };
};

describe("local audio engine", () => {
  it.runIf(!__PRIVATE_CONTENT_MODE__)("declares only redistributable tracks in public mode", () => {
    expect(Object.keys(LOCAL_MUSIC_TRACKS)).toEqual(["menu", ...STAGE_IDS]);
    for (const source of Object.values(LOCAL_MUSIC_TRACKS)) {
      expect(source).toMatch(/^\/assets\/audio\/open\/music\/.+\.ogg$/);
      expect(source).not.toMatch(/^https?:/);
    }
    expect(LOCAL_MUSIC_TRACKS.menu).toBe("/assets/audio/open/music/menu-loop.ogg");
    expect(LOCAL_MUSIC_TRACKS[DEFAULT_STAGE_ID]).toBe(
      "/assets/audio/open/music/battle-loop.ogg",
    );
  });

  it.runIf(!__PRIVATE_CONTENT_MODE__)("routes every public sample away from the private overlay", () => {
    for (const source of Object.values(LOCAL_AUDIO_SAMPLES)) {
      expect(source).toMatch(/^\/assets\/audio\/open\//);
    }
    for (const cues of Object.values(FIGHTER_AUDIO)) {
      for (const source of Object.values(cues)) {
        expect(source).toMatch(/^\/assets\/audio\/open\//);
      }
    }
  });

  it.runIf(__PRIVATE_CONTENT_MODE__)("restores local private music for the explicit overlay", () => {
    expect(Object.keys(LOCAL_MUSIC_TRACKS)).toEqual(["menu", ...STAGE_IDS]);
    expect(LOCAL_MUSIC_TRACKS.menu).toBe("/assets/audio/music/menu.m4a");
    for (const source of Object.values(LOCAL_MUSIC_TRACKS)) {
      expect(source).toMatch(/^\/assets\/audio\/music\/.+\.m4a$/);
      expect(source).not.toMatch(/^https?:/);
    }
    const expectedByStage: Readonly<Record<string, string>> = {
      battlefield: "/assets/audio/music/battlefield.m4a",
      "pokemon-stadium": "/assets/audio/music/pokemon-stadium.m4a",
      "hyrule-castle": "/assets/audio/music/hyrule-castle.m4a",
    };
    for (const stage of STAGE_IDS) {
      expect(LOCAL_MUSIC_TRACKS[stage]).toBe(
        expectedByStage[stage] ?? "/assets/audio/music/smash-battlefield.m4a",
      );
    }
  });

  it("reuses one loop across repeated submenu starts and switches by stage", async () => {
    const { audio, players } = harness();
    audio.startMenuMusic();
    audio.startMenuMusic();
    audio.startMenuMusic();
    await Promise.resolve();

    expect(players).toHaveLength(1);
    expect(players[0]?.source).toBe(LOCAL_MUSIC_TRACKS.menu);
    expect(players[0]?.loop).toBe(true);
    expect(players[0]?.play).toHaveBeenCalledTimes(1);
    expect(players[0]?.volume).toBeCloseTo(0.3);

    audio.startCombatMusic(0.4, DEFAULT_STAGE_ID);
    expect(players).toHaveLength(2);
    expect(players[0]?.pause).toHaveBeenCalledTimes(1);
    expect(players[1]?.source).toBe(LOCAL_MUSIC_TRACKS[DEFAULT_STAGE_ID]);
    audio.startCombatMusic(0.8, DEFAULT_STAGE_ID);
    expect(players).toHaveLength(2);

    audio.pauseMusic();
    expect(audio.isMusicPaused).toBe(true);
    audio.resumeMusic();
    await Promise.resolve();
    expect(audio.isMusicPaused).toBe(false);
    expect(players[1]?.play.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("plays local UI, announcer, fighter and item samples", () => {
    const { audio, players } = harness();
    audio.boot();
    audio.menuMove();
    audio.menuMove();
    audio.menuConfirm();
    audio.menuBack();
    audio.ready();
    audio.countdown(3);
    audio.countdown(0);
    audio.fighterCue("george", "jump");
    audio.item("blast-core");
    audio.cue("dodge");
    audio.cue("grab");
    audio.cue("throw");
    audio.cue("projectile");
    audio.cue("item-pickup");
    audio.cue("respawn");
    audio.cue("ledge");
    audio.cue("water-push");
    audio.cue("swing-light");
    audio.cue("swing-heavy");
    audio.cue("special");
    audio.cue("l-cancel");
    audio.cue("wavedash");

    const sources = players.map((player) => player.source);
    expect(sources).toContain(LOCAL_AUDIO_SAMPLES.bootIntro);
    expect(sources.filter((source) => source === LOCAL_AUDIO_SAMPLES.menuMove)).toHaveLength(1);
    expect(sources).toContain(LOCAL_AUDIO_SAMPLES.menuConfirm);
    expect(sources).toContain(LOCAL_AUDIO_SAMPLES.menuBack);
    expect(sources).toContain(LOCAL_AUDIO_SAMPLES.ready);
    expect(sources).toContain(LOCAL_AUDIO_SAMPLES.three);
    expect(sources).toContain(LOCAL_AUDIO_SAMPLES.go);
    expect(sources).toContain(LOCAL_AUDIO_SAMPLES.dodge);
    expect(sources).toContain(LOCAL_AUDIO_SAMPLES.itemBomb);
    expect(sources).toEqual(expect.arrayContaining([
      LOCAL_AUDIO_SAMPLES.dodge,
      LOCAL_AUDIO_SAMPLES.grab,
      LOCAL_AUDIO_SAMPLES.throw,
      LOCAL_AUDIO_SAMPLES.projectile,
      LOCAL_AUDIO_SAMPLES.itemPickup,
      LOCAL_AUDIO_SAMPLES.respawn,
      LOCAL_AUDIO_SAMPLES.ledge,
      LOCAL_AUDIO_SAMPLES.waterPush,
      LOCAL_AUDIO_SAMPLES.dodge,
      LOCAL_AUDIO_SAMPLES.throw,
      LOCAL_AUDIO_SAMPLES.projectile,
    ]));
  });

  it("uses existing neutral samples for open fighters instead of missing private paths", () => {
    const { audio, players } = harness();
    audio.fighterCue("george", "attack");
    audio.fighterCue("wolf", "jump");
    audio.announceFighter("kaykit-knight");

    expect(FIGHTER_AUDIO.george.attack).toBe(LOCAL_AUDIO_SAMPLES.hitLight);
    expect(players.map(({ source }) => source)).toEqual([
      LOCAL_AUDIO_SAMPLES.hitLight,
      LOCAL_AUDIO_SAMPLES.dodge,
      LOCAL_AUDIO_SAMPLES.ready,
    ]);
  });

  it.runIf(__PRIVATE_CONTENT_MODE__)("restores fighter voices and announcer cues for private fighters", () => {
    const { audio, players } = harness();
    audio.fighterCue("mario", "attack");
    audio.fighterCue("link", "jump");
    audio.fighterCue("samus", "victory");
    audio.announceFighter("donkey-kong");

    expect(FIGHTER_AUDIO.mario.attack).toBe(
      "/assets/audio/fighters/mario/attack.wav",
    );
    expect(players.map(({ source }) => source)).toEqual([
      "/assets/audio/fighters/mario/attack.wav",
      "/assets/audio/fighters/link/jump.wav",
      "/assets/audio/fighters/samus/victory.wav",
      "/assets/audio/announcer/donkey-kong.wav",
    ]);
  });

  it("does not report an autoplay unlock before a real track exists", async () => {
    const { audio } = harness();
    await expect(audio.unlock()).resolves.toBe(false);
    audio.startMenuMusic();
    await expect(audio.unlock()).resolves.toBe(true);
  });

  it("captures the first keyboard or pointer gesture before UI propagation stops", () => {
    const { audio } = harness();
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as EventTarget;

    const cleanup = audio.installAutoplayUnlock(target);

    expect(target.addEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(target.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    cleanup();
    expect(target.removeEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(target.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
  });
});
