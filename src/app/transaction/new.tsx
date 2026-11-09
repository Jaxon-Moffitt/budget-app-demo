import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { DateField } from '@/components/date-field';
import { EnvelopeChooser } from '@/components/envelope-picker';
import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionForm } from '@/components/transaction-form';
import { localDate } from '@/domain/month';
import { investmentSide, signedAmount } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useAccounts, useCreateTransaction, useCreateTransfer, useHousehold } from '@/lib/queries';
import { useAuth } from '@/providers/auth-provider';

type Kind = 'transaction' | 'transfer';
const KINDS = [
  { value: 'transaction', label: 'Transaction' },
  { value: 'transfer', label: 'Transfer' },
] as const;

/** Modal from the Transactions tab: a transaction or transfer entered by hand. */
export default function NewTransactionScreen() {
  const [kind, setKind] = useState<Kind>('transaction');
  const toggle = <Segmented<Kind> options={KINDS} value={kind} onChange={setKind} />;

  return (
    <ThemedView style={styles.container}>
      {kind === 'transaction' ? <NewTransaction header={toggle} /> : <NewTransfer header={toggle} />}
    </ThemedView>
  );
}

function NewTransaction({ header }: { header: ReactNode }) {
  const { session } = useAuth();
  const household = useHousehold(true);
  const create = useCreateTransaction();

  if (!household.data || !session) return <ActivityIndicator style={styles.loading} />;
  return (
    <TransactionForm
      header={header}
      title="Add transaction"
      subtitle="For cash, or anything your bank hasn’t sent yet. If the bank sends a matching transaction later, sync links them instead of adding a duplicate."
      initial={{
        accountId: null,
        date: localDate(),
        amountText: '',
        direction: 'out',
        payeeName: '',
        kind: 'spending',
        envelopeId: null,
        categoryId: null,
        notes: '',
      }}
      submitLabel="Add transaction"
      submitting={create.isPending}
      serverError={create.error && `Couldn’t add it: ${create.error.message}`}
      onSubmit={fields =>
        create
          .mutateAsync({ householdId: household.data!.id, userId: session.user.id, fields })
          .then(() => router.back(), () => {})
      }
      onCancel={() => router.back()}
    />
  );
}

function NewTransfer({ header }: { header: ReactNode }) {
  const accounts = useAccounts();
  const create = useCreateTransfer();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(localDate());
  const [envelope, setEnvelope] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onBudget = (id: string | null) => accounts.data?.find(a => a.id === id)?.on_budget ?? true;
  // Money leaving the budget for an investment account comes out of an envelope.
  const isInvestment =
    from !== null &&
    to !== null &&
    investmentSide({ onBudget: onBudget(from), amount: -1 }, { onBudget: onBudget(to), amount: 1 }) !== 'none';

  async function submit() {
    setError(null);
    if (!from || !to) {
      setError('Choose both accounts.');
      return;
    }
    let amount: number;
    try {
      amount = signedAmount(amountText, 'in');
    } catch {
      setError('Enter the amount as a number, like 12.34.');
      return;
    }
    if (amount === 0) {
      setError('Enter the amount moved.');
      return;
    }
    if (isInvestment && !envelope) {
      setError('Choose the envelope this investment comes from.');
      return;
    }
    try {
      await create.mutateAsync({
        from_account: from,
        to_account: to,
        amount,
        transfer_date: date,
        budget_envelope: isInvestment ? envelope : null,
        transfer_notes: notes.trim() || null,
      });
      router.back();
    } catch {
      // create.error is shown below.
    }
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}
        <ThemedText type="subtitle">Add transfer</ThemedText>
        <ThemedText themeColor="textSecondary">
          Money moving between two of your accounts. Both sides are added and linked. For transfers
          your bank already sent, open the transaction and use Mark as transfer instead.
        </ThemedText>

        <TextField
          label="Amount"
          placeholder="0.00"
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
        />
        <DateField label="Date" value={date} onChange={setDate} />

        <ThemedText type="smallBold" style={styles.label}>
          From
        </ThemedText>
        <AccountPicker value={from} onChange={setFrom} exclude={to} />
        <ThemedText type="smallBold" style={styles.label}>
          To
        </ThemedText>
        <AccountPicker value={to} onChange={setTo} exclude={from} />

        {isInvestment && (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              The money leaves your budget for an investment account, so it comes out of an
              envelope. It counts as invested, not spent.
            </ThemedText>
            <EnvelopeChooser label="Comes from envelope" value={envelope} onChange={setEnvelope} />
          </>
        )}

        <TextField label="Notes" placeholder="Optional" value={notes} onChangeText={setNotes} />

        {(error || create.error) && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error ?? `Couldn’t add it: ${create.error?.message}`}
          </ThemedText>
        )}
        <Button title="Add transfer" loading={create.isPending} onPress={submit} />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  label: { marginTop: Spacing.two },
});
