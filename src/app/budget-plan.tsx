import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ChoiceGroup, ChoiceRow } from '@/components/choice';
import { Button } from '@/components/form';
import { IconButton } from '@/components/icon-button';
import { KeyboardView } from '@/components/keyboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showToast } from '@/components/toast';
import { isHidden } from '@/domain/categories';
import { formatCents } from '@/domain/money';
import { PAY_SCHEDULES, perPaycheck, type PaySchedule } from '@/domain/paychecks';
import { amountFields, signedAmount } from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSetPaySchedule, useSetTargets } from '@/lib/budget';
import { useEnvelopes, useHousehold, type EnvelopeGroup, type Household } from '@/lib/queries';

/** Blank is zero; null means it isn't a number. */
function cents(text: string): number | null {
  if (!text.trim()) return 0;
  try {
    return signedAmount(text, 'in');
  } catch {
    return null;
  }
}

/**
 * Modal from Settings and Fill from budget: the monthly budget (what each
 * envelope should get in a month, its target) and how often pay comes, so
 * "Fill from budget" can split the budget across paychecks.
 */
export default function BudgetPlanScreen() {
  const household = useHousehold(true);
  const groups = useEnvelopes();

  return (
    <ThemedView style={styles.container}>
      <KeyboardView style={styles.container}>
        {household.data && groups.data ? (
          <PlanForm household={household.data} groups={groups.data} />
        ) : household.error || groups.error ? (
          <ThemedText themeColor="danger" style={styles.content}>
            Couldn’t load the budget: {(household.error ?? groups.error)?.message}
          </ThemedText>
        ) : (
          <ActivityIndicator style={styles.loading} />
        )}
      </KeyboardView>
    </ThemedView>
  );
}

function PlanForm({ household, groups }: { household: Household; groups: EnvelopeGroup[] }) {
  const theme = useTheme();
  const setTargets = useSetTargets();
  const setSchedule = useSetPaySchedule();
  const visible = groups
    .map(g => ({ ...g, envelopes: g.envelopes.filter(e => !isHidden(g, e)) }))
    .filter(g => g.envelopes.length > 0);
  const envelopes = visible.flatMap(g => g.envelopes);
  const [schedule, setScheduleChoice] = useState<PaySchedule>(household.paySchedule);
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(envelopes.map(e => [e.id, e.target ? amountFields(e.target).text : ''])),
  );
  const [error, setError] = useState<string | null>(null);
  const busy = setTargets.isPending || setSchedule.isPending;

  const amounts = Object.fromEntries(envelopes.map(e => [e.id, cents(texts[e.id] ?? '')]));
  const monthly = envelopes.reduce((s, e) => s + (amounts[e.id] ?? 0), 0);
  const label = PAY_SCHEDULES.find(s => s.value === schedule)?.label ?? '';

  async function save() {
    setError(null);
    const bad = envelopes.find(e => amounts[e.id] === null);
    if (bad) {
      setError(`Check the amount for ${bad.name}.`);
      return;
    }
    const changed = envelopes
      .filter(e => (amounts[e.id] || null) !== (e.target || null))
      .map(e => ({ envelopeId: e.id, target: amounts[e.id] || null }));
    try {
      await Promise.all([
        changed.length > 0 ? setTargets.mutateAsync(changed) : null,
        schedule !== household.paySchedule ? setSchedule.mutateAsync({ householdId: household.id, schedule }) : null,
      ]);
      showToast('Monthly budget saved');
      router.back();
    } catch (e) {
      setError(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <ThemedText type="subtitle" style={styles.flex}>
          Monthly budget
        </ThemedText>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <ThemedText themeColor="textSecondary">
        What each envelope should get in a month. When a paycheck comes in, “Fill from budget” on the Budget
        tab adds each envelope’s share of it.
      </ThemedText>

      <ChoiceGroup label="Paid">
        {PAY_SCHEDULES.map((s, i) => (
          <ChoiceRow
            key={s.value}
            label={s.label}
            detail={`${s.perYear} a year`}
            selected={schedule === s.value}
            first={i === 0}
            onPress={() => setScheduleChoice(s.value)}
          />
        ))}
      </ChoiceGroup>

      <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Each month
        </ThemedText>
        <ThemedText style={styles.big} numberOfLines={1}>
          {formatCents(monthly)}
        </ThemedText>
        <View style={styles.paycheckLine}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Each paycheck ({label.toLowerCase()})
          </ThemedText>
          <ThemedText style={styles.medium}>
            {schedule === 'twice_monthly' || schedule === 'monthly' ? '' : 'about '}
            {formatCents(perPaycheck(monthly, schedule))}
          </ThemedText>
        </View>
      </View>

      {visible.map(group => (
        <View key={group.id} style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
            {group.name}
          </ThemedText>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            {group.envelopes.map((e, i) => {
              const amount = amounts[e.id];
              return (
                <View
                  key={e.id}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
                  <View style={styles.flex}>
                    <ThemedText numberOfLines={1} style={styles.name}>
                      {e.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor={amount === null ? 'danger' : 'textSecondary'}>
                      {amount === null
                        ? 'Not an amount'
                        : amount > 0
                          ? `${formatCents(perPaycheck(amount, schedule))} a paycheck`
                          : 'Not in the budget'}
                    </ThemedText>
                  </View>
                  <TextInput
                    accessibilityLabel={`${e.name} each month`}
                    value={texts[e.id] ?? ''}
                    onChangeText={text => setTexts(t => ({ ...t, [e.id]: text }))}
                    placeholder="$0"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {error && <ThemedText themeColor="danger">{error}</ThemedText>}
      <Button title="Save monthly budget" loading={busy} onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  summary: { borderRadius: 20, padding: Spacing.three, gap: Spacing.half },
  paycheckLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, marginTop: Spacing.one },
  big: { fontSize: 26, lineHeight: 32, fontWeight: 800, fontVariant: ['tabular-nums'] },
  medium: { fontSize: 17, fontWeight: 700, fontVariant: ['tabular-nums'] },
  group: { gap: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.two },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  name: { fontWeight: 600 },
  input: {
    width: 110,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    textAlign: 'right',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  flex: { flex: 1 },
});
