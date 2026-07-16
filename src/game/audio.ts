import {
  FIGHTER_IDS,
  type FighterId,
  type StageId,
} from "./contracts";
import { ITEM_DEFINITIONS, type ItemKind } from "./items";
import { DEFAULT_STAGE_ID, STAGE_IDS } from "./stages";

export type MusicMode = "off" | "menu" | "combat";
export type MusicTrackId = "menu" | StageId;

export type SoundEffect =
  | "hit"
  | "shield"
  | "jump"
  | "ko"
  | "menu"
  | "countdown";

export type FighterAudioCue = "attack" | "jump" | "victory";

export interface AudioVolumes {
  master: number;
  music: number;
  effects: number;
}

export interface AudioEngineOptions {
  masterVolume?: number;
  musicVolume?: number;
  effectsVolume?: number;
  audioFactory?: (source: string) => HTMLAudioElement | null;
}

export interface SoundEffectOptions {
  strength?: number;
  count?: number;
}

export type MenuStreamStatus = "idle" | "loading" | "ready" | "failed";

export const LOCAL_AUDIO_SAMPLES = {
  bootIntro: "/assets/audio/open/sfx/boot.ogg",
  menuMove: "/assets/audio/open/sfx/menu-move.ogg",
  menuConfirm: "/assets/audio/open/sfx/menu-confirm.ogg",
  menuBack: "/assets/audio/open/sfx/menu-back.ogg",
  hitLight: "/assets/audio/open/sfx/hit-light.ogg",
  hitMedium: "/assets/audio/open/sfx/hit-medium.ogg",
  hitHeavy: "/assets/audio/open/sfx/hit-heavy.ogg",
  shield: "/assets/audio/open/sfx/shield.ogg",
  shieldBreak: "/assets/audio/open/sfx/shield-break.ogg",
  ko: "/assets/audio/open/sfx/ko.ogg",
  land: "/assets/audio/open/sfx/land.ogg",
  dodge: "/assets/audio/open/sfx/dodge.ogg",
  grab: "/assets/audio/open/sfx/grab.ogg",
  throw: "/assets/audio/open/sfx/throw.ogg",
  projectile: "/assets/audio/open/sfx/projectile.ogg",
  itemPickup: "/assets/audio/open/sfx/item-pickup.ogg",
  itemSpawn: "/assets/audio/open/sfx/item-spawn.ogg",
  respawn: "/assets/audio/open/sfx/respawn.ogg",
  ledge: "/assets/audio/open/sfx/ledge.ogg",
  waterPush: "/assets/audio/open/sfx/projectile.ogg",
  itemBomb: "/assets/audio/open/sfx/hit-heavy.ogg",
  itemShell: "/assets/audio/open/sfx/throw.ogg",
  itemSlip: "/assets/audio/open/sfx/dodge.ogg",
  itemBumper: "/assets/audio/open/sfx/shield.ogg",
  itemPitfall: "/assets/audio/open/sfx/land.ogg",
  itemRay: "/assets/audio/open/sfx/projectile.ogg",
  itemFire: "/assets/audio/open/sfx/projectile.ogg",
  itemReflect: "/assets/audio/open/sfx/shield.ogg",
  itemPower: "/assets/audio/open/sfx/menu-confirm.ogg",
  ready: "/assets/audio/open/sfx/ready.ogg",
  three: "/assets/audio/open/sfx/countdown.ogg",
  two: "/assets/audio/open/sfx/countdown.ogg",
  one: "/assets/audio/open/sfx/countdown.ogg",
  go: "/assets/audio/open/sfx/menu-confirm.ogg",
  gameSet: "/assets/audio/open/sfx/game-set.ogg",
} as const;

export const LOCAL_MUSIC_TRACKS: Readonly<Record<MusicTrackId, string>> = {
  menu: "/assets/audio/open/music/menu-loop.ogg",
  ...Object.fromEntries(STAGE_IDS.map((stage) => [
    stage,
    "/assets/audio/open/music/battle-loop.ogg",
  ])),
} as Readonly<Record<MusicTrackId, string>>;

export const FIGHTER_AUDIO = Object.fromEntries(
  FIGHTER_IDS.map((fighter) => [fighter, {
    attack: LOCAL_AUDIO_SAMPLES.hitLight,
    jump: LOCAL_AUDIO_SAMPLES.dodge,
    victory: LOCAL_AUDIO_SAMPLES.gameSet,
    announce: LOCAL_AUDIO_SAMPLES.ready,
  }]),
) as Readonly<
  Record<FighterId, Readonly<Record<FighterAudioCue | "announce", string>>>
>;

