import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The "In budget" switch row shared by the add and edit account forms. */
export function InBudgetSwitch({ value, onChange }: { value: boolean; onChange(value: boolean): void }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.text}>
        <ThemedText>In budget</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Money in budget accounts goes into envelopes. Off-budget accounts, like
          investments, are tracked but not budgeted.
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel="In budget" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: 12,
  },
  text: { flex: 1, gap: Spacing.half },
});
