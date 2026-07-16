import { describe, expect, it } from "vitest";
import {
  SETTINGS_STORAGE_KEY,
  SettingsStore,
  createDefaultSettings,
  loadSettings,
  resetSettings,
  sanitizeSettings,
  saveSettings,
  updateBinding,
  updateSettings,
  type SettingsStorage,
} from "./settings";

class MemoryStorage implements SettingsStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("settings", () => {
  it("returns independent defaults", () => {
    const first = createDefaultSettings();
    const second = createDefaultSettings();
    first.bindings[0].attack = "Space";
    expect(second.bindings[0].attack).toBe("KeyF");
  });

  it("validates types and clamps normalized settings", () => {
    const settings = sanitizeSettings({
      musicVolume: 4,
      effectsVolume: -2,
      shake: Number.NaN,
      flashes: 0.25,
      items: false,
      itemFrequency: "extreme",
      tutorialSeen: true,
    });
    expect(settings).toMatchObject({
      musicVolume: 1,
      effectsVolume: 0,
      shake: 0.7,
      flashes: 0.25,
      items: false,
      itemFrequency: "medium",
      tutorialSeen: true,
    });
  });

  it("loads defaults from absent/corrupt storage and sanitized valid JSON", () => {
    const storage = new MemoryStorage();
    expect(loadSettings(storage)).toEqual(createDefaultSettings());

    storage.setItem(SETTINGS_STORAGE_KEY, "{broken");
    expect(loadSettings(storage)).toEqual(createDefaultSettings());

    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...createDefaultSettings(), musicVolume: 0.31 }),
    );
    expect(loadSettings(storage).musicVolume).toBe(0.31);
  });

  it("saves only validated values and can reset persistence", () => {
    const storage = new MemoryStorage();
    const unsafe = { ...createDefaultSettings(), effectsVolume: 12 };
    const saved = saveSettings(unsafe, storage);
    expect(saved.effectsVolume).toBe(1);
    expect(loadSettings(storage).effectsVolume).toBe(1);

    expect(resetSettings(storage)).toEqual(createDefaultSettings());
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it("swaps colliding rebinds instead of disabling another action", () => {
    const original = createDefaultSettings();
    const rebound = updateBinding(original, 0, "attack", "KeyG");
    expect(rebound.bindings[0].attack).toBe("KeyG");
    expect(rebound.bindings[0].special).toBe("KeyF");
    expect(original.bindings[0].attack).toBe("KeyF");
  });

  it("applies immutable patches", () => {
    const original = createDefaultSettings();
    const updated = updateSettings(original, {
      musicVolume: -1,
      items: false,
    });
    expect(updated.musicVolume).toBe(0);
    expect(updated.items).toBe(false);
    expect(original.musicVolume).toBe(0.72);
    expect(original.items).toBe(true);
  });

  it("provides a persistent observable store for menus", () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    const observed: number[] = [];
    const unsubscribe = store.subscribe((settings) => {
      observed.push(settings.musicVolume);
    });

    store.update({ musicVolume: 0.42 });
    unsubscribe();
    store.update({ musicVolume: 0.2 });
    expect(observed).toEqual([0.42]);
    expect(loadSettings(storage).musicVolume).toBe(0.2);
  });
});
