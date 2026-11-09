import { ActivityIndicator, Pressable, StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontFamilies, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function TextField({ label, style, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          style,
        ]}
        {...props}
      />
    </>
  );
}

type ButtonProps = {
  title: string;
  onPress(): void;
  /** primary: dark pill; tonal: soft chip-colored pill; plain: text only. */
  variant?: 'primary' | 'tonal' | 'plain';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const [background, color] =
    variant === 'primary'
      ? disabled
        ? [theme.disabled, theme.onDisabled]
        : [theme.text, theme.background]
      : variant === 'tonal'
        ? [theme.chip, theme.text]
        : [undefined, theme.accent];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        background !== undefined && { backgroundColor: background },
        (pressed || (inactive && variant !== 'primary')) && { opacity: 0.6 },
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText style={{ color, fontWeight: 700, textAlign: 'center' }}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
    fontFamily: FontFamilies[500],
    marginBottom: Spacing.two,
  },
  button: {
    borderRadius: 26,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
});
