import {
  REMOTE_ANIMATION_CONFIG,
  REMOTE_ANIMATION_SLOTS,
  isFighterVisualReady,
  remoteAnimationSetForFighter,
  type RemoteAnimationDefinition,
  type RemoteAnimationSlot,
} from "../game/characterAssets";
import { FIGHTER_SKINS } from "../game/content";
import type { FighterId, InputFrame, SkinId, StageId } from "../game/contracts";
import {
  createEmptyInput,
  createGame,
  fighterHurtboxProfile,
  type GameEvent,
} from "../game/engine";
import { ITEM_DEFINITIONS, isAutomaticItem, type ItemKind } from "../game/items";
import { FIGHTER_IDS, getFighterDefinition } from "../game/roster";
import { spritePixelScale } from "../game/render";
import {
  DEFAULT_STAGE_ID,
  STAGE_DEFINITIONS,
  STAGE_IDS,
  stageSurfaceYAt,
  stageWorldToPixel,
} from "../game/stages";

export const TEST_LAB_ANIMATION_SLOTS = REMOTE_ANIMATION_SLOTS;
export const TEST_LAB_EFFECTS = [
  "none",
  "hit",
  "shield",
  "projectile",
  "explosion",
  "smoke",
  "speed",
  "invincible",
  "ko",
] as const;
type TestLabEffect = (typeof TEST_LAB_EFFECTS)[number];

export interface LabPlaybackState {
  fighter: FighterId;
  skin: SkinId;
  animation: RemoteAnimationSlot;
  facing: -1 | 1;
  speed: number;
  loop: boolean;
  playing: boolean;
  frame: number;
}

export const labFrameAtTime = (
  definition: Pick<RemoteAnimationDefinition, "frameCount" | "fps">,
  elapsedSeconds: number,
  speed: number,
  loop: boolean,
): number => {
  const raw = Math.max(0, Math.floor(elapsedSeconds * definition.fps * speed));
  return loop
    ? raw % definition.frameCount
    : Math.min(definition.frameCount - 1, raw);
};

const fighterLabel = (fighter: FighterId): string =>
  getFighterDefinition(fighter).displayName;

const DEFAULT_LAB_FIGHTER = FIGHTER_IDS[0];

