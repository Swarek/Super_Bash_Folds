import { CpuController } from "./game/ai";
import { createAudioEngine } from "./game/audio";
import type { MatchConfig, PlayerSlot } from "./game/contracts";
import { FIXED_DT, createEmptyInput, createGame, type CombatGame, type GameEvent, type GameSnapshot } from "./game/engine";
import { createGamepadManager, mergeInputFrames } from "./game/gamepad";
import { createInputManager } from "./game/input";
import type { GameRenderer } from "./game/render";
import { FIGHTER_IDS } from "./game/roster";
import { SettingsStore } from "./game/settings";
import { DEFAULT_STAGE_ID, STAGE_IDS } from "./game/stages";
import { GamepadMenuNavigation } from "./ui/gamepadNavigation";
import { CharacterSelectCursors } from "./ui/characterSelectCursors";
import {
  UIController,
  type MatchLaunchContext,
  type UIScreen,
} from "./ui/ui";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Unable to find the #app mount point.");

const gameLayer = document.createElement("div");
gameLayer.className = "cc-game-layer";
gameLayer.setAttribute("aria-hidden", "true");
const stageBackdrop = document.createElement("img");
stageBackdrop.className = "cc-stage-backdrop";
stageBackdrop.alt = "";
stageBackdrop.decoding = "async";
stageBackdrop.draggable = false;
const stageCanvas = document.createElement("canvas");
stageCanvas.className = "cc-stage-canvas";
const canvas = document.createElement("canvas");
canvas.className = "cc-game-canvas";
canvas.tabIndex = 0;
gameLayer.append(stageBackdrop, stageCanvas, canvas);
root.append(gameLayer);

const settingsStore = new SettingsStore();
let settings = settingsStore.get();
const input = createInputManager(settings.bindings, window);
const gamepads = createGamepadManager();
const audio = createAudioEngine({
  musicVolume: settings.musicVolume,
  effectsVolume: settings.effectsVolume,
});
const removeAudioUnlock = audio.installAutoplayUnlock(document);
let renderer: GameRenderer | null = null;
let rendererLoad: Promise<GameRenderer> | null = null;

const ensureRenderer = async (): Promise<GameRenderer> => {
  if (renderer) return renderer;
  if (!rendererLoad) {
    rendererLoad = import("./game/render")
      .then(({ GameRenderer: Renderer }) => {
        if (destroyed) throw new DOMException("Application destroyed", "AbortError");
        renderer = new Renderer(canvas, { stageCanvas, stageBackdrop });
        return renderer;
      })
      .catch((error: unknown) => {
        rendererLoad = null;
        throw error;
      });
  }
  return rendererLoad;
};

let game: CombatGame | null = null;
let currentConfig: MatchConfig | null = null;
let cpuControllers: [CpuController | null, CpuController | null] = [null, null];
let paused = false;
let accumulator = 0;
let previousTimestamp = performance.now();
let lastHudUpdate = 0;
let lastCountdown = -1;
let resultTimer: number | null = null;
let destroyed = false;
let performanceWarmupFrames = 0;
let performancePreviousTimestamp: number | null = null;
let performanceFrameTimes: number[] = [];
let performancePeakItems = 0;
let performancePeakProjectiles = 0;

const PERFORMANCE_WARMUP_FRAMES = 180;
const PERFORMANCE_SAMPLE_FRAMES = 600;

const resetPerformanceSample = (): void => {
  performanceWarmupFrames = 0;
  performancePreviousTimestamp = null;
  performanceFrameTimes = [];
  performancePeakItems = 0;
  performancePeakProjectiles = 0;
  for (const key of [
    "perfSamples",
    "perfMedianMs",
    "perfP95Ms",
    "perfMedianFps",
    "perfPeakItems",
    "perfPeakProjectiles",
  ]) delete gameLayer.dataset[key];
};

