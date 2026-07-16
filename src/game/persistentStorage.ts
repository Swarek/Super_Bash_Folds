export interface PersistentStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}
interface CookieDocumentLike {
  cookie: string;
}

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function cookieValue(documentLike: CookieDocumentLike, key: string): string | null {
  const encodedKey = `${encodeURIComponent(key)}=`;
  const entry = documentLike.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedKey));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(encodedKey.length));
  } catch {
    return null;
  }
}

/**
 * Browser preferences use localStorage first and a year-long cookie as a
 * fallback. Some embedded/private browser contexts expose localStorage but
 * reject writes, which previously made remapped controls look saved until the
 * page was reopened.
 */
export function createPersistentBrowserStorage(): PersistentStorageLike | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  let primary: Storage | null = null;
  try {
    primary = window.localStorage;
  } catch {
    primary = null;
  }

  const cookieDocument = document as CookieDocumentLike;
  return {
    getItem(key): string | null {
      try {
        const stored = primary?.getItem(key) ?? null;
        if (stored !== null) return stored;
      } catch {
        // Fall through to the cookie copy.
      }
      const fallback = cookieValue(cookieDocument, key);
      if (fallback !== null) {
        try {
          primary?.setItem(key, fallback);
        } catch {
          // The cookie remains the durable source when storage is unavailable.
        }
      }
      return fallback;
    },
    setItem(key, value): void {
      try {
        primary?.setItem(key, value);
      } catch {
        // Cookie fallback below still preserves the preference.
      }
      try {
        cookieDocument.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
      } catch {
        // Preference persistence must never prevent the controls from working.
      }
    },
    removeItem(key): void {
      try {
        primary?.removeItem(key);
      } catch {
        // Also expire the cookie below.
      }
      try {
        cookieDocument.cookie = `${encodeURIComponent(key)}=; Path=/; Max-Age=0; SameSite=Lax`;
      } catch {
        // Reset still succeeds in memory.
      }
    },
  };
}
