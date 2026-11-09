import { applyStartupUpdate, type UpdatesApi } from '../updates';

function fakeApi(overrides: Partial<Record<keyof UpdatesApi, unknown>> = {}) {
  return {
    isEnabled: true,
    checkForUpdateAsync: jest.fn(async () => ({ isAvailable: true })),
    fetchUpdateAsync: jest.fn(async () => ({ isNew: true })),
    reloadAsync: jest.fn(async () => {}),
    ...overrides,
  } as unknown as UpdatesApi & Record<'checkForUpdateAsync' | 'fetchUpdateAsync' | 'reloadAsync', jest.Mock>;
}

describe('applyStartupUpdate', () => {
  afterEach(() => jest.useRealTimers());

  it('downloads and reloads into a new update', async () => {
    const api = fakeApi();
    await expect(applyStartupUpdate(api, { isDev: false })).resolves.toBe('reloaded');
    expect(api.fetchUpdateAsync).toHaveBeenCalled();
    expect(api.reloadAsync).toHaveBeenCalled();
  });

  it('does nothing in development', async () => {
    const api = fakeApi();
    await expect(applyStartupUpdate(api, { isDev: true })).resolves.toBe('skipped');
    expect(api.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('does nothing when updates are disabled (Expo Go)', async () => {
    const api = fakeApi({ isEnabled: false });
    await expect(applyStartupUpdate(api, { isDev: false })).resolves.toBe('skipped');
    expect(api.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('opens normally when already up to date', async () => {
    const api = fakeApi({ checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })) });
    await expect(applyStartupUpdate(api, { isDev: false })).resolves.toBe('up-to-date');
    expect(api.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(api.reloadAsync).not.toHaveBeenCalled();
  });

  it('fails silently when offline', async () => {
    const api = fakeApi({
      checkForUpdateAsync: jest.fn(async () => {
        throw new Error('Network request failed');
      }),
    });
    await expect(applyStartupUpdate(api, { isDev: false })).resolves.toBe('failed');
    expect(api.reloadAsync).not.toHaveBeenCalled();
  });

  it('fails silently when the download or reload fails', async () => {
    const download = fakeApi({
      fetchUpdateAsync: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(applyStartupUpdate(download, { isDev: false })).resolves.toBe('failed');

    const reload = fakeApi({
      reloadAsync: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(applyStartupUpdate(reload, { isDev: false })).resolves.toBe('failed');
  });

  it('stops waiting after the timeout and never reloads afterwards', async () => {
    jest.useFakeTimers();
    let finishCheck!: (value: { isAvailable: boolean }) => void;
    const api = fakeApi({
      checkForUpdateAsync: jest.fn(() => new Promise(resolve => (finishCheck = resolve))),
    });

    const result = applyStartupUpdate(api, { isDev: false, timeoutMs: 5000 });
    jest.advanceTimersByTime(5000);
    await expect(result).resolves.toBe('timed-out');

    // The server answers late with an update: it's downloaded for next
    // launch, but the running app isn't reloaded.
    finishCheck({ isAvailable: true });
    await jest.runAllTimersAsync();
    expect(api.fetchUpdateAsync).toHaveBeenCalled();
    expect(api.reloadAsync).not.toHaveBeenCalled();
  });
});
