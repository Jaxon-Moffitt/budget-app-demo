import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { IconButton } from '@/components/icon-button';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showToast } from '@/components/toast';
import { isHidden } from '@/domain/categories';
import { formatCents } from '@/domain/money';
import { monthName, type Month } from '@/domain/month';
import { fillPlan, leftover, payScheduleLabel, withLeftover } from '@/domain/paychecks';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentMonth, useBudget, useSetAssigned } from '@/lib/budget';

type Mode = 'paycheck' | 'month';
const MODES = [
  { value: 'paycheck', label: 'One paycheck' },
  { value: 'month', label: 'Rest of month' },
] as const;

/**
 * Modal from the Budget tab: when a paycheck comes in, fills envelopes from
 * Ready to assign by the monthly budget (each envelope's target) split by
 * the pay schedule, never past what an envelope still needs this month.
 */
export default function FillScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ month?: string }>();
  const month: Month = params.month ?? currentMonth();
  const budget = useBudget(month);
  const setAssigned = useSetAssigned();
  const [mode, setMode] = useState<Mode>('paycheck');
  const household = budget.household.data;
  const view = budget.view;
  const schedule = household?.paySchedule ?? 'twice_monthly';

  const envelopes = useMemo(
    () => (view ? view.groups.flatMap(g => g.envelopes.filter(e => !isHidden(g, e))) : []),
    [view],
  );
  const withTargets = envelopes.filter(e => (e.target ?? 0) > 0);
  // What the expected income leaves after the budget goes to the leftover
  // envelope, on top of its own monthly amount.
  const left = leftover(household?.expectedIncome ?? null, envelopes.map(e => e.target));
  const leftoverId = envelopes.some(e => e.id === household?.leftoverEnvelopeId) ? household!.leftoverEnvelopeId : null;
  const plan = useMemo(
    () =>
      view
        ? fillPlan(
            withLeftover(
              envelopes.map(e => ({ id: e.id, target: e.target, assigned: view.month.envelopes[e.id]?.assigned ?? 0 })),
              leftoverId,
              left,
            ),
            mode,
            schedule,
          )
        : [],
    [envelopes, view, mode, schedule, leftoverId, left],
  );
  const total = plan.reduce((s, l) => s + l.add, 0);
  const ready = view?.month.readyToAssign ?? 0;
  const names = new Map(envelopes.map(e => [e.id, e.name]));

  async function fill() {
    if (!household || plan.length === 0) return;
    try {
      await setAssigned.mutateAsync({
        householdId: household.id,
        month,
        amounts: plan.map(l => ({ envelopeId: l.id, assigned: l.assigned + l.add })),
      });
      showToast(`Filled ${plan.length} envelope${plan.length === 1 ? '' : 's'} with ${formatCents(total)}`);
      router.back();
    } catch {
      // setAssigned.error is shown below.
    }
  }

  const editPlan = () => router.push('/budget-plan');

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">
              {monthName(month)}
            </ThemedText>
            <ThemedText type="subtitle">Fill from budget</ThemedText>
          </View>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        {budget.isPending || !view ? (
          <ActivityIndicator />
        ) : withTargets.length === 0 && !(leftoverId && left !== null && left > 0) ? (
          <>
            <ThemedText themeColor="textSecondary">
              No monthly budget yet. Give your envelopes monthly amounts, and this fills them when a paycheck
              comes in.
            </ThemedText>
            <Button title="Set up the monthly budget" onPress={editPlan} />
          </>
        ) : (
          <>
            <Segmented<Mode> options={MODES} value={mode} onChange={setMode} />
            <ThemedText type="small" themeColor="textSecondary">
              {mode === 'paycheck'
                ? `Each envelope gets one paycheck’s share of its monthly budget (paid ${payScheduleLabel(schedule).toLowerCase()}), up to what it still needs for ${monthName(month)}.`
                : `Each envelope gets whatever it still needs to reach its monthly budget for ${monthName(month)}.`}
            </ThemedText>

            {plan.length === 0 ? (
              <ThemedText themeColor="accent">
                Every envelope already has its full budget for {monthName(month)}.
              </ThemedText>
            ) : (
              <>
                <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  {plan.map((l, i) => (
                    <View
                      key={l.id}
                      style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
                      <View style={styles.flex}>
                        <ThemedText numberOfLines={1} style={styles.name}>
                          {names.get(l.id)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatCents(l.assigned + l.add)} of {formatCents(l.target)} after this
                          {l.id === leftoverId && left !== null && left > 0 ? ' · includes the leftover' : ''}
                        </ThemedText>
                      </View>
                      <ThemedText themeColor="accent" style={styles.amount}>
                        +{formatCents(l.add)}
                      </ThemedText>
                    </View>
                  ))}
                </View>

                <View style={[styles.card, styles.summary, { backgroundColor: theme.backgroundElement }]}>
                  <View style={styles.summaryLine}>
                    <ThemedText style={styles.flex}>Total</ThemedText>
                    <ThemedText style={styles.total}>{formatCents(total)}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor={total > ready ? 'warning' : 'textSecondary'}>
                    {total > ready
                      ? `That’s ${formatCents(total - ready)} more than Ready to assign (${formatCents(ready)}). Fill anyway, or wait for the paycheck to arrive.`
                      : `Comes from Ready to assign (${formatCents(ready)}), leaving ${formatCents(ready - total)}.`}
                  </ThemedText>
                </View>

                <Button
                  title={`Fill ${plan.length} envelope${plan.length === 1 ? '' : 's'}`}
                  loading={setAssigned.isPending}
                  onPress={fill}
                />
              </>
            )}
            {setAssigned.error && (
              <ThemedText themeColor="danger">Couldn’t fill: {setAssigned.error.message}</ThemedText>
            )}
            <Button variant="plain" title="Edit monthly budget and pay schedule" onPress={editPlan} />
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  name: { fontWeight: 600 },
  amount: { fontWeight: 700, fontVariant: ['tabular-nums'] },
  summary: { padding: Spacing.three, gap: Spacing.one },
  summaryLine: { flexDirection: 'row', alignItems: 'baseline' },
  total: { fontSize: 22, fontWeight: 800, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
});
