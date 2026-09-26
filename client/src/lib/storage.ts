// Storage is optional: sandboxed previews / privacy settings may deny it.
// A memory fallback keeps auth, invite navigation and drafts usable in the tab.
function createStorage(kind: 'local' | 'session') {
  const memory = new Map<string, string>();
  let unavailable = false;
  const native = (): Storage | null => {
    if (unavailable || import.meta.env.VITE_EPHEMERAL_PREVIEW === 'true') return null;
    try { return kind === 'local' ? window.localStorage : window.sessionStorage; }
    catch { unavailable = true; return null; }
  };
  return {
    getItem(key: string) {
      try {
        const storage = native();
        if (storage) {
          const value = storage.getItem(key);
          if (value !== null) memory.set(key, value);
          return value;
        }
      } catch { unavailable = true; }
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
      try {
        const storage = native();
        if (storage) { storage.setItem(key, value); return true; }
      } catch { unavailable = true; }
      return false;
    },
    removeItem(key: string) {
      memory.delete(key);
      try { native()?.removeItem(key); } catch { unavailable = true; }
    },
    keys() {
      try { const storage = native(); if (storage) return Object.keys(storage); } catch {}
      return [...memory.keys()];
    },
  };
}
export const localStore = createStorage('local');
export const sessionStore = createStorage('session');
