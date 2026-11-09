import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, useColorScheme as useSystemColorScheme } from 'react-native';

import { Colors, type ColorSchemePreference, type Palette } from '@/constants/theme';
import { deriveTheme, isDark, normalizeHex, type ThemeSeeds } from '@/domain/colors';
import { prefStorage } from '@/lib/storage';

const PREF_KEY = 'color-scheme';
const SEEDS_KEY = 'custom-theme';

const SEED_KEYS = ['background', 'card', 'accent', 'hero'] as const;

type AppearanceContextValue = {
  /** False until the saved choice is applied; hold the UI so it doesn't flash the wrong theme. */
  ready: boolean;
  preference: ColorSchemePreference;
  setPreference(preference: ColorSchemePreference): Promise<void>;
  /** The four picked colors, once Custom has been chosen at least once. */
  seeds: ThemeSeeds | null;
  /** The full custom palette while Custom is selected, else null. */
  palette: Palette | null;
  /** Light or dark, after applying the choice; what useColorScheme() returns. */
  colorScheme: 'light' | 'dark';
  setSeed(key: keyof ThemeSeeds, hex: string): Promise<void>;
  /** Starts the custom colors over from the light or dark theme. */
  resetSeeds(from: 'light' | 'dark'): Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function seedsFrom(palette: Palette): ThemeSeeds {
  return {
    background: palette.background,
    card: palette.backgroundElement,
    accent: palette.accent,
    hero: palette.hero,
  };
}

/** Saved seeds, or null if missing or not four valid colors. */
function parseSeeds(saved: string | null): ThemeSeeds | null {
  if (!saved) return null;
  try {
    const raw = JSON.parse(saved);
    return Object.fromEntries(SEED_KEYS.map(k => [k, normalizeHex(String(raw[k]))])) as ThemeSeeds;
  } catch {
    return null;
  }
}

/** A custom theme still sets light or dark, so native pieces match its background. */
function schemeFor(seeds: ThemeSeeds): 'light' | 'dark' {
  return isDark(seeds.background) ? 'dark' : 'light';
}

/**
 * Forces native pieces (switches, alerts, tab bar, date picker) to a scheme.
 * react-native-web has no setColorScheme; the web reads `colorScheme` from
 * this provider instead.
 */
function forceScheme(scheme: 'light' | 'dark' | 'unspecified') {
  if (Platform.OS !== 'web') Appearance.setColorScheme(scheme);
}

/**
 * Light, dark, follow the phone, or custom colors. Appearance.setColorScheme
 * overrides the scheme for the whole app, so useColorScheme() and native
 * pieces (switches, alerts, the tab bar, the date picker) all follow it; a
 * custom theme sets whichever of the two matches its background. Stored per
 * phone, not per household: each partner picks their own.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [preference, setPref] = useState<ColorSchemePreference>('system');
  const [seeds, setSeeds] = useState<ThemeSeeds | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [saved, savedSeeds] = await Promise.all([
          prefStorage.getItem(PREF_KEY),
          prefStorage.getItem(SEEDS_KEY),
        ]);
        const parsed = parseSeeds(savedSeeds);
        setSeeds(parsed);
        if (saved === 'light' || saved === 'dark') {
          forceScheme(saved);
          setPref(saved);
        } else if (saved === 'custom' && parsed) {
          forceScheme(schemeFor(parsed));
          setPref('custom');
        }
      } catch (error) {
        // Following the phone's setting is a fine fallback.
        console.warn('Loading the color scheme failed', error);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const saveSeeds = useCallback(async (next: ThemeSeeds, apply: boolean) => {
    setSeeds(next);
    if (apply) forceScheme(schemeFor(next));
    await prefStorage.setItem(SEEDS_KEY, JSON.stringify(next));
  }, []);

  const setPreference = useCallback(
    async (next: ColorSchemePreference) => {
      if (next === 'custom') {
        // First time: start from whatever the screen shows right now.
        const start = seeds ?? seedsFrom(Colors[Appearance.getColorScheme() === 'dark' ? 'dark' : 'light']);
        setPref('custom');
        await saveSeeds(start, true);
      } else {
        forceScheme(next === 'system' ? 'unspecified' : next);
        setPref(next);
      }
      await prefStorage.setItem(PREF_KEY, next);
    },
    [seeds, saveSeeds],
  );

  const setSeed = useCallback(
    async (key: keyof ThemeSeeds, hex: string) => {
      if (!seeds) return;
      await saveSeeds({ ...seeds, [key]: normalizeHex(hex) }, preference === 'custom');
    },
    [seeds, saveSeeds, preference],
  );

  const resetSeeds = useCallback(
    (from: 'light' | 'dark') => saveSeeds(seedsFrom(Colors[from]), preference === 'custom'),
    [saveSeeds, preference],
  );

  const palette = useMemo(() => {
    if (preference !== 'custom' || !seeds) return null;
    return deriveTheme(seeds, Colors[schemeFor(seeds)]);
  }, [preference, seeds]);

  const system = useSystemColorScheme();
  const colorScheme =
    preference === 'light' || preference === 'dark'
      ? preference
      : preference === 'custom' && seeds
        ? schemeFor(seeds)
        : system === 'dark'
          ? 'dark'
          : 'light';

  return (
    <AppearanceContext.Provider
      value={{ ready, preference, setPreference, seeds, palette, colorScheme, setSeed, resetSeeds }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used inside AppearanceProvider');
  return context;
}

/** Light or dark as chosen in Settings; follows the phone outside the provider. */
export function useResolvedColorScheme(): 'light' | 'dark' {
  const system = useSystemColorScheme();
  return useContext(AppearanceContext)?.colorScheme ?? (system === 'dark' ? 'dark' : 'light');
}

/** The custom palette when it's in use; null outside the provider or for light/dark. */
export function useCustomPalette(): Palette | null {
  return useContext(AppearanceContext)?.palette ?? null;
}
