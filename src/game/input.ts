import type { ActionName, BindingMap, InputFrame, PlayerSlot } from "./contracts";

/**
 * Gameplay bindings use KeyboardEvent.code, not KeyboardEvent.key. This keeps
 * controls attached to physical keys when the OS keyboard layout changes.
 * On a French AZERTY keyboard KeyW/KeyA are the keys labelled Z/Q and
 * Semicolon is the key labelled M.
 */
export const DEFAULT_BINDINGS: readonly [BindingMap, BindingMap] = [
  {
    left: "KeyA",
    right: "KeyD",
    up: "KeyW",
    down: "KeyS",
    jump: "KeyH",
    attack: "KeyF",
    special: "KeyG",
    shield: "KeyR",
    grab: "KeyT",
    pause: "Escape",
  },
  {
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    jump: "Semicolon",
    attack: "KeyK",
    special: "KeyL",
    shield: "KeyO",
    grab: "KeyP",
    pause: "Escape",
  },
] as const;

export const ACTION_NAMES: readonly ActionName[] = [
  "left",
  "right",
  "up",
  "down",
  "jump",
  "attack",
  "special",
  "shield",
  "grab",
  "pause",
];

export interface KeyboardInputEvent {
  readonly code: string;
  readonly repeat?: boolean;
  preventDefault?: () => void;
}

type PlayerInputState = {
  held: Set<ActionName>;
  pressed: Set<ActionName>;
  released: Set<ActionName>;
};

function createPlayerState(): PlayerInputState {
  return {
    held: new Set<ActionName>(),
    pressed: new Set<ActionName>(),
    released: new Set<ActionName>(),
  };
}

function cloneBindings(
  bindings: readonly [BindingMap, BindingMap],
): [BindingMap, BindingMap] {
  return [{ ...bindings[0] }, { ...bindings[1] }];
}

export function createEmptyInputFrame(): InputFrame {
  return {
    held: new Set<ActionName>(),
    pressed: new Set<ActionName>(),
    released: new Set<ActionName>(),
    direction: { x: 0, y: 0 },
  };
}

function snapshot(state: PlayerInputState): InputFrame {
  return {
    held: new Set(state.held),
    pressed: new Set(state.pressed),
    released: new Set(state.released),
    direction: {
      x: Number(state.held.has("right")) - Number(state.held.has("left")),
      // World space is Y-up, matching the combat engine and CPU controller.
      y: Number(state.held.has("up")) - Number(state.held.has("down")),
    },
  };
}

/**
 * Input facade for the fixed-step game loop.
 *
 * Call handleKeyDown/handleKeyUp directly in tests, or attach() once in the
 * browser. consumeFrames() should be called once per simulation tick so both
 * players observe the same keyboard edge window.
 */
export class KeyboardInput {
  private bindings: [BindingMap, BindingMap];
  private readonly states: [PlayerInputState, PlayerInputState] = [
    createPlayerState(),
    createPlayerState(),
  ];
  private readonly heldCodes = new Set<string>();
  private attachedTarget: EventTarget | null = null;
  private enabled = true;

  private readonly keyDownListener: EventListener = (event) => {
    this.handleKeyDown(event as KeyboardEvent);
  };

  private readonly keyUpListener: EventListener = (event) => {
    this.handleKeyUp(event as KeyboardEvent);
  };

  private readonly blurListener: EventListener = () => {
    this.clear();
  };

  constructor(bindings: readonly [BindingMap, BindingMap] = DEFAULT_BINDINGS) {
    this.bindings = cloneBindings(bindings);
  }

  attach(target: EventTarget = window): this {
    if (this.attachedTarget === target) return this;
    this.detach();
    target.addEventListener("keydown", this.keyDownListener);
    target.addEventListener("keyup", this.keyUpListener);
    target.addEventListener("blur", this.blurListener);
    this.attachedTarget = target;
    return this;
  }

  detach(): this {
    if (this.attachedTarget) {
      this.attachedTarget.removeEventListener("keydown", this.keyDownListener);
      this.attachedTarget.removeEventListener("keyup", this.keyUpListener);
      this.attachedTarget.removeEventListener("blur", this.blurListener);
      this.attachedTarget = null;
    }
    this.clear();
    return this;
  }

