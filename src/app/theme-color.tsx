import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import ColorPicker, { BrightnessSlider, InputWidget, Panel3, Swatches } from 'reanimated-color-picker';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isSeedKey, SEED_LABELS } from '@/constants/custom-theme';
import { Colors, Spacing } from '@/constants/theme';
import { deriveTheme, isDark, normalizeHex } from '@/domain/colors';
import { useTheme } from '@/hooks/use-theme';
import { useAppearance } from '@/providers/appearance-provider';

const PRESETS = [
  '#F7F3ED', '#FFFFFF', '#120F0C', '#1F1B17',
  '#267B4C', '#21402C', '#1E88E5', '#3949AB',
  '#8E24AA', '#D81B60', '#F4511E', '#F9A825',
];

/** Sheet from Settings: pick one of the custom theme's four colors. */
export default function ThemeColorScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const appearance = useAppearance();
  const theme = useTheme();
  const seeds = appearance.seeds;
  // The picker only takes its starting color; feeding each pick back in would jitter the thumb.
  const [initial] = useState(() => (isSeedKey(key) && seeds ? seeds[key] : '#267B4C'));
  const [hex, setHex] = useState(initial);

  if (!isSeedKey(key) || !seeds) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <ThemedText>Choose Custom under Appearance first.</ThemedText>
          <Button variant="plain" title="Close" onPress={() => router.back()} />
        </View>
      </ThemedView>
    );
  }

  const label = SEED_LABELS[key];
  const next = { ...seeds, [key]: hex };
  const preview = deriveTheme(next, Colors[isDark(next.background) ? 'dark' : 'light']);
  const adjusted = key === 'accent' && preview.accent !== normalizeHex(hex);

  async function save() {
    if (isSeedKey(key)) await appearance.setSeed(key, hex);
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // Android: lets the list scroll back up inside the sheet instead of
        // every downward drag pulling the sheet closed.
        nestedScrollEnabled>
        <View>
          <ThemedText type="subtitle" accessibilityRole="header">
            {label.title}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{label.description}</ThemedText>
        </View>

        <ColorPicker
          value={initial}
          onCompleteJS={color => setHex(normalizeHex(color.hex.slice(0, 7)))}
          style={styles.picker}
          thumbSize={28}
          sliderThickness={26}>
          <Panel3 centerChannel="saturation" style={styles.wheel} />
          <BrightnessSlider style={styles.slider} />
          <Swatches colors={PRESETS} style={styles.swatches} swatchStyle={styles.swatch} />
          <InputWidget
            formats={['HEX']}
            defaultFormat="HEX"
            disableAlphaChannel
            inputStyle={[styles.input, { color: theme.text, borderColor: theme.border }]}
            inputTitleStyle={{ color: theme.textSecondary }}
            iconColor={theme.textSecondary}
          />
        </ColorPicker>

        <View
          accessible
          accessibilityLabel="Preview of the theme with this color"
          style={[styles.preview, { backgroundColor: preview.background, borderColor: preview.border }]}>
          <View style={[styles.previewHero, { backgroundColor: preview.hero }]}>
            <ThemedText type="small" style={{ color: preview.onHero }}>
              Ready to assign
            </ThemedText>
            <ThemedText style={[styles.previewAmount, { color: preview.onHero }]}>$1,240.00</ThemedText>
          </View>
          <View style={[styles.previewCard, { backgroundColor: preview.backgroundElement }]}>
            <View style={styles.previewRow}>
              <View style={styles.flex}>
                <ThemedText style={{ color: preview.text }}>Groceries</ThemedText>
                <ThemedText type="small" style={{ color: preview.textSecondary }}>
                  left of $400.00
                </ThemedText>
              </View>
              <ThemedText type="smallBold" style={{ color: preview.accent }}>
                $212.40
              </ThemedText>
            </View>
            <View style={[styles.previewTrack, { backgroundColor: preview.track }]}>
              <View style={[styles.previewFill, { backgroundColor: preview.accent }]} />
            </View>
          </View>
          <View style={[styles.previewButton, { backgroundColor: preview.accent }]}>
            <ThemedText type="smallBold" style={{ color: preview.onAccent }}>
              Add money
            </ThemedText>
          </View>
        </View>

        {adjusted && (
          <ThemedText type="small" themeColor="textSecondary">
            This accent is adjusted slightly so text in that color stays readable.
          </ThemedText>
        )}

        <Button title="Use this color" onPress={save} />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  picker: { gap: Spacing.three },
  wheel: { width: '80%', alignSelf: 'center' },
  slider: { borderRadius: 13 },
  swatches: { justifyContent: 'center', gap: Spacing.two },
  swatch: { width: 32, height: 32, borderRadius: 16, marginHorizontal: 0, marginBottom: 0 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  preview: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.two },
  previewHero: { borderRadius: 16, padding: Spacing.three, gap: Spacing.half },
  previewAmount: { fontSize: 24, lineHeight: 30, fontWeight: 800 },
  previewCard: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  previewTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  previewFill: { width: '55%', height: '100%' },
  previewButton: { borderRadius: 12, paddingVertical: Spacing.two + Spacing.one, alignItems: 'center' },
  flex: { flex: 1 },
});
