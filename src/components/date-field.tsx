import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatDay, localDate } from '@/domain/month';
import { dateFromDay } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A "YYYY-MM-DD" day picker: iOS's compact inline picker, Android's dialog. */
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
  const date = dateFromDay(value);

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      {disabled ? (
        <ThemedText themeColor="textSecondary">{formatDay(value)}</ThemedText>
      ) : Platform.OS === 'ios' ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          accessibilityLabel={label}
          onValueChange={(_, next) => onChange(localDate(next))}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${formatDay(value)}`}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: date,
              mode: 'date',
              onValueChange: (_, next) => onChange(localDate(next)),
            })
          }>
          <ThemedText themeColor="accent">{formatDay(value)}</ThemedText>
        </Pressable>
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
