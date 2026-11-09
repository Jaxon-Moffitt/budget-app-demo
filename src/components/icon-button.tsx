import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

/** A round chip-colored button with one icon, like the month arrows. */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  size = 36,
}: {
  icon: IconName;
  /** Read by screen readers, since there's no visible text. */
  label: string;
  onPress(): void;
  disabled?: boolean;
  size?: number;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.chip },
        (pressed || disabled) && styles.dim,
      ]}>
      <Icon name={icon} size={size * 0.6} color={disabled ? theme.textSecondary : theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.5 },
});