const recordPerformanceSample = (timestamp: number, snapshot: GameSnapshot): void => {
  if (paused || snapshot.phase !== "playing" || performanceFrameTimes.length >= PERFORMANCE_SAMPLE_FRAMES) {
    performancePreviousTimestamp = null;
    return;
  }
  performancePeakItems = Math.max(performancePeakItems, snapshot.items.length);
  performancePeakProjectiles = Math.max(performancePeakProjectiles, snapshot.projectiles.length);
  if (performanceWarmupFrames < PERFORMANCE_WARMUP_FRAMES) {
    performanceWarmupFrames += 1;
    performancePreviousTimestamp = timestamp;
    return;
  }
  if (performancePreviousTimestamp !== null) {
    performanceFrameTimes.push(timestamp - performancePreviousTimestamp);
  }
  performancePreviousTimestamp = timestamp;
  if (performanceFrameTimes.length !== PERFORMANCE_SAMPLE_FRAMES) return;
  const sorted = [...performanceFrameTimes].sort((a, b) => a - b);
  const percentile = (value: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * value))] ?? 0;
  const median = percentile(0.5);
  const p95 = percentile(0.95);
  gameLayer.dataset.perfSamples = String(sorted.length);
  gameLayer.dataset.perfMedianMs = median.toFixed(3);
  gameLayer.dataset.perfP95Ms = p95.toFixed(3);
  gameLayer.dataset.perfMedianFps = (1000 / Math.max(0.001, median)).toFixed(2);
  gameLayer.dataset.perfPeakItems = String(performancePeakItems);
  gameLayer.dataset.perfPeakProjectiles = String(performancePeakProjectiles);
};

const cancelResultTimer = (): void => {
  if (resultTimer !== null) window.clearTimeout(resultTimer);
  resultTimer = null;
};

const configureAudio = (): void => {
  audio.setMusicVolume(settings.musicVolume);
  audio.setEffectsVolume(settings.effectsVolume);
};

const ensureMenuMusic = (): void => {
  if (audio.musicMode !== "menu") audio.startMenuMusic();
};

const stopMatch = (): void => {
  cancelResultTimer();
  game = null;
  currentConfig = null;
  cpuControllers = [null, null];
  paused = false;
  accumulator = 0;
  input.clear();
  gamepads.clear();
  input.setEnabled(false);
  gameLayer.classList.remove("is-active");
  delete gameLayer.dataset.stage;
  delete gameLayer.dataset.items;
  delete gameLayer.dataset.fighters;
};

const buildCpuControllers = (config: MatchConfig): [CpuController | null, CpuController | null] =>
  config.players.map((player) =>
    player.cpu ? new CpuController(player.slot, player.cpuLevel, Date.now() + player.slot * 7919) : null,
  ) as [CpuController | null, CpuController | null];

const activateMatch = (config: MatchConfig, activeRenderer: GameRenderer): void => {
  cancelResultTimer();
  currentConfig = config;
  game = createGame(config, { seed: Date.now() >>> 0 });
  cpuControllers = buildCpuControllers(config);
  paused = false;
  accumulator = 0;
  lastCountdown = -1;
  previousTimestamp = performance.now();
  resetPerformanceSample();
  input.clear();
  gamepads.clear();
  input.setBindings(settings.bindings);
  input.setEnabled(true);
  gameLayer.classList.add("is-active");
  gameLayer.dataset.stage = config.stage;
  gameLayer.dataset.items = String(config.items);
  gameLayer.dataset.fighters = config.players.map(({ fighter }) => fighter).join(",");
  activeRenderer.beginMatch(
    config.players.map(({ fighter, skin }) => ({ fighter, skin })),
    config.stage,
    config.items,
  );
  audio.startCombatMusic(0.25, config.stage);
  audio.ready();
};

const startMatch = async (
  config: MatchConfig,
  context: MatchLaunchContext,
): Promise<void> => {
  stopMatch();
  context.reportProgress({ completed: 0, total: 1, phase: "renderer" });
  const activeRenderer = await ensureRenderer();
  if (context.signal.aborted) {
    throw context.signal.reason ?? new DOMException("Aborted", "AbortError");
  }
  context.reportProgress({ completed: 1, total: 1, phase: "renderer" });
  await activeRenderer.preloadMatch(
    config.players.map(({ fighter, skin }) => ({ fighter, skin })),
    config.stage,
    {
      items: config.items,
      signal: context.signal,
      onProgress: context.reportProgress,
    },
  );
  if (context.signal.aborted) {
    throw context.signal.reason ?? new DOMException("Aborted", "AbortError");
  }
  activateMatch(config, activeRenderer);
};

const restartMatch = (): void => {
  if (currentConfig && renderer) activateMatch(currentConfig, renderer);
};

