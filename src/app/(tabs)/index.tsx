import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FillBar } from '@/components/fill-bar';
import { Button } from '@/components/form';
import { IconButton } from '@/components/icon-button';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isHidden } from '@/domain/categories';
import { envelopeView, type EnvelopeView } from '@/domain/envelope';
import { formatCents } from '@/domain/money';
import { addMonths, formatMonth, monthName, type Month } from '@/domain/month';
import { BottomTabInset, Spacing, STATUS_COLOR } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentMonth, useBudget, useSetAssigned, useSetBudgetStart, type BudgetView } from '@/lib/budget';
import type { Household } from '@/lib/queries';

/** Planning ahead is allowed a couple of months past today. */
const MONTHS_AHEAD = 2;

export default function BudgetScreen() {
  const [month, setMonth] = useState<Month>(currentMonth());
  const budget = useBudget(month);
  const household = budget.household.data;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {budget.isPending || !household ? (
          <ActivityIndicator style={styles.loading} />
        ) : budget.error ? (
          <ThemedText themeColor="danger" style={styles.content}>
            Couldn’t load the budget: {budget.error.message}
          </ThemedText>
        ) : !household.budgetStart || !budget.view ? (
          <StartBudgeting household={household} />
        ) : (
          <BudgetMonthView
            view={budget.view}
            household={household}
            month={month < budget.view.start ? budget.view.start : month}
            onMonth={setMonth}
            onRefresh={budget.refetch}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function StartBudgeting({ household }: { household: Household }) {
  const setStart = useSetBudgetStart();
  const thisMonth = currentMonth();
  const options = [
    { value: thisMonth, label: formatMonth(thisMonth) },
    { value: addMonths(thisMonth, -1), label: formatMonth(addMonths(thisMonth, -1)) },
  ];
  const [choice, setChoice] = useState<Month>(thisMonth);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="subtitle">Budget</ThemedText>
      <ThemedText>Choose the first month you’ll budget.</ThemedText>
      <ThemedText themeColor="textSecondary">
        Everything in your budget accounts before that month becomes your starting Ready to
        assign: money you have now, ready to give a job. Give envelopes like Emergency fund a
        starting balance from it. Earlier transactions stay in your history.
      </ThemedText>
      <Segmented<Month> options={options} value={choice} onChange={setChoice} />
      {setStart.error && (
        <ThemedText themeColor="danger">Couldn’t save: {setStart.error.message}</ThemedText>
      )}
      <Button
        title={`Start budgeting in ${formatMonth(choice)}`}
        loading={setStart.isPending}
        onPress={() => setStart.mutate({ householdId: household.id, month: choice })}
      />
    </ScrollView>
  );
}

function BudgetMonthView({
  view,
  household,
  month,
  onMonth,
  onRefresh,
}: {
  view: BudgetView;
  household: Household;
  month: Month;
  onMonth(month: Month): void;
  onRefresh(): Promise<unknown>;
}) {
  const theme = useTheme();
  const setAssigned = useSetAssigned();
  const [refreshing, setRefreshing] = useState(false);
  const { month: data, groups } = view;
  const latest = addMonths(currentMonth(), MONTHS_AHEAD);

  const targets = groups
    .flatMap(g => g.envelopes.filter(e => !isHidden(g, e)))
    .filter(e => (e.target ?? 0) > 0);
  const nothingAssigned = Object.values(data.envelopes).every(e => e.assigned === 0);
  const overspent = view.envelopes.filter(e => (data.envelopes[e.id]?.balance ?? 0) < 0);

  async function refresh() {
    setRefreshing(true);
    await onRefresh().catch(() => {});
    setRefreshing(false);
  }

  function fillFromTargets() {
    setAssigned.mutate({
      householdId: household.id,
      month,
      amounts: targets.map(e => ({ envelopeId: e.id, assigned: e.target as number })),
    });
  }

  const open = (envelopeId: string) =>
    router.push({ pathname: '/budget/envelope', params: { envelopeId, month } });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.semibold}>
            Budget · {month.slice(0, 4)}
          </ThemedText>
          <ThemedText style={styles.monthTitle} accessibilityRole="header">
            {monthName(month)}
          </ThemedText>
        </View>
        <View style={styles.monthButtons}>
          <IconButton icon="back" label="Previous month" disabled={month <= view.start} onPress={() => onMonth(addMonths(month, -1))} />
          <IconButton icon="forward" label="Next month" disabled={month >= latest} onPress={() => onMonth(addMonths(month, 1))} />
        </View>
      </View>

      <ReadyToAssign view={view} month={month} />

      {overspent.length > 0 && (
        <ThemedText type="small" themeColor="danger" style={styles.notice} accessibilityLiveRegion="polite">
          {overspent.length === 1
            ? `${overspent[0].name} is overspent by ${formatCents(-data.overspent)}.`
            : `${overspent.length} envelopes are overspent by ${formatCents(-data.overspent)} in all.`}{' '}
          Tap {overspent.length === 1 ? 'it' : 'one'} to cover it from another envelope.
        </ThemedText>
      )}

      {nothingAssigned && targets.length > 0 && (
        <Button
          variant="tonal"
          title={`Fill from targets (${formatCents(targets.reduce((s, e) => s + (e.target ?? 0), 0))})`}
          loading={setAssigned.isPending}
          onPress={fillFromTargets}
        />
      )}
      {setAssigned.error && (
        <ThemedText themeColor="danger">Couldn’t save: {setAssigned.error.message}</ThemedText>
      )}

      {groups.map(group => {
        const rows = group.envelopes.map(e => ({ envelope: e, v: envelopeView(data.envelopes[e.id]) }));
        const total = rows.reduce((sum, r) => sum + r.v.balance, 0);
        const over = rows.filter(r => r.v.status === 'over').length;
        return (
          <View key={group.id} style={styles.groupBlock}>
            <View style={styles.groupHeader} accessibilityRole="header">
              <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.flex, styles.caps]}>
                {group.name}
              </ThemedText>
              <ThemedText type="small" themeColor={over > 0 ? 'danger' : 'textSecondary'} style={[styles.semibold, styles.amount]}>
                {formatCents(total)}{over > 0 ? ` · ${over} overspent` : ''}
              </ThemedText>
            </View>
            <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
              {rows.map(({ envelope, v }, i) => (
                <EnvelopeRow
                  key={envelope.id}
                  name={isHidden(group, envelope) ? `${envelope.name} (hidden)` : envelope.name}
                  v={v}
                  first={i === 0}
                  border={theme.border}
                  onPress={() => open(envelope.id)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** The one number that matters most: money that still needs an envelope. */
function ReadyToAssign({ view, month }: { view: BudgetView; month: Month }) {
  const theme = useTheme();
  const { month: data } = view;
  const ready = data.readyToAssign;
  const over = ready < 0;
  const past = month < currentMonth();
  const income = data.income;
  const spent = 0 - data.spending;
  const invested = 0 - data.invested;
  const incomeLabel = past ? 'Income' : 'Income so far';
  const spentLabel = past ? 'Spent' : 'Spent so far';
  const hint = over
    ? 'More is assigned than you have. Take money back out of an envelope to balance.'
    : ready === 0
      ? 'Every dollar has a job.'
      : 'Tap an envelope to give these dollars a job.';
  // The card turns red when over, and its text has to read on that too.
  const onCard = over ? theme.onDanger : theme.onHero;
  const ink = { color: onCard };

  return (
    <View
      accessible
      accessibilityLabel={`${over ? 'Assigned too much' : 'Ready to assign'}: ${formatCents(ready)}. ${incomeLabel}: ${formatCents(income)}. ${spentLabel}: ${formatCents(spent)}.${invested !== 0 ? ` Invested: ${formatCents(invested)}.` : ''} ${hint}`}
      style={[styles.hero, { backgroundColor: over ? theme.danger : theme.hero }]}>
      <ThemedText style={[ink, styles.semibold, styles.soft]}>{over ? 'Assigned too much' : 'Ready to assign'}</ThemedText>
      <ThemedText style={[ink, styles.heroAmount]}>{formatCents(ready)}</ThemedText>
      <ThemedText type="small" style={[ink, styles.soft]}>
        {hint}
      </ThemedText>
      <View style={[styles.divider, { backgroundColor: onCard }]} />
      <View style={styles.stats}>
        <Stat label={incomeLabel} value={income} color={onCard} />
        {invested !== 0 && <Stat label="Invested" value={invested} color={onCard} center />}
        <Stat label={spentLabel} value={spent} color={onCard} end />
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  color,
  center,
  end,
}: {
  label: string;
  value: number;
  color: string;
  center?: boolean;
  end?: boolean;
}) {
  return (
    <View style={[styles.stat, center && styles.statCenter, end && styles.statEnd]}>
      <ThemedText type="small" style={[{ color }, styles.faint]}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={[{ color }, styles.amount]}>
        {formatCents(value)}
      </ThemedText>
    </View>
  );
}

/** The second line of an envelope row: this month's money in and out. */
function detailFor(v: EnvelopeView): string {
  if (v.status === 'over') return `Overspent · tap to cover`;
  const parts = [
    v.added !== 0 ? `${v.added > 0 ? '+' : '−'}${formatCents(Math.abs(v.added))} added` : null,
    v.received !== 0 ? `+${formatCents(v.received)} income` : null,
    v.spent !== 0 ? `${formatCents(v.spent)} spent` : null,
    v.invested !== 0 ? `${formatCents(v.invested)} invested` : null,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  return v.balance === 0 ? 'Nothing added yet' : 'Nothing added or spent this month';
}

function EnvelopeRow({
  name,
  v,
  first,
  border,
  onPress,
}: {
  name: string;
  v: EnvelopeView;
  first: boolean;
  border: string;
  onPress(): void;
}) {
  const theme = useTheme();
  const color = STATUS_COLOR[v.status];
  const detail = detailFor(v);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}: ${formatCents(v.balance)}${v.status === 'over' ? ' overspent' : ' left'}. ${detail}`}
      accessibilityHint="Add money or see this month’s transactions"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: border },
        pressed && styles.dim,
      ]}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <ThemedText numberOfLines={1} style={styles.rowName}>
            {name}
          </ThemedText>
          <ThemedText type="small" themeColor={v.status === 'over' ? 'danger' : 'textSecondary'} numberOfLines={1}>
            {detail}
          </ThemedText>
        </View>
        <ThemedText themeColor={color} style={styles.rowAmount}>
          {formatCents(v.balance)}
        </ThemedText>
      </View>
      <FillBar fill={v.fill} color={theme[color]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.one },
  monthTitle: { fontSize: 30, lineHeight: 36, fontWeight: 800, letterSpacing: -0.6 },
  monthButtons: { flexDirection: 'row', gap: Spacing.two, paddingBottom: Spacing.one },
  hero: { borderRadius: 24, padding: Spacing.three + Spacing.one, gap: Spacing.one + Spacing.half },
  heroAmount: { fontSize: 44, lineHeight: 50, fontWeight: 800, letterSpacing: -1.1, fontVariant: ['tabular-nums'] },
  soft: { opacity: 0.85 },
  faint: { opacity: 0.75 },
  divider: { height: StyleSheet.hairlineWidth * 2, opacity: 0.2, marginVertical: Spacing.two },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, gap: Spacing.half },
  statCenter: { alignItems: 'center' },
  statEnd: { alignItems: 'flex-end' },
  notice: { paddingHorizontal: Spacing.two },
  groupBlock: { gap: Spacing.two, marginTop: Spacing.one },
  groupHeader: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 0.8 },
  group: { borderRadius: 20, overflow: 'hidden' },
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three - 2, gap: Spacing.two + 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  rowName: { fontWeight: 600 },
  rowAmount: { fontSize: 17, fontWeight: 700, fontVariant: ['tabular-nums'] },
  semibold: { fontWeight: 600 },
  flex: { flex: 1 },
  amount: { fontVariant: ['tabular-nums'] },
  dim: { opacity: 0.5 },
});
