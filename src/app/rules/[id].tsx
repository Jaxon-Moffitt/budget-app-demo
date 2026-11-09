import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryChooser } from '@/components/category-picker';
import { ChoiceGroup, ChoiceRow, Chooser } from '@/components/choice';
import { EnvelopeChooser } from '@/components/envelope-picker';
import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showToast } from '@/components/toast';
import { accountDisplayName, compareAccounts } from '@/domain/accounts';
import { nextSortOrder } from '@/domain/categories';
import { ruleProblem, type RuleDirection, type RuleDraft } from '@/domain/rules';
import { kindAllowsEnvelope, kindUsesEnvelope, type TransactionKind } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { confirmDestructive } from '@/lib/confirm';
import { useAccounts, useHousehold } from '@/lib/queries';
import { useDeleteRule, useRules, useSaveRule, type Rule } from '@/lib/rules';

const DIRECTIONS = [
  { value: 'any', label: 'Either' },
  { value: 'in', label: 'Money in' },
  { value: 'out', label: 'Money out' },
] as const;

const KINDS = [
  { value: 'spending', label: 'Spend' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'investment', label: 'Invest' },
] as const;

const KIND_NOTES: Record<TransactionKind, string> = {
  spending: 'Comes out of the envelope below.',
  income: 'Goes to Ready to assign, or straight into the envelope you pick below.',
  transfer:
    'Ignored by the budget, for transfers whose other side isn’t in the app. Transfers between your own accounts are matched without a rule.',
  investment: 'Money sent to an investment account, taken from the envelope below.',
};

type Params = {
  id: string;
  match?: string;
  direction?: string;
  accountId?: string;
  kind?: string;
  envelopeId?: string;
  categoryId?: string;
};

/**
 * Modal from Rules, or from a transaction's "Make a rule" (id "new", with
 * the transaction's values as a starting point).
 */
export default function EditRuleScreen() {
  const params = useLocalSearchParams<Params>();
  const rules = useRules();
  const household = useHousehold(true);
  const rule = rules.data?.find(r => r.id === params.id) ?? null;

  return (
    <ThemedView style={styles.container}>
      {rules.data && household.data && (params.id === 'new' || rule) ? (
        <RuleForm
          key={params.id}
          householdId={household.data.id}
          rule={rule}
          initial={rule ? fromRule(rule) : fromParams(params)}
          sortOrder={nextSortOrder(rules.data)}
        />
      ) : rules.isPending || household.isPending ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">This rule no longer exists.</ThemedText>
          <Button variant="plain" title="Close" onPress={() => router.back()} />
        </View>
      )}
    </ThemedView>
  );
}

function fromRule(rule: Rule): RuleDraft {
  return {
    matchText: rule.match_text,
    direction: rule.direction,
    accountId: rule.account_id,
    kind: rule.kind,
    envelopeId: rule.envelope_id,
    categoryId: rule.category_id,
  };
}

function fromParams(p: Params): RuleDraft {
  const kinds: TransactionKind[] = ['spending', 'income', 'transfer', 'investment'];
  return {
    matchText: p.match ?? '',
    direction: p.direction === 'in' || p.direction === 'out' ? p.direction : null,
    accountId: p.accountId || null,
    kind: kinds.includes(p.kind as TransactionKind) ? (p.kind as TransactionKind) : 'spending',
    envelopeId: p.envelopeId || null,
    categoryId: p.categoryId || null,
  };
}