const ITEM_SAMPLE: Partial<Record<ItemKind, string>> = {
  "power-orb": LOCAL_AUDIO_SAMPLES.itemPower,
  "wind-boots": LOCAL_AUDIO_SAMPLES.itemPower,
  "iron-ward": LOCAL_AUDIO_SAMPLES.itemPower,
  "nova-star": LOCAL_AUDIO_SAMPLES.itemPower,
  "pulse-blaster": LOCAL_AUDIO_SAMPLES.itemRay,
  "flame-sprayer": LOCAL_AUDIO_SAMPLES.itemFire,
  "blast-core": LOCAL_AUDIO_SAMPLES.itemBomb,
  "proximity-mine": LOCAL_AUDIO_SAMPLES.itemBomb,
  "ricochet-disc": LOCAL_AUDIO_SAMPLES.itemShell,
  "slick-gel": LOCAL_AUDIO_SAMPLES.itemSlip,
  "rebound-pad": LOCAL_AUDIO_SAMPLES.itemBumper,
  "snare-trap": LOCAL_AUDIO_SAMPLES.itemPitfall,
  "reflector-charm": LOCAL_AUDIO_SAMPLES.itemReflect,
};

const clamp = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const defaultAudioFactory = (source: string): HTMLAudioElement | null =>
  typeof Audio === "function" ? new Audio(source) : null;

/**
 * Local sample player. One looping music element is reused across submenus, so
 * opening a nested screen can never stack a second copy of the same track.
 */
export class GameAudio {
  private volumes: AudioVolumes;
  private mode: MusicMode = "off";
  private track: MusicTrackId | null = null;
  private musicElement: HTMLAudioElement | null = null;
  private readonly effectPlayers = new Set<HTMLAudioElement>();
  private readonly audioFactory: (source: string) => HTMLAudioElement | null;
  private paused = false;
  private localStatus: MenuStreamStatus = "idle";
  private disposed = false;
  private readonly lastCueAt = new Map<string, number>();

  constructor(options: AudioEngineOptions = {}) {
    this.volumes = {
      master: clamp(options.masterVolume ?? 1),
      music: clamp(options.musicVolume ?? 0.72),
      effects: clamp(options.effectsVolume ?? 0.85),
    };
    this.audioFactory = options.audioFactory ?? defaultAudioFactory;
  }

  get musicMode(): MusicMode {
    return this.mode;
  }

  get isAvailable(): boolean {
    return !this.disposed && (this.audioFactory !== defaultAudioFactory || typeof Audio === "function");
  }

  get isRunning(): boolean {
    return Boolean(this.musicElement && !this.musicElement.paused && !this.paused);
  }

  get isMusicPaused(): boolean {
    return this.paused;
  }

  get menuStreamingStatus(): MenuStreamStatus {
    return this.localStatus;
  }

  get currentTrack(): MusicTrackId | null {
    return this.track;
  }

  getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  setMasterVolume(value: number): void {
    this.volumes.master = clamp(value);
    this.syncVolumes();
  }

  setMusicVolume(value: number): void {
    this.volumes.music = clamp(value);
    this.syncVolumes();
  }

  setEffectsVolume(value: number): void {
    this.volumes.effects = clamp(value);
    this.syncVolumes();
  }

  setVolumes(volumes: Partial<AudioVolumes>): void {
    if (volumes.master !== undefined) this.setMasterVolume(volumes.master);
    if (volumes.music !== undefined) this.setMusicVolume(volumes.music);
    if (volumes.effects !== undefined) this.setEffectsVolume(volumes.effects);
  }

  async resume(): Promise<boolean> {
    if (this.disposed) return false;
    this.paused = false;
    // No media was actually unlocked when a gesture occurred before a track
    // existed. Keep the listeners installed until a real play() succeeds.
    if (!this.musicElement || this.mode === "off") return false;
    try {
      await this.musicElement.play();
      this.localStatus = "ready";
      return true;
    } catch {
      this.localStatus = "failed";
      return false;
    }
  }

  unlock(): Promise<boolean> {
    return this.resume();
  }

