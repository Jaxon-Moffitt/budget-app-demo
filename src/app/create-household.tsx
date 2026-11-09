import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHousehold } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/**
 * Shown to a signed-in person who isn't in a household yet. The partner who
 * signs up second lands here too, so joining is explained alongside creating:
 * making a second household would stop them being added to the first.
 */
export default function CreateHouseholdScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session, signOut } = useAuth();
  const household = useHousehold(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'create' | 'check' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function create() {
    setBusy('create');
    setError(null);
    setNotice(null);
    const { error: rpcError } = await supabase.rpc('create_household', {
      household_name: name.trim() || 'Our budget',
    });
    if (rpcError) {
      setError(rpcError.message);
      setBusy(null);
      return;
    }
    // The root layout's guard sends us to the tabs once this resolves.
    await queryClient.invalidateQueries();
  }

  async function checkAgain() {
    setBusy('check');
    setError(null);
    setNotice(null);
    const { data } = await household.refetch();
    setBusy(null);
    // A household arriving flips the root layout's guard; nothing else to do.
    if (!data) setNotice('Not added yet. Ask your partner to add your email in Settings.');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <KeyboardView style={styles.container}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Set up your household</ThemedText>
            <ThemedText themeColor="textSecondary">
              You and your partner share one household, which holds your budget, accounts and
              transactions.
            </ThemedText>

            <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Joining your partner?
              </ThemedText>
              <ThemedText>
                Ask them to add <ThemedText style={styles.email}>{session?.user.email}</ThemedText>{' '}
                in Settings → Household, then check again.
              </ThemedText>
              <Button
                variant="plain"
                title="Check again"
                loading={busy === 'check'}
                disabled={busy !== null}
                onPress={checkAgain}
              />
            </View>

            <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Setting up first?
              </ThemedText>
              <TextField
                label="Household name"
                placeholder="Our budget"
                value={name}
                onChangeText={setName}
                returnKeyType="go"
                onSubmitEditing={create}
              />
              <Button
                title="Create household"
                loading={busy === 'create'}
                disabled={busy !== null}
                onPress={create}
              />
            </View>

            {error && (
              <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
                {error}
              </ThemedText>
            )}
            {notice && <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText>}

            <Button variant="plain" title="Sign out" onPress={signOut} />
          </ScrollView>
        </KeyboardView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  section: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  email: { fontWeight: 600 },
});
