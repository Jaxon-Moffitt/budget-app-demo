import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** How full an envelope still is. Decorative: the amount next to it says the same in words. */
export function FillBar({ fill, color, height = 6 }: { fill: number; color: string; height?: number }) {
  const theme = useTheme();
  const percent = Math.round(Math.max(0, Math.min(1, fill)) * 100);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.track }]}>
      <View style={{ width: `${percent}%`, height: '100%', borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
});
