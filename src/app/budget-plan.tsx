import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ChoiceGroup, ChoiceRow } from '@/components/choice';
import { EnvelopeChooser } from '@/components/envelope-picker';
import { Button } from '@/components/form';
import { IconButton } from '@/components/icon-button';
import { KeyboardView } from '@/components/keyboard-view';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showToast } from '@/components/toast';
import { isHidden } from '@/domain/categories';
import { formatCents } from '@/domain/money';
import { leftover, monthlyFromPaycheck, PAY_SCHEDULES, perPaycheck, type PaySchedule } from '@/domain/paychecks';
import { amountFields, signedAmount } from '@/domain/transactions';
import { FontFamilies, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSetTargets, useUpdateBudgetPlan } from '@/lib/budget';
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

type Per = 'paycheck' | 'month';
const PERS = [
  { value: 'paycheck', label: 'Per paycheck' },
  { value: 'month', label: 'Per month' },
] as const;

/**
 * Modal from Settings and Fill from budget: the monthly budget (what each
 * envelope should get in a month, its target), how often pay comes, the
 * expected income, and the envelope that takes what's left over, so "Fill
 * from budget" can split it all across paychecks.
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
  const updatePlan = useUpdateBudgetPlan();
  const visible = groups
    .map(g => ({ ...g, envelopes: g.envelopes.filter(e => !isHidden(g, e)) }))
    .filter(g => g.envelopes.length > 0);
  const envelopes = visible.flatMap(g => g.envelopes);
  const [schedule, setScheduleChoice] = useState<PaySchedule>(household.paySchedule);
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(envelopes.map(e => [e.id, e.target ? amountFields(e.target).text : ''])),
  );
  // Income is entered per paycheck by default (what a pay stub says) and
  // stored per month. Left untouched, the stored amount is kept as is, so
  // converting back and forth never drifts by a cent.
  const initialIncomeText =
    household.expectedIncome !== null ? amountFields(perPaycheck(household.expectedIncome, household.paySchedule)).text : '';
  const [per, setPer] = useState<Per>('paycheck');
  const [incomeText, setIncomeText] = useState(initialIncomeText);
  const [leftoverId, setLeftoverId] = useState<string | null>(household.leftoverEnvelopeId);
  const [error, setError] = useState<string | null>(null);
  const busy = setTargets.isPending || updatePlan.isPending;

  const amounts = Object.fromEntries(envelopes.map(e => [e.id, cents(texts[e.id] ?? '')]));
  const monthly = envelopes.reduce((s, e) => s + (amounts[e.id] ?? 0), 0);
  const label = PAY_SCHEDULES.find(s => s.value === schedule)?.label ?? '';
  const incomeEntered = incomeText.trim() ? cents(incomeText) : null;
  const untouched = incomeText === initialIncomeText && per === 'paycheck' && schedule === household.paySchedule;
  const income: number | null = untouched
    ? household.expectedIncome
    : incomeEntered === null
      ? null
      : per === 'paycheck'
        ? monthlyFromPaycheck(incomeEntered, schedule)
        : incomeEntered;
  const left = leftover(income, Object.values(amounts));
  const incomeInvalid = incomeText.trim() !== '' && cents(incomeText) === null;

  async function save() {
    setError(null);
    const bad = envelopes.find(e => amounts[e.id] === null);
    if (bad) {
      setError(`Check the amount for ${bad.name}.`);
      return;
    }
    if (incomeInvalid) {
      setError('Check the expected income.');
      return;
    }
    const planChanges = {
      ...(schedule !== household.paySchedule ? { pay_schedule: schedule } : {}),
      ...(income !== household.expectedIncome ? { expected_income: income } : {}),
      ...(leftoverId !== household.leftoverEnvelopeId ? { leftover_envelope_id: leftoverId } : {}),
    };
    const changed = envelopes
      .filter(e => (amounts[e.id] || null) !== (e.target || null))
      .map(e => ({ envelopeId: e.id, target: amounts[e.id] || null }));
    try {
      await Promise.all([
        changed.length > 0 ? setTargets.mutateAsync(changed) : null,
        Object.keys(planChanges).length > 0
          ? updatePlan.mutateAsync({ householdId: household.id, changes: planChanges })
          : null,
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

      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
          Expected income
        </ThemedText>
        <View style={[styles.incomeCard, { backgroundColor: theme.backgroundElement }]}>
          <Segmented<Per> options={PERS} value={per} onChange={setPer} />
          <TextInput
            accessibilityLabel={per === 'paycheck' ? 'Expected income per paycheck' : 'Expected income per month'}
            value={incomeText}
            onChangeText={setIncomeText}
            placeholder="$0.00"
            placeholderTextColor={theme.textSecondary}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.incomeInput, { color: theme.text }]}
          />
          <ThemedText type="small" themeColor={incomeInvalid ? 'danger' : 'textSecondary'} style={styles.center}>
            {incomeInvalid
              ? 'Not an amount'
              : income === null
                ? 'Take-home pay, after taxes. For planning only: Ready to assign uses what actually comes in.'
                : per === 'paycheck'
                  ? `${formatCents(income)} a month`
                  : `${schedule === 'twice_monthly' || schedule === 'monthly' ? '' : 'About '}${formatCents(perPaycheck(income, schedule))} a paycheck`}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
        {income !== null && (
          <View style={styles.summaryLine}>
            <ThemedText style={styles.flex}>Expected income</ThemedText>
            <ThemedText style={styles.medium}>{formatCents(income)}</ThemedText>
          </View>
        )}
        <View style={styles.summaryLine}>
          <ThemedText style={styles.flex}>Budgeted</ThemedText>
          <ThemedText style={styles.medium}>{income !== null ? '−' : ''}{formatCents(monthly)}</ThemedText>
        </View>
        {left !== null && (
          <View style={[styles.summaryLine, styles.leftLine, { borderColor: theme.border }]}>
            <ThemedText style={[styles.flex, styles.bold]}>{left < 0 ? 'Over budget' : 'Left over'}</ThemedText>
            <ThemedText style={styles.big} themeColor={left < 0 ? 'danger' : 'accent'}>
              {formatCents(Math.abs(left))}
            </ThemedText>
          </View>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          A month · {schedule === 'twice_monthly' || schedule === 'monthly' ? '' : 'about '}
          {formatCents(perPaycheck(monthly, schedule))} budgeted each paycheck ({label.toLowerCase()})
        </ThemedText>
        {left !== null && left < 0 && (
          <ThemedText type="small" themeColor="danger">
            The envelopes ask for {formatCents(-left)} more than you expect to earn.
          </ThemedText>
        )}
      </View>

      {income !== null && (
        <View style={styles.group}>
          <EnvelopeChooser
            label="Leftover goes to"
            noneLabel="Stays in Ready to assign"
            value={leftoverId}
            onChange={setLeftoverId}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {leftoverId && left !== null && left > 0
              ? `Fill from budget adds the ${formatCents(left)} left over to this envelope, a share with each paycheck.`
              : 'Whatever the income leaves after the budget can go to one envelope, like savings, each time you fill.'}
          </ThemedText>
        </View>
      )}

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
  summary: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two },
  summaryLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  leftLine: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  bold: { fontWeight: 700 },
  incomeCard: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two },
  incomeInput: { fontFamily: FontFamilies[800], fontSize: 32, textAlign: 'center', paddingVertical: Spacing.one, fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  hint: { paddingHorizontal: Spacing.two },
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
