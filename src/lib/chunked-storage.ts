/**
 * Supabase keeps the login session (a few KB of JSON) in a storage adapter.
 * The phone's keychain (expo-secure-store) only reliably holds about 2 KB per
 * value, so this splits a value across numbered keys.
 */
export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export const CHUNK_SIZE = 1800;

export function createChunkedStorage(store: KeyValueStore) {
  const countKey = (key: string) => `${key}.count`;
  const chunkKey = (key: string, index: number) => `${key}.${index}`;

  async function removeItem(key: string): Promise<void> {
    const count = Number((await store.getItemAsync(countKey(key))) ?? 0);
    await store.deleteItemAsync(countKey(key));
    for (let i = 0; i < count; i++) {
      await store.deleteItemAsync(chunkKey(key, i));
    }
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const countValue = await store.getItemAsync(countKey(key));
      if (countValue === null) return null;
      const chunks: string[] = [];
      for (let i = 0; i < Number(countValue); i++) {
        const chunk = await store.getItemAsync(chunkKey(key, i));
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join('');
    },

    async setItem(key: string, value: string): Promise<void> {
      await removeItem(key);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i++) {
        await store.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      // Written last so a half-finished write reads back as missing, not truncated.
      await store.setItemAsync(countKey(key), String(count));
    },

    removeItem,
  };
}
