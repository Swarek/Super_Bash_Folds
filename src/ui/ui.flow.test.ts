// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFighterVisualReady } from "../game/characterAssets";
import { OPEN_FIGHTER_IDS } from "../game/contracts";
import { FIGHTER_IDS, getFighterDefinition } from "../game/roster";
import { DEFAULT_STAGE_ID, getStageDefinition } from "../game/stages";
import { UIController, type MatchLaunchContext } from "./ui";

const OPEN_P1 = OPEN_FIGHTER_IDS[0];
const OPEN_P2 = OPEN_FIGHTER_IDS[1];

const click = (root: HTMLElement, selector: string): void => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing UI control: ${selector}`);
  element.click();
};

describe("complete local UI flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("covers boot, every menu, two ready players, stage, pause, results and rematch", async () => {
    await import("./testLab");
    const root = document.createElement("div");
    document.body.append(root);
    const onStartMatch = vi.fn();
    const onRestart = vi.fn();
    const onResume = vi.fn();
    const onBootStart = vi.fn();
    const ui = new UIController(root, { onBootStart, onStartMatch, onRestart, onResume });

    expect(ui.screen).toBe("boot");
    expect(onBootStart).toHaveBeenCalledTimes(1);
    expect(root.querySelector("[data-ui-action='boot-start']")).toBeNull();
    click(root, "[data-ui-action='boot-skip']");
    expect(ui.screen).toBe("title");
    click(root, "[data-ui-action='title-start']");
    expect(ui.screen).toBe("home");

    for (const [open, expected] of [
      ["home-settings", "settings"],
      ["home-how", "how-to-play"],
      ["home-controls", "controls"],
      ["home-lab", "lab"],
    ] as const) {
      click(root, `[data-ui-action='${open}']`);
      expect(ui.screen).toBe(expected);
      if (expected === "lab") {
        await vi.waitFor(() => {
          expect(root.querySelector("[data-lab-overlay='collision']")).not.toBeNull();
        });
        const collisions = root.querySelector<HTMLInputElement>("[data-lab-overlay-toggle='collision']")!;
        const collisionLayer = root.querySelector<SVGElement>("[data-lab-overlay='collision']")!;
        expect(collisionLayer.hasAttribute("hidden")).toBe(true);
        collisions.click();
        expect(collisions.checked).toBe(true);
        expect(collisionLayer.hasAttribute("hidden")).toBe(false);
        const stage = getStageDefinition(DEFAULT_STAGE_ID);
        expect(collisionLayer.querySelectorAll("[data-stage-surface]")).toHaveLength(
          stage.platforms.length,
        );
        expect(collisionLayer.querySelectorAll("polygon.is-ground")).toHaveLength(
          stage.platforms.filter(({ kind }) => kind === "ground").length,
        );
        expect(collisionLayer.querySelectorAll("line.is-platform")).toHaveLength(
          stage.platforms.filter(({ kind }) => kind === "platform").length,
        );
        expect(collisionLayer.querySelectorAll("circle.is-ledge")).toHaveLength(
          stage.ledges.length,
        );
      }
      click(root, expected === "controls" ? "[data-ui-action='controls-back']" : "[data-ui-action='back-home']");
      expect(ui.screen).toBe("home");
    }

    click(root, "[data-ui-action='home-play']");
    expect(ui.screen).toBe("character-select");
    const p1Name = root.querySelector<HTMLInputElement>("[data-ui-field='player-name'][data-player-slot='0']")!;
    p1Name.value = "Alex";
    p1Name.dispatchEvent(new Event("input", { bubbles: true }));
    click(root, `[data-ui-action='pick-fighter'][data-fighter-slot='0'][data-fighter='${OPEN_P1}']`);
    click(root, "[data-ui-action='toggle-player-ready'][data-player-slot='0']");
    click(root, `[data-ui-action='pick-fighter'][data-fighter-slot='1'][data-fighter='${OPEN_P2}']`);
    click(root, "[data-ui-action='toggle-player-ready'][data-player-slot='1']");
    click(root, "[data-ui-action='open-stage-select']");
    expect(ui.screen).toBe("stage-select");
    click(root, `[data-ui-action='select-stage'][data-stage='${DEFAULT_STAGE_ID}']`);
    click(root, "[data-ui-action='stage-confirm']");
    expect(ui.screen).toBe("gameplay");
    expect(onStartMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: DEFAULT_STAGE_ID,
        players: [
          expect.objectContaining({ fighter: OPEN_P1, skin: "00", name: "Alex" }),
          expect.objectContaining({ fighter: OPEN_P2, skin: "00" }),
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal), reportProgress: expect.any(Function) }),
    );

    ui.showPause();
    click(root, "[data-ui-action='pause-resume']");
    expect(onResume).toHaveBeenCalledTimes(1);
    const victorySources: string[] = [];
    class VictoryImage {
      decoding = "auto";
      private source = "";
      private loadListener?: () => void;
      get src(): string { return this.source; }
      set src(value: string) {
        this.source = value;
        victorySources.push(value);
        this.loadListener?.();
      }
      addEventListener(type: string, listener: () => void): void {
        if (type === "load") this.loadListener = listener;
      }
    }
    vi.stubGlobal("Image", VictoryImage);
    ui.showResults({ winner: 0, durationMs: 65_000, kos: [3, 1] });
    expect(ui.screen).toBe("results");
    await vi.waitFor(() => {
      expect(victorySources.at(-1)).toBe(
        `/assets/characters/open/${OPEN_P1}/00/victory.webp?v=clean-animation-4`,
      );
    });
    expect(root.querySelector<HTMLCanvasElement>("[data-victory-canvas]")?.style.filter).toBe("none");
    ui.updateHud({
      players: [
        { fighter: OPEN_P1, name: "Alex", stocks: 3, damage: 0 },
        { fighter: OPEN_P2, name: "Player 2", stocks: 0, damage: 120 },
      ],
    });
    expect(ui.screen).toBe("results");
    click(root, "[data-ui-action='result-rematch']");
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(ui.screen).toBe("gameplay");

    ui.showResults({ winner: 1, durationMs: 20_000, kos: [0, 3] });
    await vi.waitFor(() => {
      expect(victorySources.at(-1)).toBe(
        `/assets/characters/open/${OPEN_P2}/00/victory.webp?v=clean-animation-4`,
      );
    });
    click(root, "[data-ui-action='result-select']");
    expect(ui.screen).toBe("character-select");
    ui.destroy();
  });

  it("uses image-only open portraits and sounds home hover once", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onUiSound = vi.fn();
    const ui = new UIController(root, { onUiSound });

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    expect(ui.screen).toBe("home");
    expect(document.activeElement).not.toBe(
      root.querySelector("[data-ui-action='home-play']"),
    );

    onUiSound.mockClear();
    const playTile = root.querySelector<HTMLButtonElement>("[data-ui-action='home-play']")!;
    playTile.dispatchEvent(new MouseEvent("pointerover", {
      bubbles: true,
      relatedTarget: document.body,
    }));
    playTile.querySelector("strong")!.dispatchEvent(new MouseEvent("pointerover", {
      bubbles: true,
      relatedTarget: playTile,
    }));
    expect(onUiSound).toHaveBeenCalledTimes(1);
    expect(onUiSound).toHaveBeenCalledWith("focus");

    click(root, "[data-ui-action='home-play']");
    click(root, `[data-ui-action='pick-fighter'][data-fighter-slot='0'][data-fighter='${OPEN_P1}']`);
    expect(root.querySelectorAll(".cc-portrait--image img.cc-portrait__sprite")).not.toHaveLength(0);
    expect(root.querySelector(".cc-portrait__body")).toBeNull();
    expect(root.querySelector(".cc-portrait__head")).toBeNull();
    expect(root.querySelector(".cc-portrait__detail")).toBeNull();
    expect(root.querySelector(".cc-portrait__emblem")).toBeNull();
    expect(root.querySelector(".cc-skin-picker")).toBeNull();

    const p1Portrait = root.querySelector<HTMLButtonElement>(
      "[data-ui-action='cycle-skin'][data-player-slot='0']",
    )!;
    expect(p1Portrait.querySelector("img")?.getAttribute("src")).toContain("/select/00.png");
    p1Portrait.click();
    expect(
      root.querySelector<HTMLButtonElement>("[data-ui-action='cycle-skin'][data-player-slot='0'] img")
        ?.getAttribute("src"),
    ).toContain(`/${OPEN_P1}/select/00.png`);
    expect(ui.getMatchConfig().players[0].skin).toBe("00");

    click(root, "[data-ui-action='activate-player'][data-player-slot='1']");
    click(root, `[data-ui-action='pick-fighter'][data-fighter-slot='1'][data-fighter='${OPEN_P2}']`);
    const openPortrait = root.querySelector<HTMLElement>(
      `.cc-player-panel--p2 [data-ui-action='cycle-skin'] .cc-portrait--${OPEN_P2}`,
    );
    expect(openPortrait).not.toBeNull();
    expect(openPortrait?.querySelector("img")?.getAttribute("src")).toContain(
      `/${OPEN_P2}/select/00.png`,
    );

    ui.destroy();
  });

  it("releases the keyboard-selected Play tile when the mouse takes over", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const ui = new UIController(root);

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    const playTile = root.querySelector<HTMLButtonElement>("[data-ui-action='home-play']")!;
    playTile.focus();
    expect(document.activeElement).toBe(playTile);

    playTile.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerType: "mouse",
    }));

    expect(document.activeElement).not.toBe(playTile);
    expect(root.dataset.inputMode).toBe("pointer");
    ui.destroy();
  });

  it("configures stocks and a time limit and renders the battle timer", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const ui = new UIController(root);

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    click(root, "[data-ui-action='home-play']");

    const stocks = root.querySelector<HTMLSelectElement>("[data-ui-field='match-stocks']")!;
    stocks.value = "5";
    stocks.dispatchEvent(new Event("change", { bubbles: true }));
    const timer = root.querySelector<HTMLSelectElement>("[data-ui-field='time-limit']")!;
    timer.value = "180";
    timer.dispatchEvent(new Event("change", { bubbles: true }));

    expect(ui.getMatchConfig()).toMatchObject({ stocks: 5, timeLimitSeconds: 180 });
    ui.showHud();
    expect(root.querySelector("[data-hud-timer]")?.textContent).toBe("3:00");

    ui.updateHud({
      players: [
        { fighter: OPEN_P1, stocks: 1, damage: 999 },
        { fighter: OPEN_P2, stocks: 1, damage: 999 },
      ],
      announcement: "SUDDEN DEATH",
      remainingTimeMs: null,
      suddenDeath: true,
    });
    expect(root.querySelector(".cc-hud")?.classList.contains("is-sudden-death")).toBe(true);
    expect(root.querySelector("[data-hud-announcement]")?.textContent).toBe("SUDDEN DEATH");
    expect(root.querySelector<HTMLElement>("[data-hud-timer]")?.hidden).toBe(true);
    ui.destroy();
  });

  it("keeps the loading screen visible until selected assets are ready", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let resolveLaunch: (() => void) | undefined;
    let launchContext: MatchLaunchContext | undefined;
    const onStartMatch = vi.fn((_config, context) => {
      launchContext = context;
      return new Promise<void>((resolve) => { resolveLaunch = resolve; });
    });
    const ui = new UIController(root, { onStartMatch });

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    click(root, "[data-ui-action='home-play']");
    click(root, "[data-ui-action='toggle-player-ready'][data-player-slot='0']");
    click(root, "[data-ui-action='toggle-player-ready'][data-player-slot='1']");
    click(root, "[data-ui-action='open-stage-select']");
    click(root, "[data-ui-action='stage-confirm']");

    expect(ui.screen).toBe("match-loading");
    expect(onStartMatch).toHaveBeenCalledTimes(1);
    launchContext?.reportProgress({ completed: 25, total: 50, phase: "fighters" });
    expect(root.querySelector("[data-match-loading-percent]")?.textContent).toBe("50%");
    expect(root.querySelector("[data-match-loading-progress]")?.getAttribute("aria-valuenow")).toBe("50");

    resolveLaunch?.();
    await vi.waitFor(() => expect(ui.screen).toBe("gameplay"));
    ui.destroy();
  });

  it("cancels an in-flight match load without accepting its late completion", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let resolveLaunch: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    const onStartMatch = vi.fn((_config, context) => {
      signal = context.signal;
      return new Promise<void>((resolve) => { resolveLaunch = resolve; });
    });
    const ui = new UIController(root, { onStartMatch });

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    click(root, "[data-ui-action='home-play']");
    click(root, "[data-ui-action='toggle-player-ready'][data-player-slot='0']");
    click(root, "[data-ui-action='toggle-player-ready'][data-player-slot='1']");
    click(root, "[data-ui-action='open-stage-select']");
    click(root, "[data-ui-action='stage-confirm']");
    click(root, "[data-ui-action='loading-cancel']");

    expect(signal?.aborted).toBe(true);
    expect(ui.screen).toBe("stage-select");
    resolveLaunch?.();
    await Promise.resolve();
    expect(ui.screen).toBe("stage-select");
    ui.destroy();
  });

  it("lets player-owned cursors operate menus, selects and sliders", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const ui = new UIController(root);

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    const settings = root.querySelector<HTMLElement>("[data-ui-action='home-settings']")!;
    ui.activateCursorTarget(1, settings);
    expect(ui.screen).toBe("settings");

    const music = root.querySelector<HTMLInputElement>("[data-ui-setting='musicVolume']")!;
    vi.spyOn(music, "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 300,
      top: 100,
      bottom: 120,
      x: 100,
      y: 100,
      width: 200,
      height: 20,
      toJSON: () => ({}),
    } as DOMRect);
    ui.activateCursorTarget(0, music, { x: 250, y: 110 });
    expect(music.value).toBe("75");

    ui.activateCursorTarget(0, root.querySelector<HTMLElement>("[data-ui-action='back-home']")!);
    ui.activateCursorTarget(0, root.querySelector<HTMLElement>("[data-ui-action='home-play']")!);
    const openFighter = root.querySelector<HTMLElement>(
      `[data-ui-action='pick-fighter'][data-fighter='${OPEN_P2}']`,
    )!;
    ui.activateCursorTarget(1, openFighter);
    expect(ui.getMatchConfig().players[1].fighter).toBe(OPEN_P2);

    const frequency = root.querySelector<HTMLSelectElement>("[data-ui-field='item-frequency']")!;
    expect(frequency.value).toBe("medium");
    ui.activateCursorTarget(0, frequency);
    expect(ui.getMatchConfig().itemFrequency).toBe("high");
    ui.destroy();
  });

  it("lets a human player choose the fighter for a CPU slot", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const ui = new UIController(root);

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    click(root, "[data-ui-action='home-play']");
    click(root, "[data-ui-action='set-player-mode'][data-player-slot='1'][data-player-cpu='true']");
    click(root, "[data-ui-action='activate-player'][data-player-slot='1']");
    click(root, `[data-ui-action='pick-fighter'][data-fighter='${OPEN_P2}']`);

    expect(ui.getMatchConfig().players[1]).toMatchObject({ fighter: OPEN_P2, cpu: true });
    expect(ui.getMatchConfig().players[0].fighter).not.toBe(OPEN_P2);
    ui.destroy();
  });

  it("shows distinct AZERTY labels when capturing A/Q and Z/W", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const ui = new UIController(root);

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    click(root, "[data-ui-action='home-controls']");

    const capture = (action: string, code: string, key: string): string => {
      const button = root.querySelector<HTMLButtonElement>(
        `[data-ui-action='binding-capture'][data-player-slot='0'][data-binding-action='${action}']`,
      )!;
      button.click();
      button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code, key }));
      return root.querySelector<HTMLButtonElement>(
        `[data-ui-action='binding-capture'][data-player-slot='0'][data-binding-action='${action}'] kbd`,
      )!.textContent ?? "";
    };

    expect(capture("attack", "KeyQ", "q")).toBe("Q");
    expect(capture("special", "KeyA", "a")).toBe("A");
    expect(capture("shield", "KeyZ", "z")).toBe("Z");
    expect(capture("grab", "KeyW", "w")).toBe("W");

    ui.destroy();
  });

  it("renders the dynamic fighter catalog with readable adaptive rows and coherent navigation", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }));
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
    const root = document.createElement("div");
    document.body.append(root);
    const ui = new UIController(root);

    click(root, "[data-ui-action='boot-skip']");
    click(root, "[data-ui-action='title-start']");
    click(root, "[data-ui-action='home-play']");

    let grid = root.querySelector<HTMLElement>(".cc-roster-grid")!;
    let cards = Array.from(grid.querySelectorAll<HTMLButtonElement>(".cc-fighter-card"));
    expect(cards).toHaveLength(FIGHTER_IDS.length);
    expect(cards.map((card) => card.dataset.fighter)).toEqual(FIGHTER_IDS);
    expect(new Set(cards.map((card) => card.dataset.fighter)).size).toBe(FIGHTER_IDS.length);
    for (const card of cards) {
      const fighter = getFighterDefinition(card.dataset.fighter as (typeof FIGHTER_IDS)[number]);
      expect(card.querySelector(".cc-fighter-card__name strong")?.textContent).toBe(
        fighter.displayName,
      );
      expect(card.disabled).toBe(!isFighterVisualReady(fighter.id));
    }
    expect(grid.querySelectorAll("[role='radio'][aria-checked='true']")).toHaveLength(1);
    const layoutFor = (count: number, maxColumns: number) => {
      const rows = Math.min(count, Math.max(2, Math.ceil(count / maxColumns)));
      return { columns: Math.ceil(count / rows), rows };
    };
    const desktopLayout = layoutFor(cards.length, 20);
    const compactLayout = layoutFor(cards.length, 10);
    expect(grid.dataset.rosterColumns).toBe(String(desktopLayout.columns));
    expect(grid.dataset.rosterRows).toBe(String(desktopLayout.rows));
    expect(grid.style.getPropertyValue("--cc-roster-compact-columns").trim()).toBe(
      String(compactLayout.columns),
    );
    expect(grid.style.getPropertyValue("--cc-roster-compact-rows").trim()).toBe(
      String(compactLayout.rows),
    );
    const prototypeCard = grid.querySelector<HTMLButtonElement>(
      "[data-fighter='rgs-character-prototype']",
    )!;
    expect(prototypeCard.disabled).toBe(false);
    expect(prototypeCard.dataset.openContent).toBe("true");
    expect(prototypeCard.dataset.productionReady).toBe("false");
    expect(prototypeCard.querySelector("small")?.textContent).toBe("Open prototype");
    expect(cards.every((card) => card.dataset.openContent === "true")).toBe(true);

    cards[0]!.focus();
    cards[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowDown" }));
    expect(document.activeElement).toBe(cards[desktopLayout.columns]);
    cards[desktopLayout.columns]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowUp" }));
    expect(document.activeElement).toBe(cards[0]);

    cards[0]!.focus();
    cards[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowRight" }));
    expect(document.activeElement).toBe(cards[1]);
    cards[1]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowLeft" }));
    expect(document.activeElement).toBe(cards[0]);

    const retainedFighter = cards[0]!.dataset.fighter;
    cards[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "Digit2" }));
    const retainedCard = document.activeElement as HTMLButtonElement;
    expect(retainedCard.dataset.fighter).toBe(retainedFighter);
    expect(retainedCard.dataset.fighterSlot).toBe("1");

    grid = root.querySelector<HTMLElement>(".cc-roster-grid")!;
    cards = Array.from(grid.querySelectorAll<HTMLButtonElement>(".cc-fighter-card"));
    grid.style.setProperty("--cc-roster-columns", "5");
    cards[0]!.focus();
    cards[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowDown" }));
    expect(document.activeElement).toBe(cards[5]);

    grid.style.setProperty("--cc-roster-columns", "4");
    cards[0]!.focus();
    cards[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowDown" }));
    expect(document.activeElement).toBe(cards[4]);
    ui.destroy();
  });

  it("skips the timed boot sequence when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    const root = document.createElement("div");
    document.body.append(root);
    const onBootStart = vi.fn();
    const ui = new UIController(root, { onBootStart });

    expect(onBootStart).toHaveBeenCalledTimes(1);
    expect(ui.screen).toBe("title");
    expect(vi.getTimerCount()).toBe(0);
    ui.destroy();
  });
});