const setPaused = (nextPaused: boolean): void => {
  if (!game || game.getSnapshot().phase === "finished") return;
  paused = nextPaused;
  input.clear();
  gamepads.clear();
  input.setEnabled(!paused);
  if (paused) ui.showPause();
  else ui.hidePause(false);
};

const handleScreenChange = (screen: UIScreen): void => {
  if (screen === "gameplay") {
    if (game && !paused) input.setEnabled(true);
    return;
  }
  input.setEnabled(false);
  if (screen === "title" || screen === "home" || screen === "character-select" || screen === "stage-select" || screen === "settings" || screen === "how-to-play" || screen === "controls" || screen === "lab") {
    ensureMenuMusic();
  }
};

const ui = new UIController(
  root,
  {
    onBootStart: () => {
      // Start the requested SSBU menu track with the automatic boot. Browsers
      // that reject unprompted sound are retried on the first captured input.
      audio.startMenuMusic();
    },
    onStartMatch: startMatch,
    onSettingsChange: (nextSettings) => {
      settings = settingsStore.replace(nextSettings);
      input.setBindings(settings.bindings);
      configureAudio();
    },
    onBindingsChange: (bindings) => input.setBindings(bindings),
    onResume: () => setPaused(false),
    onRestart: restartMatch,
    onQuitToMenu: stopMatch,
    onReturnToCharacterSelect: stopMatch,
    onScreenChange: handleScreenChange,
    onFighterSelected: (fighter) => audio.announceFighter(fighter),
    onControllerDisconnected: (slot, name) => {
      if (!game || cpuControllers[slot] || game.getSnapshot().phase === "finished") return;
      if (!paused) setPaused(true);
      ui.showControllerReconnect(slot, name);
    },
    onControllerReconnectResolved: () => {
      gamepads.clear();
      setPaused(false);
    },
    onUiSound: (cue) => {
      if (cue === "focus") audio.menuMove();
      else if (cue === "back") audio.menuBack();
      else audio.menuConfirm();
    },
  },
  { settings, gamepads },
);

const menuNavigation = new GamepadMenuNavigation(root, {
  onBack: () => ui.navigateBack(),
  onPause: () => {
    if (game) setPaused(!paused);
  },
  onFocus: () => audio.menuMove(),
});

const characterSelectCursors = new CharacterSelectCursors(root, {
  selectedFighter: (slot) => ui.getMatchConfig().players[slot].fighter,
  activate: (slot, target, point) => ui.activateCursorTarget(slot, target, point),
  onBack: () => ui.navigateBack(),
  onMove: () => audio.menuMove(),
});

const localMatchParams = new URLSearchParams(window.location.search);
const localMatchFighters = localMatchParams.get("match")?.split(",");
if (
  localMatchFighters?.length === 2 &&
  FIGHTER_IDS.some((fighter) => fighter === localMatchFighters[0]) &&
  FIGHTER_IDS.some((fighter) => fighter === localMatchFighters[1])
) {
  const firstFighter = localMatchFighters[0] as MatchConfig["players"][number]["fighter"];
  const secondFighter = localMatchFighters[1] as MatchConfig["players"][number]["fighter"];
  const requestedStage = localMatchParams.get("stage");
  const stage = STAGE_IDS.some((candidate) => candidate === requestedStage)
    ? requestedStage as MatchConfig["stage"]
    : DEFAULT_STAGE_ID;
  const frequency = localMatchParams.get("frequency");
  const itemFrequency = frequency === "low" || frequency === "high" ? frequency : "medium";
  const localConfig: MatchConfig = {
    players: [
      { fighter: firstFighter, skin: "00", name: "Test P1", slot: 0, cpu: false, cpuLevel: 1 },
      { fighter: secondFighter, skin: "00", name: "Test P2", slot: 1, cpu: false, cpuLevel: 1 },
    ],
    stocks: 3,
    items: localMatchParams.get("items") !== "0",
    itemFrequency,
    stage,
  };
  const controller = new AbortController();
  void startMatch(localConfig, {
    signal: controller.signal,
    reportProgress: () => undefined,
  }).then(() => {
    ui.showHud({
      players: [
        { fighter: firstFighter, skin: "00", name: "Test P1", stocks: 3, damage: 0 },
        { fighter: secondFighter, skin: "00", name: "Test P2", stocks: 3, damage: 0 },
      ],
    });
    if (localMatchParams.get("pause") === "1") setPaused(true);
  }).catch((error: unknown) => console.error("Unable to start the local match", error));
}

