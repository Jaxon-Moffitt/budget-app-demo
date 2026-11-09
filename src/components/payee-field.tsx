import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { suggestPayees } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePayees, type Payee } from '@/lib/queries';

/**
 * Free-text payee with suggestions from names already used. Picking one
 * reports the payee, so the form can fill in its usual category.
 */
export function PayeeField({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange(name: string): void;
  onPick(payee: Payee): void;
}) {
  const theme = useTheme();
  const payees = usePayees();
  const [focused, setFocused] = useState(false);

  const names = payees.data?.map(p => p.name) ?? [];
  const suggestions = focused ? suggestPayees(names, value) : [];

  return (
    <View>
      <TextField
        label="Payee"
        placeholder="Who was it with?"
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        returnKeyType="next"
      />
      {suggestions.length > 0 && (
        <View
          accessibilityLabel="Payee suggestions"
          style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {suggestions.map((name, i) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              onPress={() => {
                const payee = payees.data?.find(p => p.name === name);
                onChange(name);
                if (payee) onPick(payee);
                setFocused(false);
              }}
              style={({ pressed }) => [
                styles.item,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText numberOfLines={1}>{name}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: Spacing.one,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  item: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
