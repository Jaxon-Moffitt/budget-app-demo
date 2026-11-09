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
 * bar, laid out below the screen rather than over it.
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
          <TabButton label="Budget" />
        </TabTrigger>
        <TabTrigger name="accounts" href="/accounts" asChild>
          <TabButton label="Accounts" />
        </TabTrigger>
        <TabTrigger name="transactions" href="/transactions" asChild>
          <TabButton label="Transactions" />
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton label="Settings" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

const TabButton = forwardRef<View, TabTriggerSlotProps & { label: string }>(function TabButton(
  { label, isFocused, ...props },
  ref,
) {
  const theme = useTheme();
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={styles.tab}>
      <View style={[styles.pill, isFocused && { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type={isFocused ? 'smallBold' : 'small'} themeColor={isFocused ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
});

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
  pill: { paddingHorizontal: Spacing.two + Spacing.one, paddingVertical: Spacing.one + Spacing.half, borderRadius: 16 },
});