const eventStrength = (event: GameEvent): number => {
  if (event.type !== "hit") return 0.6;
  return Math.min(1, 0.28 + (event.value ?? 8) / 20);
};

const playEvents = (events: readonly GameEvent[], snapshot: GameSnapshot): void => {
  for (const event of events) {
    const fighter = event.slot === undefined ? undefined : snapshot.fighters[event.slot]?.fighter;
    switch (event.type) {
      case "attack":
        if (fighter) audio.fighterCue(fighter, "attack");
        audio.cue(event.sound);
        break;
      case "hit":
        if (event.sound === "water-push") audio.cue(event.sound);
        else audio.hit(eventStrength(event));
        break;
      case "shield-hit":
        if (event.sound === "franklin-reflect") audio.cue(event.sound);
        else audio.shield(0.6);
        break;
      case "clank":
        audio.cue("clank");
        break;
      case "shield-break":
        audio.cue("shield-break");
        break;
      case "jump":
        if (fighter) audio.fighterCue(fighter, "jump");
        else audio.jump();
        break;
      case "land":
        audio.cue(event.sound ?? "land");
        break;
      case "ko":
        audio.ko();
        break;
      case "match-start":
        audio.countdown(0);
        break;
      case "item-use":
        if (event.item) audio.item(event.item);
        break;
      case "dodge":
      case "ledge":
      case "grab":
      case "throw":
      case "projectile":
      case "item-spawn":
      case "item-pickup":
      case "respawn":
        audio.cue(event.sound);
        break;
      case "taunt":
        if (fighter) audio.fighterCue(fighter, "attack");
        break;
      case "match-end":
        audio.cue("victory");
        if (fighter) audio.fighterCue(fighter, "victory");
        break;
      default:
        break;
    }
  }
};

const updateCountdownAudio = (snapshot: GameSnapshot): void => {
  if (snapshot.phase !== "countdown") return;
  const countdown = Math.max(1, Math.ceil(snapshot.countdownFrames / 60));
  if (countdown > 3) return;
  if (countdown !== lastCountdown) {
    lastCountdown = countdown;
    audio.countdown(countdown);
  }
};

const updateHud = (snapshot: GameSnapshot, timestamp: number): void => {
  if (timestamp - lastHudUpdate < 60) return;
  lastHudUpdate = timestamp;
  ui.updateHud({
    players: snapshot.fighters.map((fighter) => ({
      fighter: fighter.fighter,
      skin: fighter.skin,
      name: fighter.name,
      stocks: fighter.stocks,
      damage: fighter.percent,
    })) as [
      { fighter: (typeof snapshot.fighters)[0]["fighter"]; skin: (typeof snapshot.fighters)[0]["skin"]; name: string; stocks: number; damage: number },
      { fighter: (typeof snapshot.fighters)[1]["fighter"]; skin: (typeof snapshot.fighters)[1]["skin"]; name: string; stocks: number; damage: number },
    ],
    announcement: snapshot.phase === "countdown"
      ? "READY?"
      : snapshot.suddenDeath ? "SUDDEN DEATH" : undefined,
    remainingTimeMs: snapshot.remainingTimeMs,
    suddenDeath: snapshot.suddenDeath,
  });
};

const makeInputs = (snapshot: GameSnapshot, firstStep: boolean) => {
  const keyboardFrames = firstStep
    ? input.consumeFrames()
    : ([input.peekFrame(0), input.peekFrame(1)].map((frame) => ({
        ...frame,
        pressed: new Set(),
        released: new Set(),
      })) as ReturnType<typeof input.consumeFrames>);

  const gamepadFrames = firstStep
    ? gamepads.consumeFrames()
    : ([gamepads.peekFrame(0), gamepads.peekFrame(1)].map((frame) => ({
        ...frame,
        pressed: new Set(),
        released: new Set(),
      })) as ReturnType<typeof gamepads.consumeFrames>);

  return keyboardFrames.map((frame, slot) => {
    const controller = cpuControllers[slot as PlayerSlot];
    return controller
      ? controller.next(snapshot)
      : mergeInputFrames(frame, gamepadFrames[slot as PlayerSlot]);
  }) as ReturnType<typeof input.consumeFrames>;
};

