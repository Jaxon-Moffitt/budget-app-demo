import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionForm, type KindLock } from '@/components/transaction-form';
import { accountDisplayName } from '@/domain/accounts';
import { formatCents } from '@/domain/money';
import { suggestMatchText } from '@/domain/rules';
import { amountFields, isBankTransaction } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import {
  useCategories,
  useDeleteTransaction,
  useEnvelopes,
  useSplitParts,
  useTransaction,
  useUnlinkTransfer,
  useUpdateTransaction,
  type TransactionDetail,
} from '@/lib/queries';

/** Modal from the Transactions tab: file and edit one transaction. */
export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useTransaction(id);

  return (
    <ThemedView style={styles.container}>
      {query.data ? (
        <Editor key={`${query.data.id}:${query.data.transfer_id}:${query.data.is_parent}`} transaction={query.data} />
      ) : query.isPending ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <View style={styles.message}>
          <ThemedText themeColor="textSecondary">
            {query.error ? `Couldn’t load it: ${query.error.message}` : 'This transaction no longer exists.'}
          </ThemedText>
          <Button variant="plain" title="Close" onPress={() => router.back()} />
        </View>
      )}
    </ThemedView>
  );
}

function Editor({ transaction }: { transaction: TransactionDetail }) {
  const theme = useTheme();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const unlink = useUnlinkTransfer();
  const parts = useSplitParts(transaction.id, transaction.is_parent);
  const envelopes = useEnvelopes();
  const categories = useCategories();
  const partLabel = (envelopeId: string | null, categoryId: string | null) =>
    [
      envelopes.data?.flatMap(g => g.envelopes).find(e => e.id === envelopeId)?.name ?? 'No envelope',
      categories.data?.find(c => c.id === categoryId)?.name,
    ]
      .filter(Boolean)
      .join(' · ');
  const fromBank = isBankTransaction(transaction.imported_id);
  const transfer = transaction.transfer;
  const { text, direction } = amountFields(transaction.amount);

  // A transfer or split ties this amount to other rows, so it's held fixed.
  const locked = fromBank || transfer !== null || transaction.is_parent;
  const onBudget = transaction.account?.on_budget ?? true;
  const otherName = transfer ? accountDisplayName(transfer.account) : '';

  // Splits and linked transfers decide the type themselves.
  const kindLock: KindLock | undefined = transaction.imported_id === 'starting-balance'
    ? { note: 'The account’s opening balance. It’s already part of Ready to assign, so it has no type.', envelope: false, category: false }
    : transaction.is_parent
    ? { note: 'Split into parts, each with its own envelope. Use Edit split to change them.', envelope: false, category: false }
    : !transfer
      ? undefined
      : transaction.kind === 'investment'
        ? {
            note: `Investment into ${otherName}. It comes out of an envelope but counts as invested, not spent.`,
            envelope: true,
            category: true,
          }
        : transaction.kind === 'income'
          ? { note: `Money in from ${otherName}, which is off budget, so it counts as income.`, envelope: false, category: true }
          : {
              note: `Transfer ${transaction.amount < 0 ? 'to' : 'from'} ${otherName}. The money stays in your budget, so it’s ignored. To set money aside for something like Travel fund, add it to that envelope on the Budget tab.`,
              envelope: false,
              category: false,
            };

  const subtitle = [
    transaction.pending ? 'Pending at the bank.' : null,
    fromBank && transaction.imported_payee ? `Bank description: ${transaction.imported_payee}.` : null,
    fromBank
      ? 'The amount, date and account come from your bank, so they can’t be changed here.'
      : 'Entered by hand.',
  ]
    .filter(Boolean)
    .join(' ');

  function confirmDelete() {
    const alsoOther = transfer && !isBankTransaction(transfer.imported_id);
    confirmDestructive(
      'Delete this transaction?',
      `${transaction.payee?.name ?? 'No payee'}, ${formatCents(transaction.amount)}.` +
        (alsoOther ? ' The other side of the transfer will be deleted too.' : '') +
        ' This can’t be undone.',
      'Delete',
      () =>
        remove
          .mutateAsync({ id: transaction.id, transferId: alsoOther ? transfer.id : null })
          .then(() => router.back(), () => {}),
    );
  }

  const panel = [styles.panel, { backgroundColor: theme.backgroundElement }];
  const actions = (
    <>
      {transfer ? (
        <View style={panel}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Transfer
          </ThemedText>
          <ThemedText>
            {transaction.amount < 0 ? 'To' : 'From'} {accountDisplayName(transfer.account)}
          </ThemedText>
          <Button
            variant="plain"
            title="Unlink transfer"
            loading={unlink.isPending}
            onPress={() => unlink.mutate({ transaction_id: transaction.id })}
          />
        </View>
      ) : transaction.is_parent ? (
        <View style={panel}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Split
          </ThemedText>
          {parts.data?.map(p => (
            <View key={p.id} style={styles.part}>
              <ThemedText type="small" style={styles.flex} numberOfLines={1}>
                {partLabel(p.envelope_id, p.category_id)}
                {p.notes ? ` · ${p.notes}` : ''}
              </ThemedText>
              <ThemedText type="small" style={styles.amount}>
                {formatCents(p.amount)}
              </ThemedText>
            </View>
          ))}
          <Button
            variant="plain"
            title="Edit split"
            onPress={() => router.push({ pathname: '/transaction/split', params: { id: transaction.id } })}
          />
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              variant="plain"
              title="Mark as transfer"
              onPress={() =>
                router.push({ pathname: '/transaction/transfer', params: { id: transaction.id } })
              }
            />
          </View>
          {onBudget && (
            <View style={styles.flex}>
              <Button
                variant="plain"
                title="Split"
                onPress={() =>
                  router.push({ pathname: '/transaction/split', params: { id: transaction.id } })
                }
              />
            </View>
          )}
        </View>
      )}
      {unlink.error && <ThemedText themeColor="danger">Couldn’t unlink: {unlink.error.message}</ThemedText>}
    </>
  );

  return (
    <TransactionForm
      title="Transaction"
      subtitle={subtitle}
      locked={locked}
      kindLock={onBudget ? kindLock : undefined}
      actions={actions}
      initial={{
        accountId: transaction.account_id,
        date: transaction.date,
        amountText: text,
        direction,
        payeeName: transaction.payee?.name ?? '',
        kind: transaction.kind,
        envelopeId: transaction.envelope_id,
        categoryId: transaction.category_id,
        notes: transaction.notes ?? '',
      }}
      submitLabel="Save"
      submitting={update.isPending}
      serverError={
        (update.error && `Couldn’t save: ${update.error.message}`) ||
        (remove.error && `Couldn’t delete: ${remove.error.message}`) ||
        null
      }
      onSubmit={fields =>
        update.mutateAsync({ transaction, fields }).then(() => router.back(), () => {})
      }
      onCancel={() => router.back()}
      onMakeRule={
        fromBank && transaction.imported_payee
          ? values =>
              router.push({
                pathname: '/rules/[id]',
                params: {
                  id: 'new',
                  match: suggestMatchText(transaction.imported_payee ?? ''),
                  direction: values.direction,
                  kind: values.kind ?? 'spending',
                  envelopeId: values.envelopeId ?? '',
                  categoryId: values.categoryId ?? '',
                },
              })
          : undefined
      }
      footer={
        fromBank ? null : (
          <View style={styles.footer}>
            <Button
              variant="plain"
              title="Delete transaction"
              disabled={remove.isPending}
              onPress={confirmDelete}
            />
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  message: { padding: Spacing.four, gap: Spacing.two },
  footer: { marginTop: Spacing.four },
  panel: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one, marginTop: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  flex: { flex: 1 },
  part: { flexDirection: 'row', gap: Spacing.two },
  amount: { fontVariant: ['tabular-nums'] },
});
