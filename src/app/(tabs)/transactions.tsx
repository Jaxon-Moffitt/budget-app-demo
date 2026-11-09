import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showToast } from '@/components/toast';
import { accountDisplayName } from '@/domain/accounts';
import { formatCents } from '@/domain/money';
import { formatDay, formatMonth } from '@/domain/month';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useBankRefresh,
  useHousehold,
  useTransactions,
  type Transaction,
  type TransactionFilter,
} from '@/lib/queries';
import { useApplyRules } from '@/lib/rules';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'To review' },
] as const;

export default function TransactionsScreen() {
  const theme = useTheme();
  // Kept in the URL so other screens (the Budget tab) can open a filter.
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter: TransactionFilter = params.filter === 'review' ? 'review' : 'all';
  const setFilter = (next: TransactionFilter) => router.setParams({ filter: next });
  const start = useHousehold(true).data?.budgetStart ?? null;
  // Before the budget's first month is archive: To review never shows it,
  // and All shows it only when asked.
  const [showArchived, setShowArchived] = useState(false);
  const since = start && (filter === 'review' || !showArchived) ? `${start}-01` : null;
  const query = useTransactions(filter, since);
  const bank = useBankRefresh();
  const apply = useApplyRules();

  async function runRules() {
    try {
      const filed = await apply.mutateAsync();
      showToast(filed === 0 ? 'Nothing new to file' : `Filed ${filed} transaction${filed === 1 ? '' : 's'}`);
    } catch {
      // apply.error is shown in the header.
    }
  }

  const sections = useMemo(() => {
    const byDate = new Map<string, Transaction[]>();
    for (const txn of query.data?.pages.flat() ?? []) {
      const day = byDate.get(txn.date);
      if (day) day.push(txn);
      else byDate.set(txn.date, [txn]);
    }
    return [...byDate].map(([date, data]) => ({ title: formatDay(date), data }));
  }, [query.data]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <SectionList
          sections={sections}
          keyExtractor={txn => txn.id}
          contentContainerStyle={styles.content}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={bank.refreshing} onRefresh={bank.refresh} />}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <ThemedText type="subtitle" style={styles.title}>
                  Transactions
                </ThemedText>
                <Button variant="plain" title="Add" onPress={() => router.push('/transaction/new')} />
              </View>
              <Segmented<TransactionFilter> options={FILTERS} value={filter} onChange={setFilter} />
              {filter === 'review' && (
                <View style={styles.reviewActions}>
                  <View style={styles.flex}>
                    <Button variant="plain" title="Run rules" loading={apply.isPending} onPress={runRules} />
                  </View>
                  <View style={styles.flex}>
                    <Button variant="plain" title="Edit rules" onPress={() => router.push('/rules')} />
                  </View>
                </View>
              )}
              {apply.error && <ThemedText themeColor="danger">Couldn’t run rules: {apply.error.message}</ThemedText>}
              {bank.error && <ThemedText themeColor="danger">{bank.error}</ThemedText>}
              {query.error && (
                <ThemedText themeColor="danger">Couldn’t load transactions: {query.error.message}</ThemedText>
              )}
            </View>
          }
          ListEmptyComponent={
            query.isPending ? (
              <ActivityIndicator />
            ) : (
              <ThemedText themeColor="textSecondary">
                {filter === 'review'
                  ? 'Everything in your budget accounts has been filed.'
                  : 'No transactions yet. Link your bank in Settings, or pull down to sync.'}
              </ThemedText>
            )
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator />
            ) : start && filter === 'all' && !query.hasNextPage && !query.isPending ? (
              <View style={styles.footer}>
                <Button
                  variant="plain"
                  title={
                    showArchived
                      ? 'Hide archived transactions'
                      : `Show archived transactions (before ${formatMonth(start)})`
                  }
                  onPress={() => setShowArchived(v => !v)}
                />
              </View>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              {section.title}
            </ThemedText>
          )}
          renderItem={({ item, index, section }) => (
            <TransactionRow
              txn={item}
              first={index === 0}
              last={index === section.data.length - 1}
              background={theme.backgroundElement}
              border={theme.border}
              archived={start !== null && item.date < `${start}-01`}
            />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function TransactionRow({
  txn,
  first,
  last,
  background,
  border,
  archived,
}: {
  txn: Transaction;
  first: boolean;
  last: boolean;
  background: string;
  border: string;
  /** Before the budget's first month: history only. */
  archived: boolean;
}) {
  const payee = txn.payee?.name ?? txn.imported_payee ?? 'No payee';
  const filed = rowLabel(txn);
  const label = archived && filed === 'To review' ? 'Archived' : filed;
  const needsReview = label === 'To review';
  const details = [
    txn.pending ? 'Pending' : null,
    txn.account && accountDisplayName(txn.account),
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Edit or categorize"
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: txn.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: background },
        first && styles.firstRow,
        last && styles.lastRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: border },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1}>{payee}</ThemedText>
        <ThemedText type="small" numberOfLines={1}>
          <ThemedText type="small" themeColor={needsReview ? 'accent' : 'textSecondary'}>
            {label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {details.length > 0 ? ` · ${details.join(' · ')}` : ''}
          </ThemedText>
        </ThemedText>
      </View>
      <ThemedText themeColor={txn.amount > 0 ? 'accent' : 'text'} style={styles.amount}>
        {formatCents(txn.amount)}
      </ThemedText>
    </Pressable>
  );
}

/** How a transaction was filed: its type, envelope and category. */
function rowLabel(txn: Transaction): string {
  if (txn.account?.on_budget === false) return 'Off budget';
  if (txn.imported_id === 'starting-balance') return 'Starting balance';
  if (txn.is_parent) return 'Split';
  const other = txn.transferAccount ? accountDisplayName(txn.transferAccount) : 'another account';
  const category = txn.category ? ` · ${txn.category.name}` : '';
  switch (txn.kind) {
    case 'transfer':
      return txn.transfer_id ? `Transfer ${txn.amount < 0 ? 'to' : 'from'} ${other}` : 'Transfer';
    case 'investment':
      return `Invested from ${txn.envelope?.name ?? 'an envelope'}`;
    case 'income':
      return `Income${txn.envelope ? ` into ${txn.envelope.name}` : ''}${category}`;
    case 'spending':
      return `${txn.envelope?.name ?? 'No envelope'}${category}`;
    default:
      return 'To review';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  header: { gap: Spacing.two, marginBottom: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  reviewActions: { flexDirection: 'row', gap: Spacing.two },
  footer: { marginTop: Spacing.three },
  flex: { flex: 1 },
  sectionHeader: { marginTop: Spacing.three, marginBottom: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  firstRow: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  lastRow: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  rowText: { flex: 1 },
  pressed: { opacity: 0.6 },
  amount: { fontVariant: ['tabular-nums'] },
});
