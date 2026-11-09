import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SHOW_MS = 2400;

let listener: ((message: string) => void) | null = null;

/** A short confirmation, like "Added $25.00 to Groceries", over whatever screen is showing. */
export function showToast(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
  listener?.(message);
}

/** Mounted once, in the root layout. */
export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The counter remounts the toast for each message, so it animates in again.
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    listener = message => {
      setToast(t => ({ message, key: (t?.key ?? 0) + 1 }));
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), SHOW_MS);
    };
    return () => {
      listener = null;
      clearTimeout(timer);
    };
  }, []);

  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + BottomTabInset + Spacing.three }]}>
      {toast && (
        <Animated.View
          key={toast.key}
          entering={FadeInDown.duration(220)}
          exiting={FadeOut.duration(250)}
          style={[styles.toast, { backgroundColor: theme.text }]}>
          <Icon name="done" size={18} color={theme.background} />
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {toast.message}
          </ThemedText>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    borderRadius: 20,
    maxWidth: '90%',
  },
});
