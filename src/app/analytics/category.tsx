import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { categoryTrend } from '@/domain/analytics';
import { formatCents } from '@/domain/money';
import { addMonths, monthName, monthRange, type Month } from '@/domain/month';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAnalyticsRows, useCategoryTransactions } from '@/lib/analytics';
import { currentMonth } from '@/lib/budget';
import { useCategories } from '@/lib/queries';

const TREND_MONTHS = 6;

/** Modal from Analytics: one category's spending by month and its transactions. */
export default function CategoryAnalyticsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ categoryId: string; month: string }>();
  const categoryId = params.categoryId === 'none' ? null : params.categoryId;
  // The trend ends where Analytics was; tapping a bar picks the month to list.
  const end: Month = params.month ?? currentMonth();
  const [month, setMonth] = useState<Month>(end);
  const months = useMemo(() => monthRange(addMonths(end, 1 - TREND_MONTHS), end), [end]);
  const rows = useAnalyticsRows(months[0], end);
  const txns = useCategoryTransactions(categoryId, month);
  const categories = useCategories();
  const name =
    categoryId === null ? 'No category' : (categories.data?.find(c => c.id === categoryId)?.name ?? 'Category');
  const trend = useMemo(() => (rows.data ? categoryTrend(rows.data, categoryId, months) : []), [rows.data, categoryId, months]);
  const max = Math.max(1, ...trend.map(t => t.spent));
  const spent = trend.find(t => t.month === month)?.spent ?? 0;
  // Months with no transactions at all (before the data starts) don't drag the average down.
  const active = useMemo(
    () => new Set((rows.data ?? []).map(r => r.date.slice(0, 7))),
    [rows.data],
  );
  const counted = trend.filter(t => active.has(t.month));
  const average = counted.length > 0 ? Math.round(counted.reduce((s, t) => s + t.spent, 0) / counted.length) : 0;
  const height = 120;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle" style={styles.flex}>
            {name}
          </ThemedText>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        {rows.isPending ? (
          <ActivityIndicator />
        ) : rows.error ? (
          <ThemedText themeColor="danger">Couldn’t load spending: {rows.error.message}</ThemedText>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.stats}>
              <View style={styles.flex}>
                <ThemedText type="small" themeColor="textSecondary">
                  Spent in {monthName(month)}
                </ThemedText>
                <ThemedText style={styles.big}>{formatCents(spent)}</ThemedText>
              </View>
              <View style={styles.statEnd}>
                <ThemedText type="small" themeColor="textSecondary">
                  {counted.length > 1 ? `${counted.length}-month average` : 'Average'}
                </ThemedText>
                <ThemedText style={styles.medium}>{formatCents(average)}</ThemedText>
              </View>
            </View>
            <View style={styles.bars}>
              {trend.map(t => {
                const selected = t.month === month;
                return (
                  <Pressable
                    key={t.month}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${monthName(t.month)}: ${formatCents(t.spent)}`}
                    onPress={() => setMonth(t.month)}
                    style={({ pressed }) => [styles.barGroup, pressed && styles.dim]}>
                    <View style={{ height, justifyContent: 'flex-end' }}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: Math.max(t.spent > 0 ? 3 : 0, Math.round((Math.max(0, t.spent) / max) * height)),
                            backgroundColor: selected ? theme.accent : theme.track,
                          },
                        ]}
                      />
                    </View>
                    <ThemedText
                      type={selected ? 'smallBold' : 'small'}
                      themeColor={selected ? 'text' : 'textSecondary'}>
                      {monthName(t.month, 'short')}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <ThemedText style={styles.sectionTitle}>Transactions in {monthName(month)}</ThemedText>
        {txns.isPending ? (
          <ActivityIndicator />
        ) : txns.error ? (
          <ThemedText themeColor="danger">Couldn’t load transactions: {txns.error.message}</ThemedText>
        ) : txns.data.length === 0 ? (
          <ThemedText themeColor="textSecondary">Nothing in {monthName(month)}.</ThemedText>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {txns.data.map((t, i) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityHint="Edit or change its category"
                onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.openId } })}
                style={({ pressed }) => [
                  styles.txn,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                  pressed && styles.dim,
                ]}>
                <View style={styles.date}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.caps}>
                    {monthName(month, 'short')}
                  </ThemedText>
                  <ThemedText style={styles.day}>{Number(t.date.slice(8))}</ThemedText>
                </View>
                <View style={styles.flex}>
                  <ThemedText numberOfLines={1}>{t.payee}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[t.envelope, t.account, t.isSplitPart ? 'Part of a split' : null].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <ThemedText themeColor={t.amount > 0 ? 'accent' : 'text'} style={styles.amount}>
                  {formatCents(t.amount)}
                </ThemedText>
              </Pressable>
            ))}
          </View>
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
  stats: { flexDirection: 'row', alignItems: 'flex-end', padding: Spacing.three, paddingBottom: 0 },
  statEnd: { alignItems: 'flex-end' },
  big: { fontSize: 28, lineHeight: 34, fontWeight: 800, fontVariant: ['tabular-nums'] },
  medium: { fontSize: 17, fontWeight: 700, fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', padding: Spacing.three },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing.two },
  bar: { width: 20, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  sectionTitle: { fontWeight: 700, marginTop: Spacing.two },
  txn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  date: { width: 32, alignItems: 'center' },
  caps: { textTransform: 'uppercase', fontSize: 11 },
  day: { fontWeight: 700, fontSize: 17 },
  amount: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  dim: { opacity: 0.6 },
});
