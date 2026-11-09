import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/** Modal from Settings. add_household_member looks the email up in auth.users. */
export default function AddPartnerScreen() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!email.trim()) {
      setError('Enter your partner’s email.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('add_household_member', {
      member_email: email.trim(),
    });
    setBusy(false);
    if (rpcError) {
      // The RPC's messages are written for people ("They need to sign up…").
      setError(rpcError.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['household'] });
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Add partner</ThemedText>
          <ThemedText themeColor="textSecondary">
            Your partner needs their own account first: they open the app, tap “Create an
            account”, and sign up with their email. Then enter that email here.
          </ThemedText>

          <TextField
            label="Partner’s email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={add}
          />

          {error && (
            <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          )}

          <Button title="Add to household" loading={busy} onPress={add} />
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