  destroy(): void {
    this.detach();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.clear();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getBindings(): [BindingMap, BindingMap] {
    return cloneBindings(this.bindings);
  }

  setBindings(bindings: readonly [BindingMap, BindingMap]): void {
    this.clear();
    this.bindings = cloneBindings(bindings);
  }

  setBinding(player: PlayerSlot, action: ActionName, code: string): void {
    if (this.bindings[player][action] === code) return;
    this.clear();
    this.bindings[player][action] = code;
  }

  shouldPreventDefault(code: string): boolean {
    if (!this.enabled) return false;
    return this.bindings.some((binding) =>
      ACTION_NAMES.some((action) => binding[action] === code),
    );
  }

  handleKeyDown(event: KeyboardInputEvent): void {
    if (!this.enabled) return;
    if (this.shouldPreventDefault(event.code)) event.preventDefault?.();
    if (event.repeat || this.heldCodes.has(event.code)) return;

    this.heldCodes.add(event.code);
    this.forEachMatchingAction(event.code, (state, action) => {
      if (!state.held.has(action)) state.pressed.add(action);
      state.released.delete(action);
      state.held.add(action);
    });
  }

  handleKeyUp(event: KeyboardInputEvent): void {
    if (!this.enabled) return;
    if (this.shouldPreventDefault(event.code)) event.preventDefault?.();
    if (!this.heldCodes.delete(event.code)) return;

    this.forEachMatchingAction(event.code, (state, action) => {
      if (state.held.delete(action)) state.released.add(action);
    });
  }

  /** Read a frame without consuming its pressed/released edges. */
  peekFrame(player: PlayerSlot): InputFrame {
    return snapshot(this.states[player]);
  }

  /** Read one player's frame and consume only that player's edges. */
  consumeFrame(player: PlayerSlot): InputFrame {
    const frame = snapshot(this.states[player]);
    this.states[player].pressed.clear();
    this.states[player].released.clear();
    return frame;
  }

  /** Alias suited to game loops which query players separately. */
  getFrame(player: PlayerSlot): InputFrame {
    return this.consumeFrame(player);
  }

  /** Read both players atomically, then clear all edge events. */
  consumeFrames(): [InputFrame, InputFrame] {
    const frames: [InputFrame, InputFrame] = [
      snapshot(this.states[0]),
      snapshot(this.states[1]),
    ];
    this.states[0].pressed.clear();
    this.states[0].released.clear();
    this.states[1].pressed.clear();
    this.states[1].released.clear();
    return frames;
  }

  consumePausePress(): boolean {
    const pressed =
      this.states[0].pressed.has("pause") ||
      this.states[1].pressed.has("pause");
    this.states[0].pressed.delete("pause");
    this.states[1].pressed.delete("pause");
    return pressed;
  }

  isHeld(player: PlayerSlot, action: ActionName): boolean {
    return this.states[player].held.has(action);
  }

  /** Drop all pending and held input, notably when the browser loses focus. */
  clear(): void {
    this.heldCodes.clear();
    for (const state of this.states) {
      state.held.clear();
      state.pressed.clear();
      state.released.clear();
    }
  }

  private forEachMatchingAction(
    code: string,
    callback: (state: PlayerInputState, action: ActionName) => void,
  ): void {
    for (const player of [0, 1] as const) {
      for (const action of ACTION_NAMES) {
        if (this.bindings[player][action] === code) {
          callback(this.states[player], action);
        }
      }
    }
  }
}

export { KeyboardInput as InputManager };

export function createInputManager(
  bindings: readonly [BindingMap, BindingMap] = DEFAULT_BINDINGS,
  target?: EventTarget,
): KeyboardInput {
  const input = new KeyboardInput(bindings);
  if (target) input.attach(target);
  return input;
}

/** Optional labels for callers that explicitly want a French AZERTY legend. */
const FRENCH_KEY_LABELS: Readonly<Record<string, string>> = {
  Backquote: "²",
  Digit1: "&",
  Digit2: "É",
  Digit3: '"',
  Digit4: "'",
  Digit5: "(",
  Digit6: "-",
  Digit7: "È",
  Digit8: "_",
  Digit9: "Ç",
  Digit0: "À",
  Minus: ")",
  Equal: "=",
  KeyA: "Q",
  KeyQ: "A",
  KeyW: "Z",
  KeyZ: "W",
  BracketLeft: "^",
  BracketRight: "$",
  Backslash: "*",
  Semicolon: "M",
  Quote: "Ù",
  IntlBackslash: "<",
  KeyM: ",",
  Comma: ";",
  Period: ":",
  Slash: "!",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  Space: "Espace",
};

export function formatKeyCode(code: string, french = false): string {
  if (french && FRENCH_KEY_LABELS[code]) return FRENCH_KEY_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}
