import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EnvelopeChooser } from '@/components/envelope-picker';
import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accountDisplayName } from '@/domain/accounts';
import { formatCents } from '@/domain/money';
import { formatDay } from '@/domain/month';
import { investmentSide, rankTransferCandidates, TRANSFER_WINDOW_DAYS } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useLinkTransfer,
  useTransaction,
  useTransferCandidates,
  type TransactionDetail,
} from '@/lib/queries';

/** Modal from a transaction: pick its other side in another account and link them. */
export default function LinkTransferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useTransaction(id);

  return (
    <ThemedView style={styles.container}>
      {query.data ? (
        <Linker transaction={query.data} />
      ) : (
        <ActivityIndicator style={styles.loading} />
      )}
    </ThemedView>
  );
}

function Linker({ transaction }: { transaction: TransactionDetail }) {
  const theme = useTheme();
  const candidates = useTransferCandidates(transaction);
  const link = useLinkTransfer();
  const [chosen, setChosen] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<string | null>(transaction.envelope_id);

  const ranked = rankTransferCandidates(
    { date: transaction.date, amount: transaction.amount, accountId: transaction.account_id },
    (candidates.data ?? []).map(c => ({ ...c, accountId: c.account_id })),
  );
  const other = ranked.find(c => c.id === chosen);
  // Money leaving the budget for an investment account comes out of an envelope.
  const side = other
    ? investmentSide(
        { onBudget: transaction.account?.on_budget ?? true, amount: transaction.amount },
        { onBudget: other.account.on_budget, amount: other.amount },
      )
    : 'none';
  const needsEnvelope = side !== 'none';

  async function save() {
    if (!other) return;
    try {
      await link.mutateAsync({
        first_id: transaction.id,
        second_id: other.id,
        budget_envelope: needsEnvelope ? envelope : null,
      });
      router.back();
    } catch {
      // link.error is shown below.
    }
  }

  const direction = transaction.amount < 0 ? 'into' : 'out of';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="subtitle">Mark as transfer</ThemedText>
      <ThemedText themeColor="textSecondary">
        {formatCents(Math.abs(transaction.amount))} {transaction.amount < 0 ? 'out of' : 'into'}{' '}
        {transaction.account ? accountDisplayName(transaction.account) : 'this account'} on{' '}
        {formatDay(transaction.date)}. Pick the matching {formatCents(Math.abs(transaction.amount))}{' '}
        {direction} another account.
      </ThemedText>

      {candidates.isPending ? (
        <ActivityIndicator />
      ) : candidates.error ? (
        <ThemedText themeColor="danger">Couldn’t load matches: {candidates.error.message}</ThemedText>
      ) : ranked.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          No matching transaction in your other accounts within {TRANSFER_WINDOW_DAYS} days. If the
          other account isn’t linked to your bank, add the other side there by hand first.
        </ThemedText>
      ) : (
        <View
          accessibilityRole="radiogroup"
          style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
          {ranked.map((c, i) => {
            const selected = c.id === chosen;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setChosen(c.id)}
                style={({ pressed }) => [
                  styles.option,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                  selected && { backgroundColor: theme.backgroundSelected },
                  pressed && styles.pressed,
                ]}>
                <View style={styles.flex}>
                  <ThemedText numberOfLines={1}>{accountDisplayName(c.account)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {formatDay(c.date)} · {c.payee?.name ?? c.imported_payee ?? 'No payee'}
                  </ThemedText>
                </View>
                <ThemedText style={styles.amount}>{formatCents(c.amount)}</ThemedText>
                {selected && <ThemedText themeColor="accent">✓</ThemedText>}
              </Pressable>
            );
          })}
        </View>
      )}

      {needsEnvelope && (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            The other account is off budget, so this is an investment: it comes out of an envelope
            and counts as invested, not spent.
          </ThemedText>
          <EnvelopeChooser label="Comes from envelope" value={envelope} onChange={setEnvelope} />
        </>
      )}

      {link.error && (
        <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
          Couldn’t link: {link.error.message}
        </ThemedText>
      )}

      <Button
        title="Link transfer"
        loading={link.isPending}
        disabled={!other || (needsEnvelope && !envelope)}
        onPress={save}
      />
      <Button variant="plain" title="Cancel" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  label: { marginTop: Spacing.two },
  group: { borderRadius: 12, overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  flex: { flex: 1 },
  amount: { fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.6 },
});
