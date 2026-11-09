/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCustomPalette } from '@/providers/appearance-provider';

/** The colors to draw with: the custom theme when chosen, else light or dark. */
export function useTheme(): Palette {
  const scheme = useColorScheme();
  const custom = useCustomPalette();
  if (custom) return custom;
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
