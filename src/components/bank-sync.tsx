import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Settings section. The real app links banks through SimpleFIN Bridge and
 * syncs them on a schedule on the server; the demo explains that instead.
 */
export function BankSync() {
  const theme = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Bank sync
      </ThemedText>
      <ThemedText>Off in this demo</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        In the real app, bank accounts sync automatically through SimpleFIN Bridge on a
        schedule, on the server. Rules then file new transactions and match transfers between
        accounts. Here, everything is made-up data and resets when you reload the page.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
});
