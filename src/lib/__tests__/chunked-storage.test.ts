import { CHUNK_SIZE, createChunkedStorage } from '../chunked-storage';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (key: string) => data.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void data.set(key, value),
    deleteItemAsync: async (key: string) => void data.delete(key),
  };
}

describe('createChunkedStorage', () => {
  it('round-trips a value larger than one chunk', async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store);
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 5);
    await storage.setItem('session', value);
    expect(store.data.get('session.count')).toBe('3');
    await expect(storage.getItem('session')).resolves.toBe(value);
  });

  it('removes leftover chunks when a value shrinks', async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('session', 'x'.repeat(CHUNK_SIZE * 3));
    await storage.setItem('session', 'short');
    expect([...store.data.keys()].sort()).toEqual(['session.0', 'session.count']);
    await expect(storage.getItem('session')).resolves.toBe('short');
  });

  it('returns null for a missing or partial value', async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store);
    await expect(storage.getItem('session')).resolves.toBeNull();
    store.data.set('session.count', '2');
    store.data.set('session.0', 'abc');
    await expect(storage.getItem('session')).resolves.toBeNull();
  });

  it('removes every chunk', async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('session', 'x'.repeat(CHUNK_SIZE + 1));
    await storage.removeItem('session');
    expect(store.data.size).toBe(0);
  });
});
