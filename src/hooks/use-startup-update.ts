import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';

import { applyStartupUpdate } from '@/lib/updates';

/**
 * True once the launch-time update check is over and the app should show.
 * Stays false while reloading into a new update, so the splash screen covers
 * the restart.
 */
export function useStartupUpdate(): boolean {
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    applyStartupUpdate(Updates, { isDev: __DEV__ }).then(result => {
      if (active && result !== 'reloaded') setDone(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return done;
}
