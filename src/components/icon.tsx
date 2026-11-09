import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';

/** The few icons the app uses: SF Symbols on iOS, Material Symbols on Android. */
const ICONS = {
  back: { ios: 'chevron.left', android: 'chevron_left', text: '‹' },
  forward: { ios: 'chevron.right', android: 'chevron_right', text: '›' },
  add: { ios: 'plus', android: 'add', text: '+' },
  remove: { ios: 'minus', android: 'remove', text: '−' },
  close: { ios: 'xmark', android: 'close', text: '×' },
  done: { ios: 'checkmark.circle.fill', android: 'check_circle', text: '✓' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  const icon = ICONS[name];
  return (
    <SymbolView
      name={{ ios: icon.ios, android: icon.android }}
      size={size}
      tintColor={color}
      weight="semibold"
      fallback={
        <ThemedText style={{ color, fontSize: size, lineHeight: size + 2 }}>{icon.text}</ThemedText>
      }
    />
  );
}
