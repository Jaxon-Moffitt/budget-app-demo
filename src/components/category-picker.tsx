import { ActivityIndicator } from 'react-native';

import { ChoiceGroup, ChoiceRow, Chooser } from '@/components/choice';
import { ThemedText } from '@/components/themed-text';
import { visibleItems } from '@/domain/categories';
import { useCategories, type Category } from '@/lib/queries';

/**
 * Categories label what a transaction was for (Groceries, Gas, ...), for
 * analytics. They're optional, so "No category" comes first.
 */
export function CategoryPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange(category: Category | null): void;
}) {
  const categories = useCategories();

  if (categories.isPending) return <ActivityIndicator />;
  if (categories.error) {
    return <ThemedText themeColor="danger">Couldn’t load categories: {categories.error.message}</ThemedText>;
  }

  return (
    <ChoiceGroup>
      <ChoiceRow label="No category" muted selected={value === null} first onPress={() => onChange(null)} />
      {visibleItems(categories.data, value).map(c => (
        <ChoiceRow key={c.id} label={c.name} selected={c.id === value} first={false} onPress={() => onChange(c)} />
      ))}
    </ChoiceGroup>
  );
}

/** CategoryPicker behind a one-line button. */
export function CategoryChooser({
  value,
  onChange,
}: {
  value: string | null;
  onChange(category: Category | null): void;
}) {
  const categories = useCategories();
  const name = categories.data?.find(c => c.id === value)?.name ?? null;
  return (
    <Chooser label="Category (optional)" valueLabel={name} placeholder="No category">
      {close => (
        <CategoryPicker
          value={value}
          onChange={c => {
            onChange(c);
            close();
          }}
        />
      )}
    </Chooser>
  );
}