const finishMatch = (snapshot: GameSnapshot): void => {
  if (!snapshot.result || ui.screen === "results" || resultTimer !== null) return;
  const result = snapshot.result;
  input.setEnabled(false);
  audio.setCombatIntensity(1);
  resultTimer = window.setTimeout(() => {
    resultTimer = null;
    try {
      ui.showResults(result);
      gameLayer.classList.remove("is-active");
      ensureMenuMusic();
    } catch (error) {
      console.error("Could not display the results screen", error);
    }
  }, 1050);
};

const tick = (timestamp: number): void => {
  if (destroyed) return;
  const elapsed = Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1000));
  previousTimestamp = timestamp;
  gamepads.poll();
  const gamepadSnapshot = gamepads.getSnapshot();
  const cursorMenuActive = ui.screen !== "gameplay" || paused;
  const hasAssignedCursor = gamepadSnapshot.sources.some((source) =>
    source.type === "gamepad" &&
    gamepadSnapshot.devices.some((device) =>
      device.connected && device.index === source.index
    )
  );
  if (cursorMenuActive && hasAssignedCursor) {
    menuNavigation.suspend(gamepads.menuSnapshots());
    characterSelectCursors.update(gamepadSnapshot, timestamp);
  } else {
    characterSelectCursors.reset();
    menuNavigation.update(gamepads.menuSnapshots(), timestamp);
  }

  if (game) {
    const frameEvents: GameEvent[] = [];
    if (!paused && input.consumePausePress()) setPaused(true);
    let snapshot = game.getSnapshot();

    if (!paused) {
      accumulator = Math.min(accumulator + elapsed, FIXED_DT * 6);
      let firstStep = true;
      while (accumulator >= FIXED_DT && snapshot.phase !== "finished") {
        snapshot = game.step(makeInputs(snapshot, firstStep));
        frameEvents.push(...snapshot.events);
        playEvents(snapshot.events, snapshot);
        updateCountdownAudio(snapshot);
        firstStep = false;
        accumulator -= FIXED_DT;
      }
    }

    const highestDamage = Math.max(snapshot.fighters[0].percent, snapshot.fighters[1].percent);
    const stockDanger = snapshot.fighters.some((fighter) => fighter.stocks === 1) ? 0.32 : 0;
    audio.setCombatIntensity(Math.min(1, 0.2 + highestDamage / 210 + stockDanger));
    // A slow display frame can advance several fixed simulation ticks. Audio
    // consumes each tick immediately; the renderer needs the same accumulated
    // stream or short-lived hits, jumps and dust cues disappear visually.
    renderer?.render({ ...snapshot, events: frameEvents }, paused ? 0 : elapsed, settings);
    recordPerformanceSample(timestamp, snapshot);
    updateHud(snapshot, timestamp);
    if (snapshot.phase === "finished") finishMatch(snapshot);
  }

  requestAnimationFrame(tick);
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game && !paused && game.getSnapshot().phase !== "finished") {
    setPaused(true);
  }
});

const cleanupApp = (): void => {
  if (destroyed) return;
  destroyed = true;
  cancelResultTimer();
  removeAudioUnlock();
  input.destroy();
  characterSelectCursors.destroy();
  menuNavigation.destroy();
  gamepads.destroy();
  renderer?.destroy();
  ui.destroy();
  void audio.dispose();
};

window.addEventListener("beforeunload", cleanupApp);
if (import.meta.hot) import.meta.hot.dispose(cleanupApp);

input.setEnabled(false);
requestAnimationFrame(tick);

// Exposed only for focused browser smoke tests and local debugging.
Object.defineProperty(window, "__SUPER_OPEN_BROS__", {
  value: {
    getSnapshot: () => game?.getSnapshot() ?? null,
    startMatch: (config?: MatchConfig) => {
      const controller = new AbortController();
      return startMatch(config ?? ui.getMatchConfig(), {
        signal: controller.signal,
        reportProgress: () => undefined,
      });
    },
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    getGamepads: () => gamepads.getSnapshot(),
    emptyInput: createEmptyInput,
  },
  configurable: true,
});