  installAutoplayUnlock(target: EventTarget = document): () => void {
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      target.removeEventListener("pointerdown", listener, true);
      target.removeEventListener("keydown", listener, true);
    };
    const listener: EventListener = () => {
      void this.resume().then((running) => {
        if (running) cleanup();
      });
    };
    // Capture before menu/game handlers can stop propagation. This keeps the
    // no-button boot compatible with keyboard-only play when autoplay is
    // denied by Safari or Chromium.
    target.addEventListener("pointerdown", listener, true);
    target.addEventListener("keydown", listener, true);
    return cleanup;
  }

  playMusic(mode: Exclude<MusicMode, "off">, stage: StageId = DEFAULT_STAGE_ID): void {
    this.switchTrack(mode === "menu" ? "menu" : stage, mode);
  }

  startMenuMusic(): void {
    this.playMusic("menu");
  }

  startCombatMusic(_intensity = 0.35, stage: StageId = DEFAULT_STAGE_ID): void {
    this.playMusic("combat", stage);
  }

  setCombatIntensity(_value: number): void {
    // Local mastered tracks keep stable gain; combat intensity is visual only.
  }

  pauseMusic(): void {
    if (this.mode === "off" || this.paused) return;
    this.paused = true;
    this.musicElement?.pause();
  }

  resumeMusic(): void {
    if (this.mode === "off") return;
    void this.resume();
  }

  stopMusic(): void {
    this.mode = "off";
    this.track = null;
    this.paused = false;
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.currentTime = 0;
      this.musicElement.removeAttribute("src");
      this.musicElement.load();
      this.musicElement = null;
    }
    this.localStatus = "idle";
  }

  playSfx(effect: SoundEffect, options: SoundEffectOptions = {}): void {
    const strength = clamp(options.strength ?? 0.65);
    switch (effect) {
      case "hit":
        this.playSample(strength > 0.78 ? LOCAL_AUDIO_SAMPLES.hitHeavy : strength > 0.48 ? LOCAL_AUDIO_SAMPLES.hitMedium : LOCAL_AUDIO_SAMPLES.hitLight, 0.72 + strength * 0.28);
        break;
      case "shield":
        this.playSample(LOCAL_AUDIO_SAMPLES.shield);
        break;
      case "jump":
        this.playSample(LOCAL_AUDIO_SAMPLES.dodge);
        break;
      case "ko":
        this.playSample(LOCAL_AUDIO_SAMPLES.ko);
        break;
      case "menu":
        this.playSample(strength > 0.7 ? LOCAL_AUDIO_SAMPLES.menuConfirm : LOCAL_AUDIO_SAMPLES.menuMove, 1, strength > 0.7 ? "menu-confirm" : "menu-move", 28);
        break;
      case "countdown":
        this.playSample(this.countdownSample(options.count ?? 3), 1, `countdown-${options.count ?? 3}`, 80);
        break;
    }
  }

  hit(strength = 0.65): void { this.playSfx("hit", { strength }); }
  shield(strength = 0.55): void { this.playSfx("shield", { strength }); }
  jump(): void { this.playSfx("jump"); }
  ko(): void { this.playSfx("ko"); }
  menuMove(): void { this.playSfx("menu", { strength: 0.45 }); }
  menuConfirm(): void { this.playSfx("menu", { strength: 0.9 }); }
  menuBack(): void { this.playSample(LOCAL_AUDIO_SAMPLES.menuBack, 1, "menu-back", 35); }
  boot(): void { this.playSample(LOCAL_AUDIO_SAMPLES.bootIntro, 1, "boot-intro", 3_000); }
  ready(): void { this.playSample(LOCAL_AUDIO_SAMPLES.ready, 1, "announcer-ready", 500); }
  countdown(count: number): void { this.playSfx("countdown", { count }); }

  fighterCue(fighter: FighterId, cue: FighterAudioCue): void {
    this.playSample(FIGHTER_AUDIO[fighter][cue], cue === "attack" ? 0.78 : 1, `${fighter}-${cue}`, cue === "attack" ? 90 : 0);
  }

  announceFighter(fighter: FighterId): void {
    this.playSample(FIGHTER_AUDIO[fighter].announce, 1, `announce-${fighter}`, 250);
  }

  item(kind: ItemKind): void {
    this.playSample(ITEM_SAMPLE[kind] ?? LOCAL_AUDIO_SAMPLES.itemPower, 0.9, `item-${kind}`, 55);
  }

  cue(sound: string | undefined): void {
    if (!sound) return;
    if (sound === "land") this.playSample(LOCAL_AUDIO_SAMPLES.land, 0.7, "land", 45);
    else if (sound === "shield-break") this.playSample(LOCAL_AUDIO_SAMPLES.shieldBreak);
    else if (sound === "projectile-reflect") this.playSample(LOCAL_AUDIO_SAMPLES.itemReflect);
    else if (sound === "victory") this.playSample(LOCAL_AUDIO_SAMPLES.gameSet, 1, "game-set", 500);
    else if (sound === "dodge") this.playSample(LOCAL_AUDIO_SAMPLES.dodge, 0.8, "dodge", 70);
    else if (sound === "grab") this.playSample(LOCAL_AUDIO_SAMPLES.grab, 0.82, "grab", 70);
    else if (sound === "throw") this.playSample(LOCAL_AUDIO_SAMPLES.throw, 0.9, "throw", 70);
    else if (sound.startsWith("projectile")) this.playSample(LOCAL_AUDIO_SAMPLES.projectile, 0.78, "projectile", 45);
    else if (sound === "item-pickup") this.playSample(LOCAL_AUDIO_SAMPLES.itemPickup, 0.82, "item-pickup", 80);
    else if (sound === "item-spawn") this.playSample(LOCAL_AUDIO_SAMPLES.itemSpawn, 0.62, "item-spawn", 100);
    else if (sound === "respawn") this.playSample(LOCAL_AUDIO_SAMPLES.respawn, 0.9, "respawn", 200);
    else if (sound === "ledge") this.playSample(LOCAL_AUDIO_SAMPLES.ledge, 0.72, "ledge", 80);
    else if (sound === "water-push") this.playSample(LOCAL_AUDIO_SAMPLES.waterPush, 0.88, "water-push", 70);
    else if (sound === "swing-light") this.playSample(LOCAL_AUDIO_SAMPLES.dodge, 0.42, "swing-light", 34);
    else if (sound === "swing-heavy") this.playSample(LOCAL_AUDIO_SAMPLES.throw, 0.62, "swing-heavy", 52);
    else if (sound === "special") this.playSample(LOCAL_AUDIO_SAMPLES.projectile, 0.58, "special", 45);
    else if (sound === "l-cancel") this.playSample(LOCAL_AUDIO_SAMPLES.shield, 0.42, "l-cancel", 35);
    else if (sound === "wavedash") this.playSample(LOCAL_AUDIO_SAMPLES.dodge, 0.52, "wavedash", 45);
    else if (sound === "clank") this.playSample(LOCAL_AUDIO_SAMPLES.shield, 0.78, "clank", 55);
  }

  stopAll(): void {
    this.stopMusic();
    for (const player of this.effectPlayers) {
      player.pause();
      player.currentTime = 0;
    }
    this.effectPlayers.clear();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.stopAll();
    this.disposed = true;
  }

  private switchTrack(track: MusicTrackId, mode: Exclude<MusicMode, "off">): void {
    if (this.disposed) return;
    if (this.track === track && this.musicElement) {
      this.mode = mode;
      this.paused = false;
      if (this.musicElement.paused) void this.resume();
      return;
    }
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.currentTime = 0;
    }
    const player = this.audioFactory(LOCAL_MUSIC_TRACKS[track]);
    this.track = track;
    this.mode = mode;
    this.paused = false;
    this.musicElement = player;
    if (!player) {
      this.localStatus = "failed";
      return;
    }
    player.loop = true;
    player.preload = "auto";
    player.volume = this.volumes.master * this.volumes.music;
    this.localStatus = "loading";
    void player.play().then(
      () => { if (!this.disposed && this.musicElement === player) this.localStatus = "ready"; },
      () => { if (!this.disposed && this.musicElement === player) this.localStatus = "failed"; },
    );
  }

  private playSample(source: string, gain = 1, dedupeKey = source, minimumGapMs = 0): void {
    if (this.disposed || this.volumes.master <= 0 || this.volumes.effects <= 0) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const previous = this.lastCueAt.get(dedupeKey) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < minimumGapMs) return;
    this.lastCueAt.set(dedupeKey, now);
    const player = this.audioFactory(source);
    if (!player) return;
    player.preload = "auto";
    player.volume = clamp(this.volumes.master * this.volumes.effects * gain);
    this.effectPlayers.add(player);
    const cleanup = (): void => {
      this.effectPlayers.delete(player);
    };
    player.addEventListener("ended", cleanup, { once: true });
    void player.play().catch(cleanup);
  }

  private countdownSample(count: number): string {
    if (count <= 0) return LOCAL_AUDIO_SAMPLES.go;
    if (count === 1) return LOCAL_AUDIO_SAMPLES.one;
    if (count === 2) return LOCAL_AUDIO_SAMPLES.two;
    return LOCAL_AUDIO_SAMPLES.three;
  }

  private syncVolumes(): void {
    if (this.musicElement) this.musicElement.volume = this.volumes.master * this.volumes.music;
    for (const player of this.effectPlayers) player.volume = this.volumes.master * this.volumes.effects;
  }
}

export function createAudioEngine(options: AudioEngineOptions = {}): GameAudio {
  return new GameAudio(options);
}

export const describeItemAudio = (kind: ItemKind): string =>
  `${ITEM_DEFINITIONS[kind].label}: ${ITEM_SAMPLE[kind] ?? LOCAL_AUDIO_SAMPLES.itemPower}`;
