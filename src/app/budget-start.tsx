import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/form';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showToast } from '@/components/toast';
import { addMonths, formatMonth, type Month } from '@/domain/month';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentMonth, useRestartBudget } from '@/lib/budget';
import { confirmDestructive } from '@/lib/confirm';
import { useHousehold } from '@/lib/queries';

/**
 * Modal from Settings: start the budget over from a new month. Nothing is
 * deleted; older transactions become archive and the money in your
 * accounts at that point becomes Ready to assign.
 */
export default function BudgetStartScreen() {
  const theme = useTheme();
  const household = useHousehold(true);
  const restart = useRestartBudget();
  const thisMonth = currentMonth();
  const options = [-1, 0, 1].map(step => {
    const month = addMonths(thisMonth, step);
    return { value: month, label: formatMonth(month) };
  });
  const [month, setMonth] = useState<Month>(thisMonth);
  const [clear, setClear] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!household.data) return <ActivityIndicator style={styles.loading} />;
  const { id: householdId, budgetStart } = household.data;

  function confirm() {
    confirmDestructive(
      `Start fresh in ${formatMonth(month)}?`,
      `Transactions before ${formatMonth(month)} will be archived, and the money in your accounts then becomes Ready to assign.` +
        (clear ? ' Every envelope’s starting balance goes back to $0.' : '') +
        ' Your bank data isn’t deleted.',
      'Start fresh',
      async () => {
        setError(null);
        try {
          await restart.mutateAsync({ householdId, month, clearStartingBalances: clear });
          showToast(`Budget starts in ${formatMonth(month)}`);
          router.back();
        } catch (e) {
          setError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Start fresh</ThemedText>
        {budgetStart && (
          <ThemedText themeColor="textSecondary">Your budget now starts in {formatMonth(budgetStart)}.</ThemedText>
        )}

        <ThemedText type="smallBold" style={styles.label}>
          New first month
        </ThemedText>
        <Segmented<Month> options={options} value={month} onChange={setMonth} />

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">What happens</ThemedText>
          <ThemedText type="small">
            • Transactions before {formatMonth(month)} are archived. They stay in your account
            balances and can still be seen at the bottom of the Transactions tab, but they leave
            To review.
          </ThemedText>
          <ThemedText type="small">
            • Everything in your budget accounts at the start of {formatMonth(month)} becomes Ready
            to assign.
          </ThemedText>
          <ThemedText type="small">
            • Envelopes start over. Tap each one on the Budget tab and use Starting to give it what
            it already holds, like your emergency fund.
          </ThemedText>
          <ThemedText type="small">
            • Nothing is deleted. Moving the start back later brings the older months back.
          </ThemedText>
        </View>

        <View style={[styles.switchRow, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.flex}>
            <ThemedText>Clear starting balances</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Sets every envelope’s starting balance to $0, so you enter them fresh.
            </ThemedText>
          </View>
          <Switch value={clear} onValueChange={setClear} accessibilityLabel="Clear starting balances" />
        </View>

        {error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        )}
        <Button
          title={month === budgetStart ? `Already starts in ${formatMonth(month)}` : `Start fresh in ${formatMonth(month)}`}
          disabled={month === budgetStart && !clear}
          loading={restart.isPending}
          onPress={confirm}
        />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  label: { marginTop: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two, marginTop: Spacing.two },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
  },
  flex: { flex: 1 },
});
