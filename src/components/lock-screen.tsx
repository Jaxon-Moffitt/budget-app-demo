import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAppLock } from '@/providers/app-lock-provider';
import { useAuth } from '@/providers/auth-provider';

/** Covers the whole app until biometrics succeed. */
export function LockScreen() {
  const { unlock, label } = useAppLock();
  const { signOut } = useAuth();

  useEffect(() => {
    unlock();
  }, [unlock]);

  return (
    <ThemedView style={StyleSheet.absoluteFill}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="subtitle">Budget is locked</ThemedText>
        <Button title={`Unlock with ${label}`} onPress={unlock} />
        <Button variant="plain" title="Sign in with password instead" onPress={signOut} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
});
