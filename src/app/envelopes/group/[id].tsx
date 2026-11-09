import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { nameProblem, nextSortOrder } from '@/domain/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCreateGroup, useDeleteGroup, useUpdateGroup } from '@/lib/categories';
import { confirmDestructive } from '@/lib/confirm';
import { useEnvelopes, useHousehold, type EnvelopeGroup } from '@/lib/queries';

/** Modal from Envelopes: add a group (id "new") or rename, hide or delete one. */
export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const envelopes = useEnvelopes();
  const household = useHousehold(true);
  const groups = envelopes.data ?? [];
  const group = groups.find(g => g.id === id) ?? null;

  return (
    <ThemedView style={styles.container}>
      {envelopes.data && household.data && (id === 'new' || group) ? (
        <GroupForm key={id} householdId={household.data.id} groups={groups} group={group} />
      ) : envelopes.isPending || household.isPending ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">This group no longer exists.</ThemedText>
          <Button variant="plain" title="Close" onPress={() => router.back()} />
        </View>
      )}
    </ThemedView>
  );
}

function GroupForm({
  householdId,
  groups,
  group,
}: {
  householdId: string;
  groups: EnvelopeGroup[];
  /** Null when adding. */
  group: EnvelopeGroup | null;
}) {
  const theme = useTheme();
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const remove = useDeleteGroup();
  const [name, setName] = useState(group?.name ?? '');
  const [hidden, setHidden] = useState(group?.hidden ?? false);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  async function save() {
    setError(null);
    const problem = nameProblem(name, groups, group?.id);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      if (group) {
        await update.mutateAsync({ id: group.id, changes: { name, hidden } });
      } else {
        await create.mutateAsync({ householdId, name, sortOrder: nextSortOrder(groups) });
      }
      router.back();
    } catch (e) {
      setError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function confirmDelete() {
    if (!group) return;
    confirmDestructive(`Delete ${group.name}?`, 'The group is empty, so nothing else changes.', 'Delete', async () => {
      setError(null);
      try {
        await remove.mutateAsync({ id: group.id });
        router.back();
      } catch (e) {
        setError(`Couldn’t delete: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">{group ? 'Edit group' : 'New group'}</ThemedText>

        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          maxLength={60}
          autoFocus={!group}
          returnKeyType="done"
        />

        {group && (
          <SwitchRow
            label="Hidden"
            note="Hides every envelope in it from pickers. Their money still counts in the budget."
            value={hidden}
            onChange={setHidden}
            background={theme.backgroundElement}
          />
        )}

        {error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        )}
        <Button title={group ? 'Save' : 'Add group'} loading={create.isPending || update.isPending} onPress={save} />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />

        {group && (
          <View style={styles.danger}>
            {group.envelopes.length === 0 ? (
              <Button variant="plain" title="Delete group" disabled={busy} onPress={confirmDelete} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                To delete this group, first move or delete its{' '}
                {group.envelopes.length === 1 ? 'envelope' : `${group.envelopes.length} envelopes`}.
              </ThemedText>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardView>
  );
}

function SwitchRow({
  label,
  note,
  value,
  onChange,
  background,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange(value: boolean): void;
  background: string;
}) {
  return (
    <View style={[styles.switchRow, { backgroundColor: background }]}>
      <View style={styles.flex}>
        <ThemedText>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
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
