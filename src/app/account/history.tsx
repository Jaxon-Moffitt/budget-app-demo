import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionRow } from '@/components/transaction-row';
import { accountDisplayName, accountTypeLabel } from '@/domain/accounts';
import { formatCents } from '@/domain/money';
import { formatDay } from '@/domain/month';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccounts, useHousehold, useTransactions, type Transaction } from '@/lib/queries';

/**
 * Modal from the Accounts tab: every transaction in one account, newest
 * first, each with the account's balance right after it, like a statement.
 * Nothing to set up: bank sync and the add form already record the account.
 */
export default function AccountHistoryScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const accounts = useAccounts();
  const account = accounts.data?.find(a => a.id === id);
  const start = useHousehold(true).data?.budgetStart ?? null;
  const query = useTransactions('all', null, id);

  // Newest first, so each balance is today's less everything newer.
  const sections = useMemo(() => {
    if (!account) return [];
    let balance = account.balance;
    const byDate = new Map<string, { txn: Transaction; balanceAfter: number }[]>();
    for (const txn of query.data?.pages.flat() ?? []) {
      const row = { txn, balanceAfter: balance };
      balance -= txn.amount;
      const day = byDate.get(txn.date);
      if (day) day.push(row);
      else byDate.set(txn.date, [row]);
    }
    return [...byDate].map(([date, data]) => ({ title: formatDay(date), data }));
  }, [account, query.data]);

  if (!account) {
    return (
      <ThemedView style={[styles.container, styles.content]}>
        {accounts.isPending ? <ActivityIndicator /> : <ThemedText themeColor="textSecondary">This account no longer exists.</ThemedText>}
      </ThemedView>
    );
  }

  const name = accountDisplayName(account);
  const linked = account.sfin_account_id !== null && account.balance_current !== null;

  return (
    <ThemedView style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={row => row.txn.id}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.flex}>
                <ThemedText type="small" themeColor="textSecondary">
                  {accountTypeLabel(account.type)}
                  {account.on_budget ? '' : ' · Off budget'}
                  {account.closed ? ' · Closed' : ''}
                </ThemedText>
                <ThemedText type="subtitle" numberOfLines={2}>
                  {name}
                </ThemedText>
              </View>
              <IconButton icon="close" label="Close" onPress={() => router.back()} />
            </View>
            <View style={[styles.balanceCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {linked ? 'Balance at the bank' : 'Balance'}
              </ThemedText>
              <ThemedText style={styles.balance} themeColor={account.balance < 0 ? 'danger' : 'text'}>
                {formatCents(account.balance)}
              </ThemedText>
            </View>
            <Button
              variant="plain"
              title="Edit nickname, type and budget"
              onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
            />
            <ThemedText type="small" themeColor="textSecondary">
              The amount under each transaction is the balance right after it.
            </ThemedText>
            {query.error && (
              <ThemedText themeColor="danger">Couldn’t load transactions: {query.error.message}</ThemedText>
            )}
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            <ActivityIndicator />
          ) : (
            <ThemedText themeColor="textSecondary">No transactions in this account yet.</ThemedText>
          )
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.more} /> : null}
        renderSectionHeader={({ section }) => (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item, index, section }) => (
          <TransactionRow
            txn={item.txn}
            first={index === 0}
            last={index === section.data.length - 1}
            background={theme.backgroundElement}
            border={theme.border}
            archived={start !== null && item.txn.date < `${start}-01`}
            balanceAfter={item.balanceAfter}
            hideAccount
          />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  header: { gap: Spacing.two, marginBottom: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  balanceCard: { borderRadius: 20, padding: Spacing.three, gap: Spacing.half },
  balance: { fontSize: 28, lineHeight: 34, fontWeight: 800, fontVariant: ['tabular-nums'] },
  sectionHeader: { marginTop: Spacing.three, marginBottom: Spacing.one },
  more: { marginTop: Spacing.three },
  flex: { flex: 1 },
});
