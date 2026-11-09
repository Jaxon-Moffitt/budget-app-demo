/**
 * The website keeps its session and settings in localStorage, since a
 * browser has no keychain. Reads and writes are wrapped because Safari can
 * refuse storage (private browsing, blocked site data).
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Without storage the person just signs in again next visit.
  }
}

export const authStorage = {
  getItem: async (key: string) => read(key),
  setItem: async (key: string, value: string) => write(key, value),
  removeItem: async (key: string) => write(key, null),
};

export const prefStorage = {
  getItem: async (key: string) => read(key),
  setItem: async (key: string, value: string) => write(key, value),
};
