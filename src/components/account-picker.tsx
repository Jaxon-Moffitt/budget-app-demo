import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { accountDisplayName, compareAccounts } from '@/domain/accounts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccounts } from '@/lib/queries';

/** Open accounts as a one-of list, sorted like the Accounts tab. */
export function AccountPicker({
  value,
  onChange,
  exclude,
}: {
  value: string | null;
  onChange(accountId: string): void;
  /** An account to leave out, e.g. the other side of a transfer. */
  exclude?: string | null;
}) {
  const theme = useTheme();
  const accounts = useAccounts();
  // A closed account stays listed if it's the current choice.
  const options = (accounts.data ?? [])
    .filter(a => (!a.closed || a.id === value) && a.id !== exclude)
    .sort(compareAccounts);

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
      {options.map((a, i) => {
        const selected = a.id === value;
        return (
          <Pressable
            key={a.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(a.id)}
            style={({ pressed }) => [
              styles.option,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
              selected && { backgroundColor: theme.backgroundSelected },
              pressed && styles.pressed,
            ]}>
            <ThemedText style={styles.label} numberOfLines={1}>
              {accountDisplayName(a)}
            </ThemedText>
            {!a.on_budget && (
              <ThemedText type="small" themeColor="textSecondary">
                Off budget
              </ThemedText>
            )}
            {selected && <ThemedText themeColor="accent">✓</ThemedText>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 12, overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  label: { flex: 1 },
  pressed: { opacity: 0.6 },
});
