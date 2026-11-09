import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showToast } from '@/components/toast';
import { accountDisplayName } from '@/domain/accounts';
import { moveId } from '@/domain/categories';
import { KIND_LABELS } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccounts, useCategories, useEnvelopes } from '@/lib/queries';
import { useApplyRules, useRules, useSetRuleOrder, type Rule } from '@/lib/rules';

/** Modal from Settings: the rules that file bank transactions automatically. */
export default function RulesScreen() {
  const theme = useTheme();
  const rules = useRules();
  const accounts = useAccounts();
  const envelopes = useEnvelopes();
  const categories = useCategories();
  const setOrder = useSetRuleOrder();
  const apply = useApplyRules();
  const [reordering, setReordering] = useState(false);
  const list = rules.data ?? [];

  const names = {
    account: (id: string | null) => {
      const a = accounts.data?.find(x => x.id === id);
      return a ? accountDisplayName(a) : null;
    },
    envelope: (id: string | null) => envelopes.data?.flatMap(g => g.envelopes).find(e => e.id === id)?.name ?? null,
    category: (id: string | null) => categories.data?.find(c => c.id === id)?.name ?? null,
  };

  function move(id: string, step: -1 | 1) {
    const ids = list.map(r => r.id);
    const next = moveId(ids, id, step);
    if (next !== ids) setOrder.mutate({ ids: next });
  }

  async function runNow() {
    try {
      const filed = await apply.mutateAsync();
      showToast(filed === 0 ? 'Nothing new to file' : `Filed ${filed} transaction${filed === 1 ? '' : 's'}`);
    } catch {
      // apply.error is shown below.
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle" style={styles.flex}>
            Rules
          </ThemedText>
          {setOrder.isPending && <ActivityIndicator />}
          {list.length > 1 && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setReordering(r => !r)}>
              <ThemedText themeColor="accent">{reordering ? 'Done' : 'Reorder'}</ThemedText>
            </Pressable>
          )}
        </View>
        <ThemedText themeColor="textSecondary">
          {reordering
            ? 'Rules are tried from the top; the first one that matches wins.'
            : 'New bank transactions are filed by the first rule whose text appears in their description. Transfers between your accounts, card payments included, are matched up on their own. Anything left goes to To review.'}
        </ThemedText>

        {rules.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : rules.error ? (
          <ThemedText themeColor="danger">Couldn’t load rules: {rules.error.message}</ThemedText>
        ) : list.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No rules yet. Add one here, or open a transaction and tap “Make a rule”.
          </ThemedText>
        ) : (
          <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
            {list.map((rule, i) => (
              <View
                key={rule.id}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Edit this rule"
                  disabled={reordering}
                  onPress={() => router.push({ pathname: '/rules/[id]', params: { id: rule.id } })}
                  style={({ pressed }) => [styles.flex, pressed && styles.dim]}>
                  <ThemedText numberOfLines={1}>“{rule.match_text}”</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {describe(rule, names)}
                  </ThemedText>
                </Pressable>
                {reordering && (
                  <View style={styles.arrows}>
                    {([-1, 1] as const).map(step => {
                      const off = step < 0 ? i === 0 : i === list.length - 1;
                      return (
                        <Pressable
                          key={step}
                          accessibilityRole="button"
                          accessibilityLabel={`Move “${rule.match_text}” ${step < 0 ? 'up' : 'down'}`}
                          disabled={off || setOrder.isPending}
                          hitSlop={6}
                          onPress={() => move(rule.id, step)}
                          style={({ pressed }) => [styles.arrow, pressed && styles.dim]}>
                          <ThemedText themeColor={off ? 'textSecondary' : 'accent'}>{step < 0 ? '▲' : '▼'}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {(setOrder.error || apply.error) && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {setOrder.error ? `Couldn’t reorder: ${setOrder.error.message}` : `Couldn’t run rules: ${apply.error?.message}`}
          </ThemedText>
        )}

        {!reordering && (
          <>
            <Button
              variant="tonal"
              title="Add rule"
              onPress={() => router.push({ pathname: '/rules/[id]', params: { id: 'new' } })}
            />
            <Button variant="plain" title="File waiting transactions now" loading={apply.isPending} onPress={runNow} />
          </>
        )}
        <Button variant="plain" title="Close" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

/** "Money in · Checking → Income", "→ Spend from Free to spend · Groceries". */
function describe(
  rule: Rule,
  names: {
    account(id: string | null): string | null;
    envelope(id: string | null): string | null;
    category(id: string | null): string | null;
  },
): string {
  const when = [
    rule.direction === 'in' ? 'Money in' : rule.direction === 'out' ? 'Money out' : null,
    names.account(rule.account_id),
  ].filter(Boolean);
  const envelope = names.envelope(rule.envelope_id);
  const then =
    rule.kind === 'spending'
      ? `Spend from ${envelope ?? 'an envelope'}`
      : rule.kind === 'investment'
        ? `Invest from ${envelope ?? 'an envelope'}`
        : rule.kind === 'income' && envelope
          ? `Income into ${envelope}`
          : KIND_LABELS[rule.kind];
  const category = names.category(rule.category_id);
  return `${when.length > 0 ? `${when.join(' · ')} ` : ''}→ ${then}${category ? ` · ${category}` : ''}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  empty: { marginTop: Spacing.three },
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
