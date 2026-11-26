import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { envelopeLedger } from '@/domain/envelope';
import { formatCents } from '@/domain/money';
import { addMonths, monthName } from '@/domain/month';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentMonth, useBudget, useBudgetChanges } from '@/lib/budget';
import { useEnvelopeTransactions } from '@/lib/queries';

/**
 * Modal from the Simple view: one envelope's month as a plain equation.
 * Money in (what carried over, money added) and money out (each expense)
 * add up to what's left. No running balance, on purpose.
 */
export default function SpendingScreen() {
  const theme = useTheme();
  const { envelopeId } = useLocalSearchParams<{ envelopeId: string }>();
  const month = currentMonth();
  const budget = useBudget(month);
  const txns = useEnvelopeTransactions(envelopeId, month);
  const changes = useBudgetChanges(envelopeId, month);
  const view = budget.view;
  const envelope = view?.envelopes.find(e => e.id === envelopeId);
  const values = view?.month.envelopes[envelopeId];
  const names = new Map((view?.envelopes ?? []).map(e => [e.id, e.name]));
  const pending = budget.isPending || txns.isPending || changes.isPending;
  const failed = budget.error ?? txns.error;

  const lines =
    values && txns.data ? envelopeLedger(values.carried, values.assigned, txns.data, changes.data ?? []) : [];
  const left = values?.balance ?? 0;
  const short = monthName(month, 'short');

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">
              {monthName(month)}
            </ThemedText>
            <ThemedText type="subtitle" numberOfLines={2}>
              {envelope?.name ?? ''}
            </ThemedText>
          </View>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        {pending ? (
          <ActivityIndicator />
        ) : failed || !envelope || !values ? (
          <ThemedText themeColor="danger">Couldn’t load this envelope{failed ? `: ${failed.message}` : '.'}</ThemedText>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {lines.map((line, i) => {
              if (line.kind === 'carried' && line.amount === 0) return null;
              let label: string;
              let detail: string | null = null;
              let openId: string | null = null;
              if (line.kind === 'carried') label = `Left from ${monthName(addMonths(month, -1))}`;
              else if (line.kind === 'added') label = line.amount > 0 ? 'Added' : 'Taken out';
              else if (line.kind === 'change') {
                const other = line.change.otherEnvelopeId ? names.get(line.change.otherEnvelopeId) : null;
                label = line.amount > 0 ? (other ? `Moved from ${other}` : 'Added') : other ? `Moved to ${other}` : 'Taken out';
                detail = `${short} ${Number(line.change.date.slice(8))}`;
              } else {
                label = line.transaction.payee;
                detail = `${short} ${Number(line.transaction.date.slice(8))}${line.amount > 0 ? ' · refund' : ''}`;
                openId = line.transaction.openId;
              }
              const row = (
                <>
                  <ThemedText style={[styles.sign, { color: line.amount < 0 ? theme.text : theme.accent }]}>
                    {line.amount < 0 ? '−' : '+'}
                  </ThemedText>
                  <View style={styles.flex}>
                    <ThemedText numberOfLines={1}>{label}</ThemedText>
                    {detail && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {detail}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.amount} themeColor={line.amount < 0 ? 'text' : 'accent'}>
                    {formatCents(Math.abs(line.amount))}
                  </ThemedText>
                </>
              );
              const style = [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }];
              return openId ? (
                <Pressable
                  key={`${line.kind}-${i}`}
                  accessibilityRole="button"
                  accessibilityHint="Open this transaction"
                  onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: openId } })}
                  style={({ pressed }) => [...style, pressed && styles.dim]}>
                  {row}
                </Pressable>
              ) : (
                <View key={`${line.kind}-${i}`} style={style}>
                  {row}
                </View>
              );
            })}
            {lines.every(l => l.amount === 0) && (
              <ThemedText themeColor="textSecondary" style={styles.row}>
                Nothing in or out this month yet.
              </ThemedText>
            )}
            <View style={[styles.row, styles.total, { borderColor: theme.text }]}>
              <ThemedText style={styles.sign}>=</ThemedText>
              <ThemedText style={[styles.flex, styles.totalLabel]}>Left</ThemedText>
              <ThemedText style={styles.totalAmount} themeColor={left < 0 ? 'danger' : 'accent'}>
                {formatCents(left)}
              </ThemedText>
            </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  sign: { width: 14, fontSize: 18, fontWeight: 800, textAlign: 'center' },
  amount: { fontWeight: 600, fontVariant: ['tabular-nums'] },
  total: { borderTopWidth: 1.5 },
  totalLabel: { fontWeight: 700 },
  totalAmount: { fontSize: 20, fontWeight: 800, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  dim: { opacity: 0.6 },
});
