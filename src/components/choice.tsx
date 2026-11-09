import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A rounded card of one-of options. */
export function ChoiceGroup({ label, children }: { label?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View>
      {label && (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupLabel}>
          {label}
        </ThemedText>
      )}
      <View accessibilityRole="radiogroup" style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
        {children}
      </View>
    </View>
  );
}

export function ChoiceRow({
  label,
  detail,
  selected,
  first,
  muted,
  onPress,
}: {
  label: string;
  /** Shown on the right, such as a balance. */
  detail?: string;
  selected: boolean;
  first: boolean;
  muted?: boolean;
  onPress(): void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
        selected && { backgroundColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <ThemedText style={styles.flex} themeColor={muted ? 'textSecondary' : 'text'}>
        {label}
      </ThemedText>
      {detail && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.amount}>
          {detail}
        </ThemedText>
      )}
      {selected && <ThemedText themeColor="accent">✓</ThemedText>}
    </Pressable>
  );
}

/**
 * A one-line button showing the current choice; tapping it opens the full
 * list underneath. Picking from the list closes it again.
 */
export function Chooser({
  label,
  valueLabel,
  placeholder,
  children,
}: {
  label: string;
  valueLabel: string | null;
  placeholder: string;
  children(close: () => void): ReactNode;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${valueLabel ?? placeholder}`}
        onPress={() => setOpen(o => !o)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          pressed && styles.pressed,
        ]}>
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            {label}
          </ThemedText>
          <ThemedText themeColor={valueLabel ? 'text' : 'accent'}>{valueLabel ?? placeholder}</ThemedText>
        </View>
        <ThemedText themeColor="textSecondary">{open ? '▲' : '▼'}</ThemedText>
      </Pressable>
      {open && <View style={styles.list}>{children(() => setOpen(false))}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  groupLabel: {
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
    paddingHorizontal: Spacing.one,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  group: { borderRadius: 12, overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  list: { marginTop: Spacing.two, gap: Spacing.one },
  amount: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
});
