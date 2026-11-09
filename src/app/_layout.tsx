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

import { LockScreen } from '@/components/lock-screen';
import { ToastHost } from '@/components/toast';
import type { Palette } from '@/constants/theme';
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

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn && !needsHousehold}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-partner" options={{ presentation: 'modal' }} />
          <Stack.Screen name="account/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="account/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="transaction/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="transaction/transfer" options={{ presentation: 'modal' }} />
          <Stack.Screen name="transaction/split" options={{ presentation: 'modal' }} />
          <Stack.Screen name="budget/[envelopeId]" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="budget/envelope"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.85, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
            }}
          />
          <Stack.Screen
            name="theme-color"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
            }}
          />
          <Stack.Screen name="envelopes" options={{ presentation: 'modal' }} />
          <Stack.Screen name="envelopes/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="envelopes/group/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="categories" options={{ presentation: 'modal' }} />
          <Stack.Screen name="categories/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="rules" options={{ presentation: 'modal' }} />
          <Stack.Screen name="budget-start" options={{ presentation: 'modal' }} />
          <Stack.Screen name="rules/[id]" options={{ presentation: 'modal' }} />
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
