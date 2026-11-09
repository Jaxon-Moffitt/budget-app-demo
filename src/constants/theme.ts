/**
 * The app's colors in light and dark mode, from the Claude Design Budget
 * redesign: warm off-white and charcoal, white cards, green for money
 * that's there, amber for running low, red for overspent. Every text
 * color is at least 4.5:1 against the backgrounds it sits on.
 */

import { Platform } from 'react-native';

import type { Palette } from '@/domain/colors';
import type { EnvelopeStatus } from '@/domain/envelope';

export const Colors: { light: Palette; dark: Palette } = {
  light: {
    text: '#2A1F19',
    background: '#F7F3ED',
    /** Cards and grouped lists. */
    backgroundElement: '#FFFDFA',
    backgroundSelected: '#EDE7DF',
    /** Round icon buttons and quick-pick chips. */
    chip: '#EDE7DF',
    textSecondary: '#6C615A',
    accent: '#267B4C',
    onAccent: '#FFFFFF',
    /** An envelope running low. */
    warning: '#985B0E',
    danger: '#B94739',
    /** Text on the Ready to assign card when it turns red. */
    onDanger: '#F4F6EE',
    border: '#E2DDD7',
    /** The empty part of a fill bar. */
    track: '#EBE5DF',
    /** The Ready to assign card. */
    hero: '#21402C',
    onHero: '#F4F6EE',
    disabled: '#DCD6D1',
    onDisabled: '#787069',
  },
  dark: {
    text: '#F2EEE9',
    background: '#120F0C',
    backgroundElement: '#1F1B17',
    backgroundSelected: '#322C28',
    chip: '#322C28',
    textSecondary: '#AAA39B',
    accent: '#7BCC98',
    onAccent: '#0A1A10',
    warning: '#EBB25F',
    danger: '#F68675',
    onDanger: '#0A1A10',
    border: '#38322D',
    track: '#322C28',
    hero: '#88D1A2',
    onHero: '#0A1A10',
    disabled: '#322C28',
    onDisabled: '#877E78',
  },
};

/**
 * Figtree, one family per weight: Android can't pick a weight from a
 * custom family, so ThemedText maps fontWeight to one of these.
 */
export const FontFamilies = {
  500: 'Figtree_500Medium',
  600: 'Figtree_600SemiBold',
  700: 'Figtree_700Bold',
  800: 'Figtree_800ExtraBold',
} as const;

/** The Figtree family closest to a fontWeight; 400 and below use Medium. */
export function figtree(weight: string | number | undefined): string {
  const w = weight === 'bold' ? 700 : Number(weight) || 500;
  return w >= 800 ? FontFamilies[800] : w >= 700 ? FontFamilies[700] : w >= 600 ? FontFamilies[600] : FontFamilies[500];
}

/** What the person chose in Settings; "system" follows the phone, "custom" uses their own colors. */
export type ColorSchemePreference = 'system' | 'light' | 'dark' | 'custom';

export type { Palette };
export type ThemeColor = keyof Palette;

/** The color for an envelope's amount and fill bar, by status. */
export const STATUS_COLOR: Record<EnvelopeStatus, ThemeColor> = {
  ok: 'accent',
  low: 'warning',
  over: 'danger',
  empty: 'textSecondary',
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
