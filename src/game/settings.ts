import type {
  ActionName,
  BindingMap,
  GameSettings,
  PlayerSlot,
} from "./contracts";
import { ACTION_NAMES, DEFAULT_BINDINGS } from "./input";
import { createPersistentBrowserStorage } from "./persistentStorage";

export const SETTINGS_STORAGE_KEY = "super-bash-folds.settings.v1";
const LEGACY_SETTINGS_STORAGE_KEYS = [
  "libreledge.settings.v1",
  "super-open-bros.settings.v1",
  "cousins-clash.settings.v1",
] as const;

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type GameSettingsPatch = Partial<Omit<GameSettings, "bindings">> & {
  bindings?: readonly [Partial<BindingMap>, Partial<BindingMap>];
};

const DEFAULT_VALUES: GameSettings = {
  musicVolume: 0.72,
  effectsVolume: 0.85,
  shake: 0.7,
  flashes: 0.75,
  items: true,
  itemFrequency: "medium",
  bindings: [{ ...DEFAULT_BINDINGS[0] }, { ...DEFAULT_BINDINGS[1] }],
  tutorialSeen: false,
};

export const DEFAULT_SETTINGS: Readonly<GameSettings> = DEFAULT_VALUES;
export const DEFAULT_GAME_SETTINGS = DEFAULT_SETTINGS;

function cloneSettings(settings: GameSettings): GameSettings {
  return {
    ...settings,
    bindings: [{ ...settings.bindings[0] }, { ...settings.bindings[1] }],
  };
}

export function createDefaultSettings(): GameSettings {
  return cloneSettings(DEFAULT_VALUES);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampUnit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function isValidKeyboardCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z][A-Za-z0-9]*$/.test(value)
  );
}

function sanitizeBinding(value: unknown, fallback: BindingMap): BindingMap {
  if (!isRecord(value)) return { ...fallback };

  const binding = { ...fallback };
  for (const action of ACTION_NAMES) {
    const candidate = value[action];
    if (isValidKeyboardCode(candidate)) binding[action] = candidate;
  }

  // One physical key triggering several actions is almost always an accidental
  // corrupt rebind. Restore just this player's safe preset in that case.
  const codes = ACTION_NAMES.map((action) => binding[action]);
  return new Set(codes).size === codes.length ? binding : { ...fallback };
}

/** Validate untrusted JSON and preserve safe defaults for missing fields. */
export function sanitizeSettings(value: unknown): GameSettings {
  if (!isRecord(value)) return createDefaultSettings();

  const rawBindings = Array.isArray(value.bindings) ? value.bindings : [];
  const itemFrequency =
    value.itemFrequency === "low" ||
    value.itemFrequency === "medium" ||
    value.itemFrequency === "high"
      ? value.itemFrequency
      : DEFAULT_VALUES.itemFrequency;

  return {
    musicVolume: clampUnit(value.musicVolume, DEFAULT_VALUES.musicVolume),
    effectsVolume: clampUnit(value.effectsVolume, DEFAULT_VALUES.effectsVolume),
    shake: clampUnit(value.shake, DEFAULT_VALUES.shake),
    flashes: clampUnit(value.flashes, DEFAULT_VALUES.flashes),
    items:
      typeof value.items === "boolean" ? value.items : DEFAULT_VALUES.items,
    itemFrequency,
    bindings: [
      sanitizeBinding(rawBindings[0], DEFAULT_VALUES.bindings[0]),
      sanitizeBinding(rawBindings[1], DEFAULT_VALUES.bindings[1]),
    ],
    tutorialSeen:
      typeof value.tutorialSeen === "boolean"
        ? value.tutorialSeen
        : DEFAULT_VALUES.tutorialSeen,
  };
}

function browserStorage(): SettingsStorage | null {
  return createPersistentBrowserStorage() as SettingsStorage | null;
}

export function loadSettings(
  storage: SettingsStorage | null = browserStorage(),
): GameSettings {
  if (!storage) return createDefaultSettings();
  try {
    const serialized = storage.getItem(SETTINGS_STORAGE_KEY)
      ?? LEGACY_SETTINGS_STORAGE_KEYS
        .map((key) => storage.getItem(key))
        .find((value) => value !== null)
      ?? null;
    return serialized === null
      ? createDefaultSettings()
      : sanitizeSettings(JSON.parse(serialized) as unknown);
  } catch {
    return createDefaultSettings();
  }
}

/** Persist a sanitized snapshot. Storage failures never break the game. */
export function saveSettings(
  settings: GameSettings,
  storage: SettingsStorage | null = browserStorage(),
): GameSettings {
  const safe = sanitizeSettings(settings);
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Private mode and full storage must degrade to in-memory settings.
  }
  return safe;
}

export function resetSettings(
  storage: SettingsStorage | null = browserStorage(),
): GameSettings {
  try {
    storage?.removeItem(SETTINGS_STORAGE_KEY);
    for (const key of LEGACY_SETTINGS_STORAGE_KEYS) storage?.removeItem(key);
  } catch {
    // Reset still succeeds in memory when storage is unavailable.
  }
  return createDefaultSettings();
}

export function updateSettings(
  settings: GameSettings,
  patch: GameSettingsPatch,
): GameSettings {
  const current = sanitizeSettings(settings);
  const bindings = patch.bindings
    ? ([
        { ...current.bindings[0], ...patch.bindings[0] },
        { ...current.bindings[1], ...patch.bindings[1] },
      ] as [BindingMap, BindingMap])
    : current.bindings;

  return sanitizeSettings({ ...current, ...patch, bindings });
}

/**
 * Rebind an action without creating a collision. If the selected key was
 * already assigned, the two actions swap keys so every action stays usable.
 */
export function updateBinding(
  settings: GameSettings,
  player: PlayerSlot,
  action: ActionName,
  code: string,
): GameSettings {
  const current = sanitizeSettings(settings);
  if (!isValidKeyboardCode(code)) return current;

  const bindings: [BindingMap, BindingMap] = [
    { ...current.bindings[0] },
    { ...current.bindings[1] },
  ];
  const playerBindings = bindings[player];
  const previousCode = playerBindings[action];
  const collision = ACTION_NAMES.find(
    (otherAction) =>
      otherAction !== action && playerBindings[otherAction] === code,
  );

  playerBindings[action] = code;
  if (collision) playerBindings[collision] = previousCode;
  return { ...current, bindings };
}

export { updateBinding as rebindAction };

type SettingsListener = (settings: GameSettings) => void;

/** Small persistence facade for menus; framework-agnostic and testable. */
export class SettingsStore {
  private value: GameSettings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(private readonly storage: SettingsStorage | null = browserStorage()) {
    this.value = loadSettings(storage);
  }

  get(): GameSettings {
    return cloneSettings(this.value);
  }

  replace(settings: GameSettings): GameSettings {
    this.value = saveSettings(settings, this.storage);
    this.emit();
    return this.get();
  }

  update(patch: GameSettingsPatch): GameSettings {
    return this.replace(updateSettings(this.value, patch));
  }

  setBinding(
    player: PlayerSlot,
    action: ActionName,
    code: string,
  ): GameSettings {
    return this.replace(updateBinding(this.value, player, action, code));
  }

  reset(): GameSettings {
    this.value = resetSettings(this.storage);
    this.emit();
    return this.get();
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) listener(snapshot);
  }
}
