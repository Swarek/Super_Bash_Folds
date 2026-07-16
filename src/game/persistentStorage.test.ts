import { afterEach, describe, expect, it, vi } from "vitest";
import { createPersistentBrowserStorage } from "./persistentStorage";

describe("persistent browser storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a cookie copy and restores local storage after a new session", () => {
    const values = new Map<string, string>();
    const localStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };
    let cookie = "";
    const documentLike = {
      get cookie() { return cookie; },
      set cookie(value: string) { cookie = value.split(";", 1)[0] ?? ""; },
    };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("document", documentLike);

    const firstSession = createPersistentBrowserStorage();
    firstSession?.setItem("controls", '{"attack":"KeyJ"}');
    values.clear();

    const reopenedSession = createPersistentBrowserStorage();
    expect(reopenedSession?.getItem("controls")).toBe('{"attack":"KeyJ"}');
    expect(values.get("controls")).toBe('{"attack":"KeyJ"}');
  });

  it("falls back to cookies when localStorage rejects access", () => {
    const localStorage = {
      getItem: vi.fn(() => { throw new Error("blocked"); }),
      setItem: vi.fn(() => { throw new Error("blocked"); }),
      removeItem: vi.fn(() => { throw new Error("blocked"); }),
    };
    let cookie = "";
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("document", {
      get cookie() { return cookie; },
      set cookie(value: string) { cookie = value.split(";", 1)[0] ?? ""; },
    });

    const storage = createPersistentBrowserStorage();
    storage?.setItem("gamepads", "custom-buttons");
    expect(storage?.getItem("gamepads")).toBe("custom-buttons");
  });
});
