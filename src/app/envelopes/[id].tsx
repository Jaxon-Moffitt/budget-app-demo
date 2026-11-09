import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ChoiceGroup, ChoiceRow } from '@/components/choice';
import { EnvelopePicker } from '@/components/envelope-picker';
import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { nameProblem, nextSortOrder } from '@/domain/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCreateEnvelope, useDeleteEnvelope, useUpdateEnvelope } from '@/lib/categories';
import { confirmDestructive } from '@/lib/confirm';
import { useEnvelopes, useHousehold, type Envelope, type EnvelopeGroup } from '@/lib/queries';

/** Modal from Envelopes: add an envelope (id "new", with groupId) or edit one. */
export default function EditEnvelopeScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
  const envelopes = useEnvelopes();
  const household = useHousehold(true);
  const groups = envelopes.data ?? [];
  const group =
    id === 'new'
      ? groups.find(g => g.id === groupId)
      : groups.find(g => g.envelopes.some(e => e.id === id));
  const envelope = group?.envelopes.find(e => e.id === id) ?? null;

  return (
    <ThemedView style={styles.container}>
      {group && household.data && (id === 'new' || envelope) ? (
        <EnvelopeForm
          key={id}
          householdId={household.data.id}
          groups={groups}
          group={group}
          envelope={envelope}
        />
      ) : envelopes.isPending || household.isPending ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">This envelope no longer exists.</ThemedText>
          <Button variant="plain" title="Close" onPress={() => router.back()} />
        </View>
      )}
    </ThemedView>
  );
}

function EnvelopeForm({
  householdId,
  groups,
  group,
  envelope,
}: {
  householdId: string;
  groups: EnvelopeGroup[];
  group: EnvelopeGroup;
  /** Null when adding. */
  envelope: Envelope | null;
}) {
  const theme = useTheme();
  const create = useCreateEnvelope();
  const update = useUpdateEnvelope();
  const remove = useDeleteEnvelope();
  const [name, setName] = useState(envelope?.name ?? '');
  const [groupId, setGroupId] = useState(group.id);
  const [hidden, setHidden] = useState(envelope?.hidden ?? false);
  const [deleting, setDeleting] = useState(false);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const everyEnvelope = groups.flatMap(g => g.envelopes);
  const replacementName = everyEnvelope.find(e => e.id === replacement)?.name;

  async function save() {
    setError(null);
    const problem = nameProblem(name, everyEnvelope, envelope?.id);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      if (!envelope) {
        await create.mutateAsync({ householdId, groupId, name, sortOrder: nextSortOrder(group.envelopes) });
      } else {
        const target = groups.find(g => g.id === groupId) ?? group;
        await update.mutateAsync({
          id: envelope.id,
          changes: {
            name,
            hidden,
            ...(groupId !== group.id ? { group_id: groupId, sort_order: nextSortOrder(target.envelopes) } : {}),
          },
        });
      }
      router.back();
    } catch (e) {
      setError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function confirmDelete(to: string | null) {
    if (!envelope) return;
    const message = to
      ? `Its transactions, money and starting balance move to ${everyEnvelope.find(e => e.id === to)?.name}. This can’t be undone.`
      : 'Its transactions go back to To review, and its money goes back to Ready to assign. This can’t be undone.';
    confirmDestructive(`Delete ${envelope.name}?`, message, 'Delete', async () => {
      setError(null);
      try {
        await remove.mutateAsync({ id: envelope.id, replacement: to });
        router.back();
      } catch (e) {
        setError(`Couldn’t delete: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">{envelope ? 'Edit envelope' : `New envelope in ${group.name}`}</ThemedText>

        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          maxLength={60}
          autoFocus={!envelope}
          returnKeyType="done"
        />

        {envelope && groups.length > 1 && (
          <ChoiceGroup label="Group">
            {groups.map((g, i) => (
              <ChoiceRow key={g.id} label={g.name} selected={g.id === groupId} first={i === 0} onPress={() => setGroupId(g.id)} />
            ))}
          </ChoiceGroup>
        )}

        {envelope && (
          <View style={[styles.switchRow, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.flex}>
              <ThemedText>Hidden</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Left out of pickers and “Fill from targets”. It still shows on the Budget tab in any
                month it holds money.
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
        <Button title={envelope ? 'Save' : 'Add envelope'} loading={create.isPending || update.isPending} onPress={save} />
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />

        {envelope && (
          <View style={styles.danger}>
            {!deleting ? (
              <Button variant="plain" title="Delete envelope" disabled={busy} onPress={() => setDeleting(true)} />
            ) : (
              <>
                <ThemedText type="smallBold">Delete {envelope.name}</ThemedText>
                <ThemedText themeColor="textSecondary">
                  Choose an envelope to take over its transactions and money, so nothing goes
                  missing. To keep its history instead, hide it.
                </ThemedText>
                <EnvelopePicker value={replacement} onChange={setReplacement} exclude={envelope.id} />
                <Button
                  title={replacementName ? `Move to ${replacementName} and delete` : 'Choose an envelope above'}
                  disabled={!replacement || busy}
                  loading={remove.isPending}
                  onPress={() => confirmDelete(replacement)}
                />
                <Button
                  variant="plain"
                  title="Delete and send its transactions to review"
                  disabled={busy}
                  onPress={() => confirmDelete(null)}
                />
                <Button variant="plain" title="Don’t delete" onPress={() => setDeleting(false)} />
              </>
            )}
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
