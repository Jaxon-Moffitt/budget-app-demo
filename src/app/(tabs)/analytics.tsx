import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FillBar } from '@/components/fill-bar';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { monthTotals, spendingByCategory, topPayees, type MonthTotals } from '@/domain/analytics';
import { formatCents } from '@/domain/money';
import { addMonths, monthName, monthRange, type Month } from '@/domain/month';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAnalyticsRows, useUncategorizedCount } from '@/lib/analytics';
import { currentMonth } from '@/lib/budget';
import { useCategories, useHousehold } from '@/lib/queries';

/** How many months the trend chart shows, ending at the chosen month. */
const TREND_MONTHS = 6;

export default function AnalyticsScreen() {
  const theme = useTheme();
  const today = currentMonth();
  const [month, setMonth] = useState<Month>(today);
  const months = useMemo(() => monthRange(addMonths(month, 1 - TREND_MONTHS), month), [month]);
  const rows = useAnalyticsRows(months[0], month);
  const categories = useCategories();
  const start = useHousehold(true).data?.budgetStart ?? null;
  const uncategorized = useUncategorizedCount(start ? `${start}-01` : null);

  const names = useMemo(() => new Map((categories.data ?? []).map(c => [c.id, c.name])), [categories.data]);
  const totals = useMemo(() => (rows.data ? monthTotals(rows.data, months) : []), [rows.data, months]);
  const byCategory = useMemo(() => (rows.data ? spendingByCategory(rows.data, month) : []), [rows.data, month]);
  const payees = useMemo(() => (rows.data ? topPayees(rows.data, month) : []), [rows.data, month]);
  const thisMonth = totals[totals.length - 1];

  const refreshing = rows.isRefetching || uncategorized.isRefetching;
  const refresh = () => {
    rows.refetch();
    uncategorized.refetch();
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.semibold}>
                Analytics · {month.slice(0, 4)}
              </ThemedText>
              <ThemedText style={styles.monthTitle} accessibilityRole="header">
                {monthName(month)}
              </ThemedText>
            </View>
            <View style={styles.monthButtons}>
              <IconButton icon="back" label="Previous month" onPress={() => setMonth(addMonths(month, -1))} />
              <IconButton
                icon="forward"
                label="Next month"
                disabled={month >= today}
                onPress={() => setMonth(addMonths(month, 1))}
              />
            </View>
          </View>

          <CategorizeCard count={uncategorized.data} error={uncategorized.error?.message} />

          {rows.isPending ? (
            <ActivityIndicator style={styles.loading} />
          ) : rows.error ? (
            <ThemedText themeColor="danger">Couldn’t load analytics: {rows.error.message}</ThemedText>
          ) : (
            <>
              {thisMonth && <Summary totals={thisMonth} />}

              <Section title="Spending by category">
                {byCategory.length === 0 ? (
                  <Empty text={`Nothing spent in ${monthName(month)}.`} />
                ) : (
                  <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                    {byCategory.map((c, i) => {
                      const name = c.categoryId === null ? 'No category' : (names.get(c.categoryId) ?? 'Category');
                      const share = thisMonth && thisMonth.spent > 0 ? c.spent / thisMonth.spent : 0;
                      return (
                        <Pressable
                          key={c.categoryId ?? 'none'}
                          accessibilityRole="button"
                          accessibilityLabel={`${name}: ${formatCents(c.spent)}, ${Math.round(share * 100)}% of spending`}
                          accessibilityHint="See its transactions and trend"
                          onPress={() =>
                            router.push({
                              pathname: '/analytics/category',
                              params: { categoryId: c.categoryId ?? 'none', month },
                            })
                          }
                          style={({ pressed }) => [
                            styles.row,
                            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                            pressed && styles.dim,
                          ]}>
                          <View style={styles.rowTop}>
                            <View style={styles.flex}>
                              <ThemedText
                                numberOfLines={1}
                                style={styles.rowName}
                                themeColor={c.categoryId === null ? 'textSecondary' : 'text'}>
                                {name}
                              </ThemedText>
                              <ThemedText type="small" themeColor="textSecondary">
                                {c.count} {c.count === 1 ? 'transaction' : 'transactions'} · {Math.round(share * 100)}%
                              </ThemedText>
                            </View>
                            <ThemedText style={styles.rowAmount}>{formatCents(c.spent)}</ThemedText>
                          </View>
                          <FillBar
                            fill={byCategory[0].spent > 0 ? c.spent / byCategory[0].spent : 0}
                            color={c.categoryId === null ? theme.textSecondary : theme.accent}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </Section>

              <Section title={`Last ${TREND_MONTHS} months`}>
                <TrendChart totals={totals} selected={month} onSelect={setMonth} />
              </Section>

              <Section title="Top payees">
                {payees.length === 0 ? (
                  <Empty text={`Nothing spent in ${monthName(month)}.`} />
                ) : (
                  <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                    {payees.map((p, i) => (
                      <View
                        key={p.payee}
                        style={[
                          styles.payee,
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                        ]}>
                        <View style={styles.flex}>
                          <ThemedText numberOfLines={1}>{p.payee}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {p.count} {p.count === 1 ? 'transaction' : 'transactions'}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.amount}>{formatCents(p.spent)}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </Section>

              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                Spending is what came out of envelopes, less refunds. Transfers and transactions still to review
                aren’t counted.
              </ThemedText>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Opens the Transactions tab filtered to spending with no category. */
function CategorizeCard({ count, error }: { count: number | undefined; error?: string }) {
  const theme = useTheme();
  const done = count === 0;
  const detail = error
    ? `Couldn’t count them: ${error}`
    : count === undefined
      ? 'Counting…'
      : done
        ? 'Every purchase has a category.'
        : `${count} ${count === 1 ? 'purchase has' : 'purchases have'} no category yet.`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Categorize transactions. ${detail}`}
      onPress={() => router.navigate({ pathname: '/transactions', params: { filter: 'uncategorized' } })}
      style={({ pressed }) => [styles.categorize, { backgroundColor: theme.backgroundElement }, pressed && styles.dim]}>
      <View style={styles.flex}>
        <ThemedText style={styles.rowName}>Categorize transactions</ThemedText>
        <ThemedText type="small" themeColor={error ? 'danger' : done ? 'textSecondary' : 'accent'}>
          {detail}
        </ThemedText>
      </View>
      {!!count && (
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
            {count}
          </ThemedText>
        </View>
      )}
      <Icon name="forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

function Summary({ totals }: { totals: MonthTotals }) {
  const theme = useTheme();
  const stats = [
    { label: 'Income', value: totals.income },
    { label: 'Spent', value: totals.spent },
    ...(totals.invested !== 0 ? [{ label: 'Invested', value: totals.invested }] : []),
    { label: 'Left over', value: totals.income - totals.spent - totals.invested },
  ];
  return (
    <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
      {stats.map(s => (
        <View key={s.label} style={styles.stat}>
          <ThemedText type="small" themeColor="textSecondary">
            {s.label}
          </ThemedText>
          <ThemedText
            style={styles.statValue}
            themeColor={s.label === 'Left over' && s.value < 0 ? 'danger' : 'text'}
            adjustsFontSizeToFit
            numberOfLines={1}>
            {formatCents(s.value)}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** Income and spending side by side for each month. Tapping a month shows it above. */
function TrendChart({
  totals,
  selected,
  onSelect,
}: {
  totals: MonthTotals[];
  selected: Month;
  onSelect(month: Month): void;
}) {
  const theme = useTheme();
  const max = Math.max(1, ...totals.flatMap(t => [t.income, t.spent]));
  const height = 140;
  const bar = (value: number) => Math.max(value > 0 ? 3 : 0, Math.round((Math.max(0, value) / max) * height));
  return (
    <View style={[styles.card, styles.chart, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.legend}>
        <Legend color={theme.accent} label="Income" />
        <Legend color={theme.textSecondary} label="Spent" />
      </View>
      <View style={styles.bars}>
        {totals.map(t => {
          const isSelected = t.month === selected;
          return (
            <Pressable
              key={t.month}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${monthName(t.month)}: income ${formatCents(t.income)}, spent ${formatCents(t.spent)}`}
              onPress={() => onSelect(t.month)}
              style={({ pressed }) => [styles.barGroup, pressed && styles.dim]}>
              <View style={[styles.barPair, { height }]}>
                <View style={[styles.bar, { height: bar(t.income), backgroundColor: theme.accent }]} />
                <View style={[styles.bar, { height: bar(t.spent), backgroundColor: theme.textSecondary }]} />
              </View>
              <View style={[styles.monthLabel, isSelected && { backgroundColor: theme.chip }]}>
                <ThemedText
                  type={isSelected ? 'smallBold' : 'small'}
                  themeColor={isSelected ? 'text' : 'textSecondary'}>
                  {monthName(t.month, 'short')}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <ThemedText themeColor="textSecondary" style={styles.empty}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.five },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.one },
  monthTitle: { fontSize: 30, lineHeight: 36, fontWeight: 800, letterSpacing: -0.6 },
  monthButtons: { flexDirection: 'row', gap: Spacing.two, paddingBottom: Spacing.one },
  semibold: { fontWeight: 600 },
  categorize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 20,
    padding: Spacing.three,
  },
  badge: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  summary: { flexDirection: 'row', borderRadius: 20, padding: Spacing.three, gap: Spacing.two },
  stat: { flex: 1, gap: Spacing.half },
  statValue: { fontWeight: 700, fontVariant: ['tabular-nums'] },
  section: { gap: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.two },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three - 2, gap: Spacing.two + 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  rowName: { fontWeight: 600 },
  rowAmount: { fontSize: 17, fontWeight: 700, fontVariant: ['tabular-nums'] },
  payee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  amount: { fontVariant: ['tabular-nums'], fontWeight: 600 },
  chart: { padding: Spacing.three, gap: Spacing.three },
  legend: { flexDirection: 'row', gap: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + Spacing.half },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  bars: { flexDirection: 'row', justifyContent: 'space-between' },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing.two },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  monthLabel: { borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  note: { paddingHorizontal: Spacing.two },
  empty: { paddingHorizontal: Spacing.two },
  flex: { flex: 1 },
  dim: { opacity: 0.6 },
});
