import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceGroup, ChoiceRow } from '@/components/choice';
import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accountDisplayName, compareAccounts } from '@/domain/accounts';
import { formatCents } from '@/domain/money';
import { addMonths, formatMonth, type Month } from '@/domain/month';
import { amountFields, signedAmount } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBudget, useSetAssigned, useUpdateEnvelopeMoney, type BudgetView } from '@/lib/budget';
import { useAccounts, type Envelope } from '@/lib/queries';

/**
 * Modal from the envelope sheet: the exact amount added this month, the
 * monthly target, and the savings account the envelope's money sits in.
 */
export default function EnvelopeDetailScreen() {
  const { envelopeId, month } = useLocalSearchParams<{ envelopeId: string; month: Month }>();
  const budget = useBudget(month);
  const envelope = budget.view?.envelopes.find(e => e.id === envelopeId);
  const householdId = budget.household.data?.id;

  return (
    <ThemedView style={styles.container}>
      {budget.view && envelope && householdId ? (
        <Editor view={budget.view} envelope={envelope} month={month} householdId={householdId} />
      ) : (
        <ActivityIndicator style={styles.loading} />
      )}
    </ThemedView>
  );
}

/** Cents for typed text: blank is zero, anything unreadable is null. */
function cents(text: string): number | null {
  if (!text.trim()) return 0;
  try {
    return signedAmount(text, 'in');
  } catch {
    return null;
  }
}

function Editor({
  view,
  envelope,
  month,
  householdId,
}: {
  view: BudgetView;
  envelope: Envelope;
  month: Month;
  householdId: string;
}) {
  const theme = useTheme();
  const accounts = useAccounts();
  const setAssigned = useSetAssigned();
  const updateMoney = useUpdateEnvelopeMoney();
  const values = view.month.envelopes[envelope.id] ?? {
    carried: 0,
    assigned: 0,
    spending: 0,
    invested: 0,
    income: 0,
    balance: 0,
  };
  const lastMonth = view.months.find(m => m.month === addMonths(month, -1))?.envelopes[envelope.id]?.assigned ?? null;
  const [text, setText] = useState(values.assigned ? amountFields(values.assigned).text : '');
  const [targetText, setTargetText] = useState(envelope.target ? amountFields(envelope.target).text : '');
  const [linked, setLinked] = useState<string | null>(envelope.linked_account_id);
  const [error, setError] = useState<string | null>(null);

  const entered = cents(text);
  const balanceAfter = entered === null ? null : values.balance - values.assigned + entered;
  const quick = [
    envelope.target ? { label: `Target ${formatCents(envelope.target)}`, amount: envelope.target } : null,
    lastMonth ? { label: `Last month ${formatCents(lastMonth)}`, amount: lastMonth } : null,
    values.balance < 0
      ? { label: `Cover overspending ${formatCents(-values.balance)}`, amount: values.assigned - values.balance }
      : null,
  ].filter((q): q is { label: string; amount: number } => q !== null);

  // Savings accounts in the budget are what envelopes like Emergency fund sit in.
  const savings = (accounts.data ?? [])
    .filter(a => a.on_budget && (!a.closed || a.id === linked))
    .sort(compareAccounts);

  async function save() {
    setError(null);
    const target = cents(targetText);
    if (entered === null || target === null) {
      setError('Enter amounts as numbers, like 250.00.');
      return;
    }
    try {
      if (entered !== values.assigned) {
        await setAssigned.mutateAsync({
          householdId,
          month,
          amounts: [{ envelopeId: envelope.id, assigned: entered }],
        });
      }
      const newTarget = target === 0 ? null : target;
      if (newTarget !== envelope.target || linked !== envelope.linked_account_id) {
        await updateMoney.mutateAsync({
          envelopeId: envelope.id,
          changes: { target: newTarget, linked_account_id: linked },
        });
      }
      router.back();
    } catch (e) {
      setError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">{envelope.name}</ThemedText>
        <ThemedText themeColor="textSecondary">{formatMonth(month)}</ThemedText>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Line label="Carried in" value={values.carried} />
          <Line label="Added this month" value={values.assigned} />
          <Line label="Spent" value={-values.spending} />
          {values.invested !== 0 && <Line label="Invested" value={-values.invested} />}
          {values.income !== 0 && <Line label="Income kept here" value={values.income} />}
          <Line label="Balance" value={values.balance} strong />
        </View>

        <TextField
          label={`Added in ${formatMonth(month)}`}
          placeholder="0.00"
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
        />
        {quick.length > 0 && (
          <View style={styles.chips}>
            {quick.map(q => (
              <Pressable
                key={q.label}
                accessibilityRole="button"
                onPress={() => setText(amountFields(q.amount).text)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  pressed && styles.dim,
                ]}>
                <ThemedText type="small" themeColor="accent">
                  {q.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
        {balanceAfter !== null && entered !== values.assigned && (
          <ThemedText type="small" themeColor={balanceAfter < 0 ? 'danger' : 'textSecondary'}>
            Balance after: {formatCents(balanceAfter)}. The difference comes from or goes back to
            Ready to assign.
          </ThemedText>
        )}

        <TextField
          label="Monthly target"
          placeholder="Optional"
          value={targetText}
          onChangeText={setTargetText}
          keyboardType="decimal-pad"
        />
        <ThemedText type="small" themeColor="textSecondary">
          What this envelope usually gets each month. “Fill from targets” uses it for a new month.
        </ThemedText>

        <ChoiceGroup label="Money kept in">
          <ChoiceRow label="No particular account" muted selected={linked === null} first onPress={() => setLinked(null)} />
          {savings.map(a => (
            <ChoiceRow
              key={a.id}
              label={accountDisplayName(a)}
              detail={formatCents(a.balance)}
              selected={a.id === linked}
              first={false}
              onPress={() => setLinked(a.id)}
            />
          ))}
        </ChoiceGroup>
        <ThemedText type="small" themeColor="textSecondary">
          For an envelope with its own savings account, like an emergency fund. The envelope sheet
          then shows whether the account holds what its envelopes say. Nothing moves on its own.
        </ThemedText>

        {error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        )}
        <Button title="Save" loading={setAssigned.isPending || updateMoney.isPending} onPress={save} />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardView>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <ThemedText type={strong ? 'smallBold' : 'small'} style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText
        type={strong ? 'smallBold' : 'small'}
        themeColor={strong && value < 0 ? 'danger' : 'text'}
        style={styles.amount}>
        {formatCents(value)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  line: { flexDirection: 'row' },
  flex: { flex: 1 },
  amount: { fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  dim: { opacity: 0.5 },
});
