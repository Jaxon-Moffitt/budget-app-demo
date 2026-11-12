import {
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LockScreen } from '@/components/lock-screen';
import { ToastHost } from '@/components/toast';
import { Spacing, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStartupUpdate } from '@/hooks/use-startup-update';
import { useTheme } from '@/hooks/use-theme';
import { useHousehold } from '@/lib/queries';
import { AppLockProvider, useAppLock } from '@/providers/app-lock-provider';
import { AppearanceProvider, useAppearance } from '@/providers/appearance-provider';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';

SplashScreen.preventAutoHideAsync();

/** Navigation's own colors (screen and modal backgrounds, headers) from our palette. */
function navigationTheme(base: Theme, colors: Palette): Theme {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

/** Inside AppearanceProvider, so a custom theme reaches navigation's colors too. */
function NavigationTheme({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const colors = useTheme();
  return (
    <ThemeProvider value={navigationTheme(colorScheme === 'dark' ? DarkTheme : DefaultTheme, colors)}>
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppearanceProvider>
      <NavigationTheme>
        <AuthProvider>
          <QueryProvider>
            <AppLockProvider>
              <RootNavigator />
            </AppLockProvider>
          </QueryProvider>
        </AuthProvider>
      </NavigationTheme>
    </AppearanceProvider>
  );
}

function RootNavigator() {
  const { session, initializing } = useAuth();
  const lock = useAppLock();
  const appearance = useAppearance();
  // Holds the splash screen while a new OTA update is fetched and applied.
  const updateChecked = useStartupUpdate();
  // If a font fails to load the system font stands in; don't hold the app.
  const [fontsLoaded, fontError] = useFonts({
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  const signedIn = session !== null;
  const household = useHousehold(signedIn);
  const ready =
    updateChecked &&
    !initializing &&
    lock.ready &&
    appearance.ready &&
    (fontsLoaded || fontError !== null) &&
    (!signedIn || !household.isPending);
  // Only a confirmed "no household" sends someone to set one up. If the
  // lookup failed (offline, say), show the tabs rather than a wrong prompt.
  const needsHousehold = signedIn && household.data === null;
  // Modals open full screen on Android and the web, and both draw under the
  // status bar (edge to edge; black-translucent on the iPhone home screen),
  // so they start below it with some breathing room. iOS shows them as cards.
  // On the web the form sheets open full screen too.
  const insets = useSafeAreaInsets();
  const belowStatusBar = { paddingTop: insets.top + Spacing.three };
  const modal = { presentation: 'modal', contentStyle: Platform.OS === 'ios' ? undefined : belowStatusBar } as const;
  const sheetTop = Platform.OS === 'web' ? belowStatusBar : undefined;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn && !needsHousehold}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-partner" options={modal} />
          <Stack.Screen name="account/new" options={modal} />
          <Stack.Screen name="account/[id]" options={modal} />
          <Stack.Screen name="transaction/new" options={modal} />
          <Stack.Screen name="transaction/[id]" options={modal} />
          <Stack.Screen name="transaction/transfer" options={modal} />
          <Stack.Screen name="transaction/split" options={modal} />
          <Stack.Screen name="budget/[envelopeId]" options={modal} />
          <Stack.Screen
            name="budget/envelope"
            options={{
              presentation: 'formSheet',
              contentStyle: sheetTop,
              sheetAllowedDetents: [0.85, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
            }}
          />
          <Stack.Screen
            name="theme-color"
            options={{
              presentation: 'formSheet',
              contentStyle: sheetTop,
              sheetAllowedDetents: [1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
            }}
          />
          <Stack.Screen name="envelopes" options={modal} />
          <Stack.Screen name="envelopes/[id]" options={modal} />
          <Stack.Screen name="envelopes/group/[id]" options={modal} />
          <Stack.Screen name="categories" options={modal} />
          <Stack.Screen name="categories/[id]" options={modal} />
          <Stack.Screen name="rules" options={modal} />
          <Stack.Screen name="budget-start" options={modal} />
          <Stack.Screen name="rules/[id]" options={modal} />
          <Stack.Screen name="analytics/category" options={modal} />
        </Stack.Protected>
        <Stack.Protected guard={needsHousehold}>
          <Stack.Screen name="create-household" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
      <ToastHost />
      {lock.locked && <LockScreen />}
    </>
  );
}
