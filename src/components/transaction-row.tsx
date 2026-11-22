import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { accountDisplayName } from '@/domain/accounts';
import { formatCents } from '@/domain/money';
import { Spacing } from '@/constants/theme';
import type { Transaction } from '@/lib/queries';

/**
 * One transaction in a list (the Transactions tab, an account's history).
 * Tapping it opens the transaction to edit or file.
 */
export function TransactionRow({
  txn,
  first,
  last,
  background,
  border,
  archived,
  balanceAfter,
  hideAccount,
}: {
  txn: Transaction;
  first: boolean;
  last: boolean;
  background: string;
  border: string;
  /** Before the budget's first month: history only. */
  archived: boolean;
  /** The account's balance right after this transaction, for an account's history. */
  balanceAfter?: number;
  /** In one account's history the account goes without saying. */
  hideAccount?: boolean;
}) {
  const payee = txn.payee?.name ?? txn.imported_payee ?? 'No payee';
  const filed = rowLabel(txn);
  const label = archived && filed === 'To review' ? 'Archived' : filed;
  const needsReview = label === 'To review';
  const details = [
    txn.pending ? 'Pending' : null,
    !hideAccount && txn.account && accountDisplayName(txn.account),
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
      <View style={styles.amountCol}>
        <ThemedText themeColor={txn.amount > 0 ? 'accent' : 'text'} style={styles.amount}>
          {formatCents(txn.amount)}
        </ThemedText>
        {balanceAfter !== undefined && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.amount}>
            {formatCents(balanceAfter)}
          </ThemedText>
        )}
      </View>
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
  amountCol: { alignItems: 'flex-end' },
  amount: { fontVariant: ['tabular-nums'] },
});
