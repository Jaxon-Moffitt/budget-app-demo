import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ChoiceGroup, ChoiceRow, Chooser } from '@/components/choice';
import { Button, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { nameProblem, nextSortOrder, visibleItems } from '@/domain/categories';
import { useCreateCategory } from '@/lib/categories';
import { useCategories, useHousehold, type Category } from '@/lib/queries';

/**
 * Categories label what a transaction was for (Groceries, Gas, ...), for
 * analytics. They're optional, so "No category" comes first. A new one can
 * be added from here, so filing a transaction doesn't mean a trip to
 * Settings.
 */
export function CategoryPicker({
  value,
  onChange,
  newEnvelopeId = null,
}: {
  value: string | null;
  onChange(category: Category | null): void;
  /** Usual envelope for a category added here (the one being filed to). */
  newEnvelopeId?: string | null;
}) {
  const categories = useCategories();
  const [adding, setAdding] = useState(false);

  if (categories.isPending) return <ActivityIndicator />;
  if (categories.error) {
    return <ThemedText themeColor="danger">Couldn’t load categories: {categories.error.message}</ThemedText>;
  }

  return (
    <View style={styles.picker}>
      <ChoiceGroup>
        <ChoiceRow label="No category" muted selected={value === null} first onPress={() => onChange(null)} />
        {visibleItems(categories.data, value).map(c => (
          <ChoiceRow key={c.id} label={c.name} selected={c.id === value} first={false} onPress={() => onChange(c)} />
        ))}
      </ChoiceGroup>
      {adding ? (
        <NewCategory
          all={categories.data}
          envelopeId={newEnvelopeId}
          onAdded={onChange}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="plain" title="+ New category" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

function NewCategory({
  all,
  envelopeId,
  onAdded,
  onCancel,
}: {
  all: Category[];
  envelopeId: string | null;
  onAdded(category: Category): void;
  onCancel(): void;
}) {
  const household = useHousehold(true);
  const create = useCreateCategory();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    const problem = nameProblem(name, all);
    if (problem) {
      setError(problem);
      return;
    }
    if (!household.data) return;
    try {
      const category = await create.mutateAsync({
        householdId: household.data.id,
        name,
        defaultEnvelopeId: envelopeId,
        sortOrder: nextSortOrder(all),
      });
      onAdded(category);
    } catch (e) {
      setError(`Couldn’t add it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        label="New category"
        placeholder="Pets, Kids, Home repair…"
        value={name}
        onChangeText={text => {
          setName(text);
          setError(null);
        }}
        autoFocus
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={add}
      />
      {error && <ThemedText themeColor="danger">{error}</ThemedText>}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button variant="tonal" title="Cancel" onPress={onCancel} disabled={create.isPending} />
        </View>
        <View style={styles.flex}>
          <Button title="Add" onPress={add} loading={create.isPending} disabled={!household.data} />
        </View>
      </View>
    </View>
  );
}

/** CategoryPicker behind a one-line button. */
export function CategoryChooser({
  value,
  onChange,
  newEnvelopeId,
}: {
  value: string | null;
  onChange(category: Category | null): void;
  newEnvelopeId?: string | null;
}) {
  const categories = useCategories();
  const name = categories.data?.find(c => c.id === value)?.name ?? null;
  return (
    <Chooser label="Category (optional)" valueLabel={name} placeholder="No category">
      {close => (
        <CategoryPicker
          value={value}
          newEnvelopeId={newEnvelopeId}
          onChange={c => {
            onChange(c);
            close();
          }}
        />
      )}
    </Chooser>
  );
}

const styles = StyleSheet.create({
  picker: { gap: Spacing.one },
  form: { gap: Spacing.two, marginTop: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