function RuleForm({
  householdId,
  rule,
  initial,
  sortOrder,
}: {
  householdId: string;
  /** Null when adding. */
  rule: Rule | null;
  initial: RuleDraft;
  sortOrder: number;
}) {
  const accounts = useAccounts();
  const save = useSaveRule();
  const remove = useDeleteRule();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => setDraft(d => ({ ...d, [key]: value }));

  const options = (accounts.data ?? [])
    .filter(a => a.on_budget && (!a.closed || a.id === draft.accountId))
    .sort(compareAccounts);
  const account = options.find(a => a.id === draft.accountId);

  async function submit() {
    setError(null);
    const problem = ruleProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      const filed = await save.mutateAsync({ id: rule?.id ?? null, householdId, rule: draft, sortOrder });
      showToast(filed > 0 ? `Rule saved · filed ${filed} transaction${filed === 1 ? '' : 's'}` : 'Rule saved');
      router.back();
    } catch (e) {
      setError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function confirmDelete() {
    if (!rule) return;
    confirmDestructive(
      'Delete this rule?',
      'Transactions it already filed stay as they are.',
      'Delete',
      () =>
        remove.mutateAsync({ id: rule.id }).then(
          () => router.back(),
          e => setError(`Couldn’t delete: ${e instanceof Error ? e.message : String(e)}`),
        ),
    );
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">{rule ? 'Edit rule' : 'New rule'}</ThemedText>

        <TextField
          label="When the bank description contains"
          placeholder="e.g. PAYROLL"
          value={draft.matchText}
          onChangeText={text => set('matchText', text)}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={100}
          autoFocus={!rule && !initial.matchText}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Upper or lower case doesn’t matter. Leave out numbers that change, like store or card
          numbers.
        </ThemedText>

        <ThemedText type="smallBold" style={styles.label}>
          Money
        </ThemedText>
        <Segmented<'any' | RuleDirection>
          options={DIRECTIONS}
          value={draft.direction ?? 'any'}
          onChange={d => set('direction', d === 'any' ? null : d)}
        />

        <Chooser label="Account" valueLabel={account ? accountDisplayName(account) : 'Any account'} placeholder="Any account">
          {close => (
            <ChoiceGroup>
              <ChoiceRow
                label="Any account"
                muted
                selected={draft.accountId === null}
                first
                onPress={() => {
                  set('accountId', null);
                  close();
                }}
              />
              {options.map(a => (
                <ChoiceRow
                  key={a.id}
                  label={accountDisplayName(a)}
                  selected={a.id === draft.accountId}
                  first={false}
                  onPress={() => {
                    set('accountId', a.id);
                    close();
                  }}
                />
              ))}
            </ChoiceGroup>
          )}
        </Chooser>

        <ThemedText type="smallBold" style={styles.label}>
          File it as
        </ThemedText>
        <Segmented<TransactionKind> options={KINDS} value={draft.kind} onChange={k => set('kind', k)} />
        <ThemedText type="small" themeColor="textSecondary">
          {KIND_NOTES[draft.kind]}
        </ThemedText>
        {kindAllowsEnvelope(draft.kind) && (
          <EnvelopeChooser
            label={draft.kind === 'investment' ? 'Comes from envelope' : draft.kind === 'income' ? 'Goes to' : 'Envelope'}
            noneLabel={draft.kind === 'income' ? 'Ready to assign' : undefined}
            value={draft.envelopeId}
            onChange={id => set('envelopeId', id)}
          />
        )}
        {draft.kind !== 'transfer' && (
          <CategoryChooser
            value={draft.categoryId}
            onChange={c =>
              setDraft(d => ({
                ...d,
                categoryId: c?.id ?? null,
                envelopeId: d.envelopeId ?? (kindUsesEnvelope(d.kind) ? (c?.default_envelope_id ?? null) : null),
              }))
            }
          />
        )}

        {error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        )}
        <Button title={rule ? 'Save rule' : 'Add rule'} loading={save.isPending} onPress={submit} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Saving also files any matching transactions waiting for review.
        </ThemedText>
        <Button variant="plain" title="Cancel" onPress={() => router.back()} />
        {rule && (
          <View style={styles.danger}>
            <Button variant="plain" title="Delete rule" disabled={remove.isPending} onPress={confirmDelete} />
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
  label: { marginTop: Spacing.two },
  center: { textAlign: 'center' },
  danger: { marginTop: Spacing.four },
});
