import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { AccountTypePicker } from '@/components/account-type-picker';
import { Button, TextField } from '@/components/form';
import { InBudgetSwitch } from '@/components/in-budget-switch';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accountDisplayName, normalizeNickname, type AccountType } from '@/domain/accounts';
import { formatCents } from '@/domain/money';
import { Spacing } from '@/constants/theme';
import { confirmDestructive } from '@/lib/confirm';
import { useAccounts, useUpdateAccount, type Account } from '@/lib/queries';

/** Modal from the Accounts tab: nickname, type, budget membership, and closing. */
export default function EditAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accounts = useAccounts();
  const account = accounts.data?.find(a => a.id === id);

  return (
    <ThemedView style={styles.container}>
      {account ? (
        // Keyed so the form starts from this account's saved values.
        <AccountForm key={account.id} account={account} />
      ) : accounts.isPending ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">This account no longer exists.</ThemedText>
          <Button variant="plain" title="Close" onPress={() => router.back()} />
        </View>
      )}
    </ThemedView>
  );
}

function AccountForm({ account }: { account: Account }) {
  const update = useUpdateAccount();
  const [nickname, setNickname] = useState(account.nickname ?? '');
  const [type, setType] = useState<AccountType>(account.type);
  const [onBudget, setOnBudget] = useState(account.on_budget);
  const linked = account.sfin_account_id !== null;

  async function save(changes: Parameters<typeof update.mutateAsync>[0]['changes']) {
    try {
      await update.mutateAsync({ id: account.id, changes });
      router.back();
    } catch {
      // update.error is shown below.
    }
  }

  function confirmClose() {
    const notes = [
      'Its transactions stay, and you can reopen it later from the Closed section.',
      linked ? 'Bank sync will stop updating it.' : null,
      account.balance !== 0
        ? `It still has a balance of ${formatCents(account.balance)}; move that money first if it should stay in another account.`
        : null,
    ];
    confirmDestructive(`Close ${accountDisplayName(account)}?`, notes.filter(Boolean).join('\n\n'), 'Close account', () =>
      save({ closed: true }),
    );
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">Edit account</ThemedText>
        <ThemedText themeColor="textSecondary">
          {[account.name, account.sfin_org_name ?? (linked ? null : 'Added by hand')]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
        {account.closed && (
          <ThemedText themeColor="danger">
            This account is closed{linked ? ', so bank sync doesn’t update it' : ''}.
          </ThemedText>
        )}

        <TextField
          label="Nickname"
          placeholder={account.name}
          value={nickname}
          onChangeText={setNickname}
          maxLength={60}
          returnKeyType="done"
        />
        <ThemedText type="small" themeColor="textSecondary">
          Leave blank to show the name above.
        </ThemedText>

        <AccountTypePicker value={type} onChange={setType} />
        <InBudgetSwitch value={onBudget} onChange={setOnBudget} />

        {update.error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            Couldn’t save: {update.error.message}
          </ThemedText>
        )}

        <Button
          title="Save"
          loading={update.isPending}
          onPress={() =>
            save({ nickname: normalizeNickname(nickname), type, on_budget: onBudget })
          }
        />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />

        <View style={styles.danger}>
          {account.closed ? (
            <Button
              variant="plain"
              title="Reopen account"
              disabled={update.isPending}
              onPress={() => save({ closed: false })}
            />
          ) : (
            <Button
              variant="plain"
              title="Close account"
              disabled={update.isPending}
              onPress={confirmClose}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two },
  danger: { marginTop: Spacing.four },
});
