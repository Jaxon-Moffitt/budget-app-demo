import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isHidden, moveId } from '@/domain/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSetEnvelopeOrder, useSetGroupOrder } from '@/lib/categories';
import { useEnvelopes, type EnvelopeGroup } from '@/lib/queries';

/** Modal from Settings: every group and envelope, hidden ones included. */
export default function EnvelopesScreen() {
  const theme = useTheme();
  const envelopes = useEnvelopes();
  const setEnvelopeOrder = useSetEnvelopeOrder();
  const setGroupOrder = useSetGroupOrder();
  const [reordering, setReordering] = useState(false);
  const groups = envelopes.data ?? [];
  const busy = setEnvelopeOrder.isPending || setGroupOrder.isPending;
  const error = setEnvelopeOrder.error ?? setGroupOrder.error;

  function moveGroup(id: string, step: -1 | 1) {
    const ids = groups.map(g => g.id);
    const next = moveId(ids, id, step);
    if (next !== ids) setGroupOrder.mutate({ ids: next });
  }

  function moveEnvelope(group: EnvelopeGroup, id: string, step: -1 | 1) {
    const ids = group.envelopes.map(e => e.id);
    const next = moveId(ids, id, step);
    if (next !== ids) setEnvelopeOrder.mutate({ ids: next });
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle" style={styles.flex}>
            Envelopes
          </ThemedText>
          {busy && <ActivityIndicator />}
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setReordering(r => !r)}>
            <ThemedText themeColor="accent">{reordering ? 'Done' : 'Reorder'}</ThemedText>
          </Pressable>
        </View>
        <ThemedText themeColor="textSecondary">
          {reordering
            ? 'Use the arrows to move groups, and envelopes within their group.'
            : 'Tap a group or envelope to rename, hide or delete it. Hidden ones keep their history and money but drop out of pickers.'}
        </ThemedText>
        {error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            Couldn’t reorder: {error.message}
          </ThemedText>
        )}

        {envelopes.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : envelopes.error ? (
          <ThemedText themeColor="danger">Couldn’t load envelopes: {envelopes.error.message}</ThemedText>
        ) : (
          groups.map((group, gi) => (
            <View key={group.id}>
              <View style={styles.groupHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Edit this group"
                  disabled={reordering}
                  onPress={() => router.push({ pathname: '/envelopes/group/[id]', params: { id: group.id } })}
                  style={({ pressed }) => [styles.flex, pressed && styles.dim]}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
                    {group.name}
                    {group.hidden ? ' · Hidden' : ''}
                  </ThemedText>
                </Pressable>
                {reordering ? (
                  <Arrows
                    label={group.name}
                    first={gi === 0}
                    last={gi === groups.length - 1}
                    disabled={busy}
                    onMove={step => moveGroup(group.id, step)}
                  />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add an envelope to ${group.name}`}
                    hitSlop={8}
                    onPress={() =>
                      router.push({ pathname: '/envelopes/[id]', params: { id: 'new', groupId: group.id } })
                    }>
                    <ThemedText type="smallBold" themeColor="accent">
                      + Add
                    </ThemedText>
                  </Pressable>
                )}
              </View>
              <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
                {group.envelopes.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.row}>
                    No envelopes yet
                  </ThemedText>
                )}
                {group.envelopes.map((c, i) => (
                  <View
                    key={c.id}
                    style={[
                      styles.row,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                    ]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityHint="Edit this envelope"
                      disabled={reordering}
                      onPress={() => router.push({ pathname: '/envelopes/[id]', params: { id: c.id } })}
                      style={({ pressed }) => [styles.flex, pressed && styles.dim]}>
                      <ThemedText themeColor={isHidden(group, c) ? 'textSecondary' : 'text'}>
                        {c.name}
                        {c.hidden ? ' (hidden)' : ''}
                      </ThemedText>
                    </Pressable>
                    {reordering && (
                      <Arrows
                        label={c.name}
                        first={i === 0}
                        last={i === group.envelopes.length - 1}
                        disabled={busy}
                        onMove={step => moveEnvelope(group, c.id, step)}
                      />
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        {!reordering && !envelopes.isPending && (
          <Button
            variant="plain"
            title="Add group"
            onPress={() => router.push({ pathname: '/envelopes/group/[id]', params: { id: 'new' } })}
          />
        )}
        <Button variant="plain" title="Close" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

function Arrows({
  label,
  first,
  last,
  disabled,
  onMove,
}: {
  label: string;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove(step: -1 | 1): void;
}) {
  const arrow = (step: -1 | 1, off: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Move ${label} ${step < 0 ? 'up' : 'down'}`}
      accessibilityState={{ disabled: off || disabled }}
      disabled={off || disabled}
      hitSlop={6}
      onPress={() => onMove(step)}
      style={({ pressed }) => [styles.arrow, pressed && styles.dim]}>
      <ThemedText themeColor={off ? 'textSecondary' : 'accent'}>{step < 0 ? '▲' : '▼'}</ThemedText>
    </Pressable>
  );
  return (
    <View style={styles.arrows}>
      {arrow(-1, first)}
      {arrow(1, last)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
    paddingHorizontal: Spacing.one,
    gap: Spacing.two,
  },
  caps: { textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { borderRadius: 12, overflow: 'hidden' },
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