if (!DEFAULT_LAB_FIGHTER) {
  throw new Error("No fighter is available for the Lab.");
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export class TestLabController {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly image = new Image();
  private state: LabPlaybackState = {
    fighter: DEFAULT_LAB_FIGHTER,
    skin: "00",
    animation: "idle",
    facing: 1,
    speed: 1,
    loop: true,
    playing: true,
    frame: 0,
  };
  private elapsed = 0;
  private previousTimestamp = performance.now();
  private raf = 0;
  private destroyed = false;
  private selectedStage: StageId = DEFAULT_STAGE_ID;
  private selectedItem: ItemKind = "vitality-fruit";
  private selectedEffect: TestLabEffect = "none";

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = this.markup();
    const canvas = this.root.querySelector<HTMLCanvasElement>("[data-lab-canvas]");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) throw new Error("The Lab canvas is unavailable.");
    this.canvas = canvas;
    this.context = context;
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("change", this.handleChange);
    this.root.addEventListener("input", this.handleInput);
    this.image.decoding = "async";
    this.image.addEventListener("load", this.draw);
    this.loadAnimation(true);
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.image.removeEventListener("load", this.draw);
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("change", this.handleChange);
    this.root.removeEventListener("input", this.handleInput);
  }

  private definition(): RemoteAnimationDefinition {
    return remoteAnimationSetForFighter(
      this.state.fighter,
      this.state.skin,
      REMOTE_ANIMATION_CONFIG,
    ).animations[this.state.animation];
  }

  private markup(): string {
    const itemOptions = Object.entries(ITEM_DEFINITIONS)
      .map(([id, item]) => `<option value="${id}">${escapeHtml(item.label)}</option>`)
      .join("");
    return `
      <div class="cc-lab-workbench">
        <aside class="cc-lab-reel" aria-label="Lab selectorsoratoire">
          <div class="cc-lab-reel__label"><span>Bank A</span><strong>Fighter</strong></div>
          <label>Fighter
            <select data-lab-field="fighter">
              ${FIGHTER_IDS.map((fighter) => `<option value="${fighter}"${isFighterVisualReady(fighter) ? "" : " disabled"}>${fighterLabel(fighter)}${isFighterVisualReady(fighter) ? "" : " — render required"}</option>`).join("")}
            </select>
          </label>
          <label>Skin
            <select data-lab-field="skin">
              ${FIGHTER_SKINS[this.state.fighter].map((skin) => `<option value="${skin.id}">${skin.label}</option>`).join("")}
            </select>
          </label>
          <label>Animation
            <select data-lab-field="animation">
              ${TEST_LAB_ANIMATION_SLOTS.map((slot) => `<option value="${slot}">${slot}</option>`).join("")}
            </select>
          </label>
          <label>Facing
            <select data-lab-field="facing">
              <option value="1">Right</option>
              <option value="-1">Left</option>
            </select>
          </label>
          <div class="cc-lab-reel__label"><span>Bank B</span><strong>Stage & items</strong></div>
          <label>Stage
            <select data-lab-field="stage">
              ${STAGE_IDS.map((id) => `<option value="${id}">${escapeHtml(STAGE_DEFINITIONS[id].displayName)}</option>`).join("")}
            </select>
          </label>
          <label>Item
            <select data-lab-field="item">${itemOptions}</select>
          </label>
          <label>Visual effect
            <select data-lab-field="effect">
              ${TEST_LAB_EFFECTS.map((effect) => `<option value="${effect}">${effect}</option>`).join("")}
            </select>
          </label>
          <div class="cc-lab-item-preview" data-lab-item-preview aria-live="polite"></div>
          <button class="cc-lab-exercise" type="button" data-lab-action="exercise-item">Test item</button>
          <output class="cc-lab-item-result" data-lab-item-result>Scenario ready</output>
        </aside>

        <section class="cc-lab-monitor" aria-label="Frame-by-frame preview">
          <div class="cc-lab-monitor__header">
            <div><span>TEST LAB / FRAME UNIT</span><strong data-lab-clip-name>${escapeHtml(fighterLabel(this.state.fighter))} • idle</strong></div>
            <output data-lab-fps>30 FPS</output>
          </div>
          <div class="cc-lab-stage" data-lab-stage="${DEFAULT_STAGE_ID}">
            <canvas data-lab-canvas width="512" height="512" aria-label="Animation frame"></canvas>
            <div class="cc-lab-effect" data-lab-effect="none" aria-hidden="true"><i></i><b></b><em></em></div>
            <div class="cc-lab-overlay cc-lab-overlay--hurt" data-lab-overlay="hurt" hidden></div>
            <div class="cc-lab-overlay cc-lab-overlay--hit" data-lab-overlay="hit" hidden></div>
            <svg class="cc-lab-overlay cc-lab-overlay--collision" data-lab-overlay="collision" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet" aria-label="Solid volumes, platforms, and stage ledges" hidden>
              ${this.stageCollisionMarkup(DEFAULT_STAGE_ID)}
            </svg>
          </div>
          <div class="cc-lab-transport">
            <button type="button" data-lab-action="previous" aria-label="Previous frame">◀|</button>
            <button type="button" data-lab-action="toggle" data-lab-play>Pause</button>
            <button type="button" data-lab-action="next" aria-label="Next frame">|▶</button>
            <label>Speed
              <input type="range" min="0.1" max="2" step="0.1" value="1" data-lab-field="speed">
              <output data-lab-speed>1.0×</output>
            </label>
            <label class="cc-lab-check"><input type="checkbox" data-lab-field="loop" checked> Loop</label>
          </div>
          <div class="cc-lab-timeline">
            <input type="range" min="0" max="1" value="0" data-lab-field="frame" aria-label="Exact frame">
            <output data-lab-frame>Frame 1 / 1</output>
          </div>
          <div class="cc-lab-debug">
            <label><input type="checkbox" data-lab-overlay-toggle="hurt"> Hurtbox</label>
            <label><input type="checkbox" data-lab-overlay-toggle="hit"> Hitbox</label>
            <label><input type="checkbox" data-lab-overlay-toggle="collision"> Collisions</label>
            <output data-lab-engine-state>playing=true · loop=true · facing=1</output>
          </div>
        </section>
      </div>`;
  }

  private loadAnimation(reset: boolean): void {
    if (reset) {
      this.elapsed = 0;
      this.state.frame = 0;
    }
    const definition = this.definition();
    this.image.src = definition.mediaUrl;
    const slider = this.root.querySelector<HTMLInputElement>("[data-lab-field='frame']");
    if (slider) {
      slider.max = String(Math.max(0, definition.frameCount - 1));
      slider.value = String(this.state.frame);
    }
    this.canvas.style.filter = "none";
    this.updateHurtboxOverlay();
    this.updateLabels();
    this.draw();
  }

  private readonly tick = (timestamp: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.1, Math.max(0, (timestamp - this.previousTimestamp) / 1000));
    this.previousTimestamp = timestamp;
    if (this.state.playing && this.image.complete && this.image.naturalWidth > 0) {
      this.elapsed += dt;
      const nextFrame = labFrameAtTime(
        this.definition(),
        this.elapsed,
        this.state.speed,
        this.state.loop,
      );
      if (nextFrame !== this.state.frame) {
        this.state.frame = nextFrame;
        this.draw();
        this.updateLabels();
      }
      if (!this.state.loop && nextFrame === this.definition().frameCount - 1) {
        this.state.playing = false;
        this.updateLabels();
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private readonly draw = (): void => {
    const definition = this.definition();
    const ctx = this.context;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.image.complete || this.image.naturalWidth <= 0) return;
    const sourceX = (this.state.frame % definition.columns) * definition.cellSize;
    const sourceY = Math.floor(this.state.frame / definition.columns) * definition.cellSize;
    ctx.save();
    const sourceFacing = definition.sourceFacing === "right" ? 1 : -1;
    if (this.state.facing !== sourceFacing) {
      ctx.translate(this.canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      this.image,
      sourceX,
      sourceY,
      definition.cellSize,
      definition.cellSize,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    ctx.restore();
  };

  private updateLabels(): void {
    const definition = this.definition();
    const name = this.root.querySelector<HTMLElement>("[data-lab-clip-name]");
    const fps = this.root.querySelector<HTMLOutputElement>("[data-lab-fps]");
    const frame = this.root.querySelector<HTMLOutputElement>("[data-lab-frame]");
    const state = this.root.querySelector<HTMLOutputElement>("[data-lab-engine-state]");
    const play = this.root.querySelector<HTMLButtonElement>("[data-lab-play]");
    const slider = this.root.querySelector<HTMLInputElement>("[data-lab-field='frame']");
    if (name) name.textContent = `${fighterLabel(this.state.fighter)} • ${definition.label}`;
    if (fps) fps.value = `${Math.round(definition.fps * this.state.speed)} FPS`;
    if (frame) frame.value = `Frame ${this.state.frame + 1} / ${definition.frameCount}`;
    if (state) {
      state.value = `playing=${this.state.playing} · loop=${this.state.loop} · facing=${this.state.facing} · frame=${this.state.frame}`;
    }
    if (play) play.textContent = this.state.playing ? "Pause" : "Lecture";
    if (slider) slider.value = String(this.state.frame);
    this.updateItemPreview();
  }

  private updateHurtboxOverlay(): void {
    const overlay = this.root.querySelector<HTMLElement>("[data-lab-overlay='hurt']");
    if (!overlay) return;
    const definition = getFighterDefinition(this.state.fighter);
    const profile = fighterHurtboxProfile(
      definition.size,
      this.state.animation === "crouch" ? "crouch" : "idle",
    );
    const displayedCell = this.canvas.getBoundingClientRect().width || this.canvas.width;
    const pixelsPerWorldUnit =
      displayedCell / (this.definition().cellSize * spritePixelScale(this.state.fighter));
    overlay.style.width = `${profile.radius * 2 * pixelsPerWorldUnit}px`;
    overlay.style.height = `${profile.halfHeight * 2 * pixelsPerWorldUnit}px`;
    overlay.style.transform = `translateY(${-profile.centerOffsetY * pixelsPerWorldUnit}px)`;
    overlay.dataset.hurtboxFighter = this.state.fighter;
    overlay.dataset.hurtboxState = this.state.animation === "crouch" ? "crouch" : "standing";
  }

  private stageCollisionMarkup(stage: StageId): string {
    const definition = STAGE_DEFINITIONS[stage];
    const surfaces = definition.platforms.map((platform) => {
      const leftX = platform.x - platform.width / 2;
      const rightX = platform.x + platform.width / 2;
      const topLeft = stageWorldToPixel(stage, {
        x: leftX,
        y: stageSurfaceYAt(platform, leftX),
      });
      const topRight = stageWorldToPixel(stage, {
        x: rightX,
        y: stageSurfaceYAt(platform, rightX),
      });
      if (platform.kind === "platform") {
        return `<line x1="${topLeft.x.toFixed(2)}" y1="${topLeft.y.toFixed(2)}" x2="${topRight.x.toFixed(2)}" y2="${topRight.y.toFixed(2)}" data-stage-surface="${escapeHtml(platform.id)}" class="is-platform" />`;
      }

      const bottomRight = stageWorldToPixel(stage, {
        x: rightX,
        y: stageSurfaceYAt(platform, rightX) - platform.height,
      });
      const bottomLeft = stageWorldToPixel(stage, {
        x: leftX,
        y: stageSurfaceYAt(platform, leftX) - platform.height,
      });
      const points = [topLeft, topRight, bottomRight, bottomLeft]
        .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" ");
      return `<polygon points="${points}" data-stage-surface="${escapeHtml(platform.id)}" class="is-ground" />`;
    }).join("");

    const ledges = definition.ledges.map((ledge) => {
      const platform = definition.platforms.find(({ id }) => id === ledge.platformId);
      if (!platform) return "";
      const x = platform.x + (ledge.side === "left" ? -platform.width / 2 : platform.width / 2);
      const point = stageWorldToPixel(stage, { x, y: stageSurfaceYAt(platform, x) });
      return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="5" data-stage-ledge="${escapeHtml(`${ledge.platformId}:${ledge.side}`)}" class="is-ledge" />`;
    }).join("");

    return surfaces + ledges;
  }

  private updateItemPreview(): void {
    const select = this.root.querySelector<HTMLSelectElement>("[data-lab-field='item']");
    const preview = this.root.querySelector<HTMLElement>("[data-lab-item-preview]");
    const kind = select?.value as ItemKind | undefined;
    const item = kind ? ITEM_DEFINITIONS[kind] : undefined;
    if (!preview || !item) return;
    preview.innerHTML = `
      <img src="${item.iconUrl}" alt="" decoding="async" draggable="false">
      <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.effect)} • ${item.charges} charge${item.charges > 1 ? "s" : ""}</small></div>`;
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-lab-action]") : null;
    const action = target?.dataset.labAction;
    if (!action) return;
    if (action === "toggle") {
      this.state.playing = !this.state.playing;
      if (this.state.playing && !this.state.loop && this.state.frame >= this.definition().frameCount - 1) {
        this.elapsed = 0;
        this.state.frame = 0;
      }
    } else if (action === "previous" || action === "next") {
      this.state.playing = false;
      const direction = action === "next" ? 1 : -1;
      this.state.frame = Math.max(
        0,
        Math.min(this.definition().frameCount - 1, this.state.frame + direction),
      );
      this.elapsed = this.state.frame / (this.definition().fps * this.state.speed);
      this.draw();
    } else if (action === "exercise-item") {
      this.exerciseSelectedItem();
    }
    this.updateLabels();
  };

  private readonly handleChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target instanceof HTMLInputElement && this.syncOverlayToggle(target)) return;
    const field = target.dataset.labField;
    if (field === "fighter" && target instanceof HTMLSelectElement) {
      this.state.fighter = target.value as FighterId;
      const skinSelect = this.root.querySelector<HTMLSelectElement>("[data-lab-field='skin']");
      if (skinSelect) {
        const skins = FIGHTER_SKINS[this.state.fighter];
        if (!skins.some(({ id }) => id === this.state.skin)) {
          this.state.skin = skins[0]!.id;
        }
        skinSelect.innerHTML = skins
          .map((skin) => `<option value="${skin.id}">${skin.label}</option>`)
          .join("");
        skinSelect.value = this.state.skin;
      }
      this.loadAnimation(true);
    } else if (field === "skin") {
      this.state.skin = target.value as SkinId;
      this.loadAnimation(false);
    } else if (field === "animation") {
      this.state.animation = target.value as RemoteAnimationSlot;
      this.loadAnimation(true);
    } else if (field === "facing") {
      this.state.facing = target.value === "-1" ? -1 : 1;
      this.draw();
      this.updateLabels();
    } else if (field === "loop" && target instanceof HTMLInputElement) {
      this.state.loop = target.checked;
      this.updateLabels();
    } else if (field === "stage") {
      this.selectedStage = target.value as StageId;
      const stage = this.root.querySelector<HTMLElement>("[data-lab-stage]");
      if (stage) stage.dataset.labStage = target.value;
      const collision = this.root.querySelector<SVGElement>("[data-lab-overlay='collision']");
      if (collision) collision.innerHTML = this.stageCollisionMarkup(this.selectedStage);
    } else if (field === "item") {
      this.selectedItem = target.value as ItemKind;
      this.updateItemPreview();
    } else if (field === "effect") {
      this.selectedEffect = target.value as TestLabEffect;
      const effect = this.root.querySelector<HTMLElement>("[data-lab-effect]");
      if (effect) {
        effect.dataset.labEffect = "none";
        void effect.offsetWidth;
        effect.dataset.labEffect = this.selectedEffect;
      }
    }
  };

  private readonly handleInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    // Native checkboxes emit `input` before `change`, while some browser
    // automation surfaces only expose one of the two. Keep the diagnostic
    // layers in sync on both events so the Lab always mirrors the checkbox.
    if (this.syncOverlayToggle(target)) return;
    const field = target.dataset.labField;
    if (field === "frame") {
      this.state.playing = false;
      this.state.frame = Number(target.value);
      this.elapsed = this.state.frame / (this.definition().fps * this.state.speed);
      this.draw();
      this.updateLabels();
    } else if (field === "speed") {
      this.state.speed = Number(target.value);
      const output = this.root.querySelector<HTMLOutputElement>("[data-lab-speed]");
      if (output) output.value = `${this.state.speed.toFixed(1)}×`;
      this.updateLabels();
    }
  };

  private syncOverlayToggle(target: HTMLInputElement): boolean {
    const overlay = target.dataset.labOverlayToggle;
    if (!overlay) return false;
    const layer = this.root.querySelector<Element>(`[data-lab-overlay="${overlay}"]`);
    // `hidden` is not a reflected property on SVGElement, so assigning
    // `layer.hidden` leaves the collision SVG's attribute untouched.
    layer?.toggleAttribute("hidden", !target.checked);
    return true;
  }

  private exerciseSelectedItem(): void {
    const output = this.root.querySelector<HTMLOutputElement>("[data-lab-item-result]");
    const definition = ITEM_DEFINITIONS[this.selectedItem];
    const targetFighter =
      FIGHTER_IDS.find((fighter) => fighter !== this.state.fighter) ??
      this.state.fighter;
    const game = createGame(
      {
        players: [
          { fighter: this.state.fighter, skin: this.state.skin, name: "Test", slot: 0, cpu: false, cpuLevel: 1 },
          { fighter: targetFighter, skin: "00", name: "Target", slot: 1, cpu: false, cpuLevel: 1 },
        ],
        stocks: 3,
        items: false,
        itemFrequency: "medium",
        stage: this.selectedStage,
      },
      { countdownFrames: 0, seed: 7, spawnPositions: [{ x: -90, y: 52 }, { x: 90, y: 52 }] },
    );
    const idle = (): [InputFrame, InputFrame] => [createEmptyInput(), createEmptyInput()];
    for (let frame = 0; frame < 90; frame += 1) game.step(idle());
    const position = game.getSnapshot().fighters[0].position;
    game.spawnItem(this.selectedItem, position);
    const events: GameEvent[] = [];
    const record = (pair: [InputFrame, InputFrame]): void => {
      events.push(...game.step(pair).events);
    };
    if (isAutomaticItem(this.selectedItem)) {
      record(idle());
    } else {
      record([this.testInput("grab"), createEmptyInput()]);
      for (let frame = 0; frame < 8; frame += 1) record(idle());
      record([this.testInput("attack", 1), createEmptyInput()]);
      for (let frame = 0; frame < 120; frame += 1) record(idle());
    }
    const snapshot = game.getSnapshot();
    const used = events.some((event) => event.type === "item-use" && event.item === this.selectedItem);
    const hit = events.some((event) => event.type === "hit" && event.item === this.selectedItem);
    const held = snapshot.fighters[0].heldItem;
    const world = snapshot.items.find((item) => item.kind === this.selectedItem);
    if (output) {
      output.value = `${used ? "USE ✓" : "USE —"} · ${hit ? "HIT ✓" : held ? `${held.charges} charge(s)` : world ? world.mode : definition.effect}`;
    }
  }

  private testInput(action: "grab" | "attack", x = 0): InputFrame {
    return {
      held: new Set([action]),
      pressed: new Set([action]),
      released: new Set(),
      direction: { x, y: 0 },
    };
  }
}
