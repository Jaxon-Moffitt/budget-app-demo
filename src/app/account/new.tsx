import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AccountTypePicker } from '@/components/account-type-picker';
import { Button, TextField } from '@/components/form';
import { InBudgetSwitch } from '@/components/in-budget-switch';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { AccountType } from '@/domain/accounts';
import { parseAmount } from '@/domain/money';
import { localDate } from '@/domain/month';
import { Spacing } from '@/constants/theme';
import { useCreateAccount } from '@/lib/queries';

/** Modal from the Accounts tab: an account that isn't linked to a bank. */
export default function NewAccountScreen() {
  const create = useCreateAccount();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [onBudget, setOnBudget] = useState(true);
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isCard = type === 'credit';

  function changeType(next: AccountType) {
    setType(next);
    // Investments are usually tracked rather than budgeted; still switchable.
    setOnBudget(next !== 'investment');
  }

  async function add() {
    setError(null);
    if (!name.trim()) {
      setError('Give the account a name.');
      return;
    }
    let cents = 0;
    if (balance.trim()) {
      try {
        cents = parseAmount(balance.replace('$', ''));
      } catch {
        setError('Enter the balance as an amount, like 1250.00.');
        return;
      }
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        type,
        onBudget,
        // A card's balance is money owed, which the app stores as negative.
        startingBalance: isCard ? -Math.abs(cents) : cents,
        startingDate: localDate(),
      });
      router.back();
    } catch (e) {
      setError(`Couldn’t add the account: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Add account</ThemedText>
          <ThemedText themeColor="textSecondary">
            For an account that isn’t linked through SimpleFIN, such as cash or a bank the Bridge
            doesn’t support. Its balance comes from the transactions you enter.
          </ThemedText>

          <TextField
            label="Name"
            placeholder="e.g. Cash envelope"
            value={name}
            onChangeText={setName}
            maxLength={60}
            returnKeyType="next"
          />

          <AccountTypePicker value={type} onChange={changeType} />
          <InBudgetSwitch value={onBudget} onChange={setOnBudget} />

          <TextField
            label={isCard ? 'Amount owed today' : 'Balance today'}
            placeholder="0.00"
            value={balance}
            onChangeText={setBalance}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            onSubmitEditing={add}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {isCard
              ? 'What you currently owe on the card. It’s recorded as a Starting Balance today.'
              : 'Recorded as a Starting Balance today. Use a minus sign if it’s overdrawn.'}
          </ThemedText>

          {error && (
            <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          )}

          <Button title="Add account" loading={create.isPending} onPress={add} />
          <Button variant="plain" title="Cancel" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
});
