import { ThemedText } from '@/components/themed-text';

/**
 * Web version of Icon. SF Symbols and Material Symbols aren't available in
 * a browser, so the bank and envelope icons are drawn as SVG (Material
 * Icons, Apache 2.0, the same shapes as the Android app); the rest keep
 * their text stand-ins.
 */
const ICONS = {
  back: { text: '‹' },
  forward: { text: '›' },
  add: { text: '+' },
  remove: { text: '−' },
  close: { text: '×' },
  done: { text: '✓' },
  bank: { path: 'M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z' },
  envelope: {
    path: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z',
  },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  const icon: { text?: string; path?: string } = ICONS[name];
  if (icon.path) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d={icon.path} fill={color} />
      </svg>
    );
  }
  return <ThemedText style={{ color, fontSize: size, lineHeight: size + 2 }}>{icon.text}</ThemedText>;
}
