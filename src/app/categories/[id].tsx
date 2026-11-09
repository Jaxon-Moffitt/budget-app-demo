import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { EnvelopeChooser } from '@/components/envelope-picker';
import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { nameProblem, nextSortOrder } from '@/domain/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCreateCategory, useDeleteCategory, useUpdateCategory } from '@/lib/categories';
import { confirmDestructive } from '@/lib/confirm';
import { useCategories, useHousehold, type Category } from '@/lib/queries';

/** Modal from Categories: add a category (id "new") or edit one. */
export default function EditCategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useCategories();
  const household = useHousehold(true);
  const category = categories.data?.find(c => c.id === id) ?? null;

  return (
    <ThemedView style={styles.container}>
      {categories.data && household.data && (id === 'new' || category) ? (
        <CategoryForm key={id} householdId={household.data.id} all={categories.data} category={category} />
      ) : categories.isPending || household.isPending ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">This category no longer exists.</ThemedText>
          <Button variant="plain" title="Close" onPress={() => router.back()} />
        </View>
      )}
    </ThemedView>
  );
}

function CategoryForm({
  householdId,
  all,
  category,
}: {
  householdId: string;
  all: Category[];
  /** Null when adding. */
  category: Category | null;
}) {
  const theme = useTheme();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState(category?.name ?? '');
  const [envelopeId, setEnvelopeId] = useState<string | null>(category?.default_envelope_id ?? null);
  const [hidden, setHidden] = useState(category?.hidden ?? false);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  async function save() {
    setError(null);
    const problem = nameProblem(name, all, category?.id);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      if (category) {
        await update.mutateAsync({
          id: category.id,
          changes: { name, hidden, default_envelope_id: envelopeId },
        });
      } else {
        await create.mutateAsync({ householdId, name, defaultEnvelopeId: envelopeId, sortOrder: nextSortOrder(all) });
      }
      router.back();
    } catch (e) {
      setError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function confirmDelete() {
    if (!category) return;
    confirmDestructive(
      `Delete ${category.name}?`,
      'Transactions with this category keep their envelope and lose only the label. No money moves. This can’t be undone.',
      'Delete',
      async () => {
        setError(null);
        try {
          await remove.mutateAsync({ id: category.id });
          router.back();
        } catch (e) {
          setError(`Couldn’t delete: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    );
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">{category ? 'Edit category' : 'New category'}</ThemedText>

        <TextField label="Name" value={name} onChangeText={setName} maxLength={60} autoFocus={!category} returnKeyType="done" />

        <EnvelopeChooser label="Usual envelope (optional)" value={envelopeId} onChange={setEnvelopeId} />
        <ThemedText type="small" themeColor="textSecondary">
          Picking this category on a transaction fills in this envelope, if none is chosen yet.
        </ThemedText>
        {envelopeId && <Button variant="plain" title="No usual envelope" onPress={() => setEnvelopeId(null)} />}

        {category && (
          <View style={[styles.switchRow, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.flex}>
              <ThemedText>Hidden</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Left out of pickers. Transactions that have it keep it.
              </ThemedText>
            </View>
            <Switch value={hidden} onValueChange={setHidden} accessibilityLabel="Hidden" />
          </View>
        )}

        {error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        )}
        <Button title={category ? 'Save' : 'Add category'} loading={create.isPending || update.isPending} onPress={save} />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />

        {category && (
          <View style={styles.danger}>
            <Button variant="plain" title="Delete category" disabled={busy} onPress={confirmDelete} />
          </View>
        )}
      </ScrollView>
    </KeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: 12,
  },
  danger: { marginTop: Spacing.four, gap: Spacing.two },
  flex: { flex: 1 },
});
