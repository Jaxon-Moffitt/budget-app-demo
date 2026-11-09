import type * as Updates from 'expo-updates';

export type UpdatesApi = Pick<
  typeof Updates,
  'isEnabled' | 'checkForUpdateAsync' | 'fetchUpdateAsync' | 'reloadAsync'
>;

export type StartupUpdateResult = 'skipped' | 'up-to-date' | 'reloaded' | 'timed-out' | 'failed';

/**
 * How long launch waits on the update server. Past this the app opens on
 * the code it has; an update that finishes downloading later is applied by
 * expo-updates on the next launch instead of reloading mid-use.
 */
export const STARTUP_UPDATE_TIMEOUT_MS = 5000;

/**
 * Checks for an OTA update at launch and, if there is one, downloads it and
 * reloads into it so it applies on this launch rather than the next. Never
 * throws: offline, server errors and timeouts all just open the app as is.
 */
export async function applyStartupUpdate(
  api: UpdatesApi,
  { isDev, timeoutMs = STARTUP_UPDATE_TIMEOUT_MS }: { isDev: boolean; timeoutMs?: number },
): Promise<StartupUpdateResult> {
  // Dev servers and Expo Go serve their own JS; there's nothing to fetch.
  if (isDev || !api.isEnabled) return 'skipped';

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timed-out'>(resolve => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve('timed-out');
    }, timeoutMs);
  });

  const update = (async (): Promise<StartupUpdateResult> => {
    const check = await api.checkForUpdateAsync();
    if (!check.isAvailable) return 'up-to-date';
    const fetched = await api.fetchUpdateAsync();
    // Once the app is showing, don't yank it out from under the user.
    if (timedOut || !fetched.isNew) return 'up-to-date';
    await api.reloadAsync();
    return 'reloaded';
  })().catch((): StartupUpdateResult => 'failed');

  try {
    return await Promise.race([update, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
