import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { moveId } from '@/domain/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSetCategoryOrder } from '@/lib/categories';
import { useCategories, useEnvelopes } from '@/lib/queries';

/**
 * Modal from Settings: the labels that say what a transaction was for
 * (Groceries, Gas, ...), separate from the envelope the money came out of.
 */
export default function CategoriesScreen() {
  const theme = useTheme();
  const categories = useCategories();
  const envelopes = useEnvelopes();
  const setOrder = useSetCategoryOrder();
  const [reordering, setReordering] = useState(false);
  const list = categories.data ?? [];
  const envelopeName = (id: string | null) =>
    envelopes.data?.flatMap(g => g.envelopes).find(e => e.id === id)?.name ?? null;

  function move(id: string, step: -1 | 1) {
    const ids = list.map(c => c.id);
    const next = moveId(ids, id, step);
    if (next !== ids) setOrder.mutate({ ids: next });
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle" style={styles.flex}>
            Categories
          </ThemedText>
          {setOrder.isPending && <ActivityIndicator />}
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setReordering(r => !r)}>
            <ThemedText themeColor="accent">{reordering ? 'Done' : 'Reorder'}</ThemedText>
          </Pressable>
        </View>
        <ThemedText themeColor="textSecondary">
          {reordering
            ? 'Use the arrows to move categories.'
            : 'Categories say what a transaction was for, like Groceries, so you can see where money goes. The envelope says where the money came from. Picking a category fills in its usual envelope.'}
        </ThemedText>
        {setOrder.error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            Couldn’t reorder: {setOrder.error.message}
          </ThemedText>
        )}

        {categories.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : categories.error ? (
          <ThemedText themeColor="danger">Couldn’t load categories: {categories.error.message}</ThemedText>
        ) : (
          <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
            {list.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.row}>
                No categories yet
              </ThemedText>
            )}
            {list.map((c, i) => {
              const usual = envelopeName(c.default_envelope_id);
              return (
                <View
                  key={c.id}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint="Edit this category"
                    disabled={reordering}
                    onPress={() => router.push({ pathname: '/categories/[id]', params: { id: c.id } })}
                    style={({ pressed }) => [styles.flex, pressed && styles.dim]}>
                    <ThemedText themeColor={c.hidden ? 'textSecondary' : 'text'}>
                      {c.name}
                      {c.hidden ? ' (hidden)' : ''}
                    </ThemedText>
                    {usual && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Usually from {usual}
                      </ThemedText>
                    )}
                  </Pressable>
                  {reordering && (
                    <View style={styles.arrows}>
                      {([-1, 1] as const).map(step => {
                        const off = step < 0 ? i === 0 : i === list.length - 1;
                        return (
                          <Pressable
                            key={step}
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${c.name} ${step < 0 ? 'up' : 'down'}`}
                            disabled={off || setOrder.isPending}
                            hitSlop={6}
                            onPress={() => move(c.id, step)}
                            style={({ pressed }) => [styles.arrow, pressed && styles.dim]}>
                            <ThemedText themeColor={off ? 'textSecondary' : 'accent'}>{step < 0 ? '▲' : '▼'}</ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {!reordering && !categories.isPending && (
          <Button
            variant="plain"
            title="Add category"
            onPress={() => router.push({ pathname: '/categories/[id]', params: { id: 'new' } })}
          />
        )}
        <Button variant="plain" title="Close" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  group: { borderRadius: 12, overflow: 'hidden', marginTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  arrows: { flexDirection: 'row', gap: Spacing.two },
  arrow: { paddingHorizontal: Spacing.two },
  flex: { flex: 1 },
  dim: { opacity: 0.5 },
});
