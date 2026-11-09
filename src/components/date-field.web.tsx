import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatDay } from '@/domain/month';
import { figtree, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Web version of DateField: the browser's own date input, which on an
 * iPhone opens Safari's date wheel. Its value is already "YYYY-MM-DD".
 */
export function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange(day: string): void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      {disabled ? (
        <ThemedText themeColor="textSecondary">{formatDay(value)}</ThemedText>
      ) : (
        <input
          type="date"
          aria-label={label}
          value={value}
          required
          onChange={event => {
            // Clearing the field gives "", which isn't a day; keep the old one.
            if (event.target.value) onChange(event.target.value);
          }}
          style={{
            color: theme.accent,
            background: 'transparent',
            border: 'none',
            fontFamily: figtree(500),
            fontSize: 16,
            colorScheme: scheme,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  label: { flex: 1 },
});
