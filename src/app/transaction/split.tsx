import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryChooser } from '@/components/category-picker';
import { EnvelopeChooser } from '@/components/envelope-picker';
import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatCents } from '@/domain/money';
import { amountFields, signedAmount, splitProblem, splitRemaining } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useRemoveSplit,
  useSaveSplit,
  useSplitParts,
  useTransaction,
  type SplitPart,
  type TransactionDetail,
} from '@/lib/queries';

/** Modal from a transaction: divide it into parts, each from its own envelope. */
export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useTransaction(id);
  const parts = useSplitParts(id, query.data?.is_parent ?? false);
  const ready = query.data && (!query.data.is_parent || parts.data);

  return (
    <ThemedView style={styles.container}>
      {ready ? (
        <SplitEditor transaction={query.data!} existing={parts.data ?? []} />
      ) : (
        <ActivityIndicator style={styles.loading} />
      )}
    </ThemedView>
  );
}

type Draft = { key: number; amountText: string; envelopeId: string | null; categoryId: string | null; notes: string };

function SplitEditor({ transaction, existing }: { transaction: TransactionDetail; existing: SplitPart[] }) {
  const theme = useTheme();
  const save = useSaveSplit();
  const remove = useRemoveSplit();
  // Parts carry the transaction's sign; people type plain amounts.
  const direction = transaction.amount < 0 ? 'out' : 'in';
  const [parts, setParts] = useState<Draft[]>(() =>
    existing.length > 0
      ? existing.map((p, i) => ({
          key: i,
          amountText: amountFields(p.amount).text,
          envelopeId: p.envelope_id,
          categoryId: p.category_id,
          notes: p.notes ?? '',
        }))
      : [
          {
            key: 0,
            amountText: amountFields(transaction.amount).text,
            envelopeId: transaction.envelope_id,
            categoryId: transaction.category_id,
            notes: '',
          },
          { key: 1, amountText: '', envelopeId: null, categoryId: null, notes: '' },
        ],
  );
  const [error, setError] = useState<string | null>(null);

  const cents = (text: string) => {
    if (!text.trim()) return 0;
    try {
      return signedAmount(text, direction);
    } catch {
      return null;
    }
  };
  const amounts = parts.map(p => cents(p.amountText));
  const remaining = splitRemaining(
    transaction.amount,
    amounts.map(a => ({ amount: a ?? 0 })),
  );
  const update = (key: number, change: Partial<Draft>) =>
    setParts(ps => ps.map(p => (p.key === key ? { ...p, ...change } : p)));

  async function submit() {
    setError(null);
    if (amounts.some(a => a === null)) {
      setError('Enter each amount as a number, like 12.34.');
      return;
    }
    const ready = parts.map((p, i) => ({
      amount: amounts[i] as number,
      envelopeId: p.envelopeId,
      categoryId: p.categoryId,
      notes: p.notes.trim() || null,
    }));
    const problem = splitProblem(transaction.amount, ready);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await save.mutateAsync({
        parent: transaction.id,
        parts: ready.map(p => ({
          amount: p.amount,
          envelope_id: p.envelopeId as string,
          category_id: p.categoryId,
          notes: p.notes,
        })),
      });
      router.back();
    } catch {
      // save.error is shown below.
    }
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">Split transaction</ThemedText>
        <ThemedText themeColor="textSecondary">
          {transaction.payee?.name ?? 'No payee'}, {formatCents(transaction.amount)}. Take each part
          from its own envelope; the parts must add up to the total.
        </ThemedText>

        {parts.map((p, i) => (
          <View key={p.key} style={[styles.part, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.partHeader}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.flex}>
                Part {i + 1}
              </ThemedText>
              {parts.length > 2 && (
                <Button
                  variant="plain"
                  title="Remove"
                  onPress={() => setParts(ps => ps.filter(x => x.key !== p.key))}
                />
              )}
            </View>
            <TextField
              label="Amount"
              placeholder="0.00"
              value={p.amountText}
              onChangeText={text => update(p.key, { amountText: text })}
              keyboardType="decimal-pad"
            />
            <EnvelopeChooser value={p.envelopeId} onChange={id => update(p.key, { envelopeId: id })} />
            <CategoryChooser
              value={p.categoryId}
              newEnvelopeId={p.envelopeId}
              onChange={c =>
                update(p.key, {
                  categoryId: c?.id ?? null,
                  envelopeId: p.envelopeId ?? c?.default_envelope_id ?? null,
                })
              }
            />
            <TextField
              label="Note"
              placeholder="Optional"
              value={p.notes}
              onChangeText={text => update(p.key, { notes: text })}
            />
          </View>
        ))}

        <View style={styles.remainingRow}>
          <ThemedText style={styles.flex}>Left to assign</ThemedText>
          <ThemedText
            themeColor={remaining === 0 ? 'textSecondary' : 'danger'}
            style={styles.amount}>
            {formatCents(remaining)}
          </ThemedText>
        </View>
        {remaining !== 0 && (
          <Button
            variant="plain"
            title={`Add part for ${formatCents(Math.abs(remaining))}`}
            onPress={() =>
              setParts(ps => [
                ...ps,
                {
                  key: Math.max(...ps.map(x => x.key)) + 1,
                  amountText: amountFields(Math.abs(remaining)).text,
                  envelopeId: null,
                  categoryId: null,
                  notes: '',
                },
              ])
            }
          />
        )}

        {(error || save.error || remove.error) && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error ?? (save.error && `Couldn’t save: ${save.error.message}`) ??
              (remove.error && `Couldn’t remove: ${remove.error.message}`)}
          </ThemedText>
        )}

        <Button title="Save split" loading={save.isPending} onPress={submit} />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />
        {transaction.is_parent && (
          <View style={styles.footer}>
            <Button
              variant="plain"
              title="Remove split"
              disabled={remove.isPending}
              onPress={() =>
                remove.mutateAsync({ parent: transaction.id }).then(() => router.back(), () => {})
              }
            />
          </View>
        )}
      </ScrollView>
    </KeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  part: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  partHeader: { flexDirection: 'row', alignItems: 'center' },
  remainingRow: { flexDirection: 'row', marginTop: Spacing.two },
  flex: { flex: 1 },
  amount: { fontVariant: ['tabular-nums'] },
  footer: { marginTop: Spacing.four },
});
