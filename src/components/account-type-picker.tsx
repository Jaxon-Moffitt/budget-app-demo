import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ACCOUNT_TYPES, type AccountType } from '@/domain/accounts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A one-of-five list of account types, used when adding and editing accounts. */
export function AccountTypePicker({
  value,
  onChange,
}: {
  value: AccountType;
  onChange(type: AccountType): void;
}) {
  const theme = useTheme();
  return (
    <>
      <ThemedText type="smallBold" style={styles.label}>
        Type
      </ThemedText>
      <View
        accessibilityRole="radiogroup"
        style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
        {ACCOUNT_TYPES.map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.option,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                selected && { backgroundColor: theme.backgroundSelected },
                pressed && styles.pressed,
              ]}>
              <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
              {selected && <ThemedText themeColor="accent">✓</ThemedText>}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: Spacing.two },
  group: { borderRadius: 12, overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  optionLabel: { flex: 1 },
  pressed: { opacity: 0.6 },
});
