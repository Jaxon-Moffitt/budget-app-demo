import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState, Platform } from 'react-native';

import { biometricLabel, shouldLockOnResume } from '@/lib/biometrics';
import { prefStorage } from '@/lib/storage';

import { useAuth } from './auth-provider';

const PREF_KEY = 'biometric-unlock';

type AppLockContextValue = {
  /** False until the saved preference has loaded; hold the UI until then so nothing flashes before the lock. */
  ready: boolean;
  /** The phone has biometrics set up. */
  available: boolean;
  /** "Face ID", "fingerprint", etc. */
  label: string;
  enabled: boolean;
  locked: boolean;
  unlock(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

/**
 * Optional biometric lock. When turned on, the app asks for Face ID /
 * fingerprint on launch and after LOCK_AFTER_MS in the background. The
 * password is still the real credential; biometrics only gate opening the
 * app on a phone that's already signed in.
 */
export function AppLockProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [available, setAvailable] = useState(false);
  const [label, setLabel] = useState('biometrics');
  // null = the user hasn't been asked yet.
  const [pref, setPref] = useState<boolean | null>(null);
  const [prefLoaded, setPrefLoaded] = useState(false);
  const [locked, setLocked] = useState(true);
  const backgroundedAt = useRef<number | null>(null);
  const hadSession = useRef<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [hasHardware, enrolled, types, saved] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
          prefStorage.getItem(PREF_KEY),
        ]);
        setAvailable(hasHardware && enrolled);
        setLabel(biometricLabel(types, Platform.OS));
        setPref(saved === null ? null : saved === 'true');
      } catch (error) {
        // Without biometrics the app still works with password sign-in.
        console.warn('Biometric setup failed', error);
      } finally {
        setPrefLoaded(true);
      }
    })();
  }, []);

  const enabled = available && pref === true;

  const authenticate = useCallback(
    async (promptMessage: string) => {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancel',
        // Falls back to the phone's passcode if biometrics fail a few times.
        disableDeviceFallback: false,
      });
      return result.success;
    },
    [],
  );

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (next && !(await authenticate(`Turn on ${label} unlock`))) return;
      await prefStorage.setItem(PREF_KEY, String(next));
      setPref(next);
    },
    [authenticate, label],
  );

  const offerBiometrics = useCallback(() => {
    Alert.alert(`Unlock with ${label}?`, `Use ${label} instead of your password to open the app.`, [
      { text: 'Not now', style: 'cancel', onPress: () => void setEnabled(false) },
      { text: 'Turn on', onPress: () => void setEnabled(true) },
    ]);
  }, [label, setEnabled]);

  // Only a cold start with a saved session should begin locked; signing in
  // with a password just now is proof enough. Later runs (pref or enabled
  // changing) fall through both branches because hadSession is unchanged.
  useEffect(() => {
    if (!prefLoaded) return;
    const signedIn = session !== null;
    if (hadSession.current === null) {
      setLocked(signedIn && enabled);
    } else if (!hadSession.current && signedIn) {
      setLocked(false);
      if (available && pref === null) offerBiometrics();
    }
    hadSession.current = signedIn;
  }, [session, prefLoaded, enabled, available, pref, offerBiometrics]);

  useEffect(() => {
    // Only 'background' counts: iOS goes 'inactive' while the Face ID prompt is up.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        if (enabled && shouldLockOnResume(backgroundedAt.current, Date.now())) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, [enabled]);

  const unlock = useCallback(async () => {
    if (await authenticate('Unlock Budget')) setLocked(false);
  }, [authenticate]);

  const value: AppLockContextValue = {
    ready: prefLoaded,
    available,
    label,
    enabled,
    locked: session !== null && enabled && locked,
    unlock,
    setEnabled,
  };

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const context = useContext(AppLockContext);
  if (!context) throw new Error('useAppLock must be used inside AppLockProvider');
  return context;
}
