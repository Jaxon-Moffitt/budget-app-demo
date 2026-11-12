import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Web version of the tab bar. The native tabs render as a strip of pills
 * across the top in a browser, so the website gets an ordinary bottom tab
 * bar, laid out below the screen rather than over it. Icons only, the same
 * Material icons as the Android app; five text labels don't fit a phone.
 */
export default function AppTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs style={styles.container}>
      <TabSlot style={styles.container} />
      <View accessibilityRole="text" style={[styles.demo, { backgroundColor: theme.chip, borderTopColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.demoText}>
          Demo with made-up data. Changes reset when you reload.
        </ThemedText>
      </View>
      <TabList
        style={[
          styles.bar,
          { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: insets.bottom },
        ]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton label="Budget" icon="budget" />
        </TabTrigger>
        <TabTrigger name="transactions" href="/transactions" asChild>
          <TabButton label="Transactions" icon="transactions" />
        </TabTrigger>
        <TabTrigger name="analytics" href="/analytics" asChild>
          <TabButton label="Analytics" icon="analytics" />
        </TabTrigger>
        <TabTrigger name="accounts" href="/accounts" asChild>
          <TabButton label="Accounts" icon="accounts" />
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton label="Settings" icon="settings" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

/** Material Icons (Apache 2.0) on a 24-unit grid, matching the Android tab icons. */
const ICONS = {
  budget:
    'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z',
  transactions: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  analytics: 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z',
  accounts: 'M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z',
  settings:
    'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
} as const;

const TabButton = forwardRef<View, TabTriggerSlotProps & { label: string; icon: keyof typeof ICONS }>(
  function TabButton({ label, icon, isFocused, ...props }, ref) {
    const theme = useTheme();
    return (
      <Pressable
        ref={ref}
        {...props}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: isFocused }}
        style={styles.tab}>
        <View style={[styles.pill, isFocused && { backgroundColor: theme.backgroundElement }]}>
          {/* A plain DOM svg: this file only runs in the browser. */}
          <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
            <path d={ICONS[icon]} fill={isFocused ? theme.text : theme.textSecondary} />
          </svg>
        </View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  demo: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  demoText: { textAlign: 'center' },
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.one },
  pill: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.one + Spacing.half, borderRadius: 16 },
});
