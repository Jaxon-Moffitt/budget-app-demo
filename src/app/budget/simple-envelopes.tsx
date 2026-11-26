import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isHidden } from '@/domain/categories';
import { defaultDiscretionary } from '@/domain/simple';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useForecasts } from '@/lib/forecast';
import { useAccounts } from '@/lib/queries';
import { useChosenEnvelopes, useSetChosenEnvelopes } from '@/lib/simple-envelopes';

/** Modal from the Simple view: which envelopes it shows, kept on this phone. */
export default function SimpleEnvelopesScreen() {
  const { forecasts, budget } = useForecasts();
  const accounts = useAccounts();
  const chosen = useChosenEnvelopes();
  const view = budget.view;

  if (!view || chosen.isPending || accounts.isPending) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.loading} />
      </ThemedView>
    );
  }
  const groups = view.groups
    .map(g => ({ ...g, envelopes: g.envelopes.filter(e => !isHidden(g, e)) }))
    .filter(g => g.envelopes.length > 0);
  const billEnvelopes = new Set([...(forecasts?.values() ?? [])].flatMap(f => f.bills.map(b => b.envelopeId)));
  const savings = new Set(
    (accounts.data ?? []).filter(a => a.type === 'savings' || a.type === 'emergency_fund').map(a => a.id),
  );
  const fallback = defaultDiscretionary(groups, billEnvelopes, savings);
  return <Picker groups={groups} initial={chosen.data ?? fallback} usingDefault={chosen.data === null} />;
}

function Picker({
  groups,
  initial,
  usingDefault,
}: {
  groups: { id: string; name: string; envelopes: { id: string; name: string }[] }[];
  initial: string[];
  usingDefault: boolean;
}) {
  const theme = useTheme();
  const save = useSetChosenEnvelopes();
  const [picked, setPicked] = useState(() => new Set(initial));
  const toggle = (id: string) =>
    setPicked(p => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function done(ids: string[] | null) {
    await save.mutateAsync(ids).catch(() => {});
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle" style={styles.flex}>
            Spending envelopes
          </ThemedText>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>
        <ThemedText themeColor="textSecondary">
          The envelopes the Simple view shows with what’s left in them. Usually the everyday ones, not bills or
          savings. Saved on this phone.
        </ThemedText>

        {groups.map(g => (
          <View key={g.id} style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
              {g.name}
            </ThemedText>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              {g.envelopes.map((e, i) => {
                const on = picked.has(e.id);
                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(e.id)}
                    style={({ pressed }) => [
                      styles.row,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                      pressed && styles.dim,
                    ]}>
                    <ThemedText style={styles.flex}>{e.name}</ThemedText>
                    <View
                      style={[
                        styles.box,
                        { borderColor: on ? theme.accent : theme.border },
                        on && { backgroundColor: theme.accent },
                      ]}>
                      {on && <ThemedText style={[styles.tick, { color: theme.onAccent }]}>✓</ThemedText>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <Button title="Save" loading={save.isPending} onPress={() => done([...picked])} />
        {!usingDefault && <Button variant="plain" title="Go back to the default" onPress={() => done(null)} />}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  group: { gap: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.two },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: 14, lineHeight: 17, fontWeight: 800 },
  flex: { flex: 1 },
  dim: { opacity: 0.6 },
});
