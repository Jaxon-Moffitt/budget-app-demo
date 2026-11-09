import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ChoiceGroup, ChoiceRow, Chooser } from '@/components/choice';
import { FillBar } from '@/components/fill-bar';
import { Button } from '@/components/form';
import { IconButton } from '@/components/icon-button';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showToast } from '@/components/toast';
import { accountDisplayName } from '@/domain/accounts';
import { checkMove, envelopeView, linkedCheck, quickPicks, type QuickPick } from '@/domain/envelope';
import { formatCents } from '@/domain/money';
import { formatMonth, monthName, type Month } from '@/domain/month';
import { signedAmount } from '@/domain/transactions';
import { FontFamilies, Spacing, STATUS_COLOR } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBudget, useSetAssigned, useUpdateEnvelopeMoney, type BudgetView } from '@/lib/budget';
import { useAccounts, useEnvelopeTransactions, type Envelope, type EnvelopeGroup } from '@/lib/queries';

type Mode = 'add' | 'out' | 'start';
const MODES = [
  { value: 'add', label: 'Add money' },
  { value: 'out', label: 'Take out' },
  { value: 'start', label: 'Starting' },
] as const;

/** Where money comes from or goes to: Ready to assign (null) or another envelope. */
type Other = string | null;

/**
 * Sheet from the Budget tab: one envelope's balance, moving money in or out
 * (from Ready to assign or another envelope), its starting balance, and
 * everything spent from it this month.
 */
export default function EnvelopeScreen() {
  const { envelopeId, month } = useLocalSearchParams<{ envelopeId: string; month: Month }>();
  const budget = useBudget(month);
  const group = budget.view?.groups.find(g => g.envelopes.some(e => e.id === envelopeId));
  const envelope = group?.envelopes.find(e => e.id === envelopeId);
  const householdId = budget.household.data?.id;

  return (
    <ThemedView style={styles.container}>
      {budget.view && group && envelope && householdId ? (
        <EnvelopeSheet
          view={budget.view}
          group={group}
          envelope={envelope}
          month={month}
          householdId={householdId}
        />
      ) : (
        <ActivityIndicator style={styles.loading} />
      )}
    </ThemedView>
  );
}

function EnvelopeSheet({
  view,
  group,
  envelope,
  month,
  householdId,
}: {
  view: BudgetView;
  group: EnvelopeGroup;
  envelope: Envelope;
  month: Month;
  householdId: string;
}) {
  const theme = useTheme();
  const setAssigned = useSetAssigned();
  const updateMoney = useUpdateEnvelopeMoney();
  const v = envelopeView(view.month.envelopes[envelope.id]);
  const ready = view.month.readyToAssign;
  const balanceOf = (id: string) => view.month.envelopes[id]?.balance ?? 0;
  const assignedOf = (id: string) => view.month.envelopes[id]?.assigned ?? 0;
  const nameOf = (id: string) => view.envelopes.find(e => e.id === id)?.name ?? 'Envelope';

  // Opening an overspent envelope starts on covering it.
  const [mode, setMode] = useState<Mode>('add');
  const [text, setText] = useState(v.status === 'over' ? centsText(-v.balance) : '');
  const [other, setOther] = useState<Other>(null);
  const [startText, setStartText] = useState(centsText(envelope.starting_balance));
  const [error, setError] = useState<string | null>(null);

  const typed = parse(text);
  const amount = typed ?? 0;
  const otherName = other === null ? 'Ready to assign' : nameOf(other);
  const check =
    mode === 'add'
      ? checkMove(amount, other === null ? ready : balanceOf(other), other === null)
      : checkMove(amount, v.balance, false);
  const canSave = check.kind === 'ok' || check.kind === 'overbudget';

  function changeMode(next: Mode) {
    setMode(next);
    setOther(null);
    setError(null);
  }

  async function move() {
    setError(null);
    const [from, to] = mode === 'add' ? [other, envelope.id] : [envelope.id, other];
    const amounts = [
      ...(from ? [{ envelopeId: from, assigned: assignedOf(from) - amount }] : []),
      ...(to ? [{ envelopeId: to, assigned: assignedOf(to) + amount }] : []),
    ];
    try {
      await setAssigned.mutateAsync({ householdId, month, amounts });
      showToast(
        mode === 'add'
          ? `Added ${formatCents(amount)} to ${envelope.name}`
          : `Moved ${formatCents(amount)} to ${otherName}`,
      );
      router.back();
    } catch (err) {
      setError(`Couldn’t save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function saveStart() {
    setError(null);
    let cents = 0;
    try {
      cents = startText.trim() ? signedAmount(startText, 'in') : 0;
    } catch {
      setError('Enter the amount as a number, like 2500.00.');
      return;
    }
    try {
      await updateMoney.mutateAsync({ envelopeId: envelope.id, changes: { starting_balance: cents } });
      showToast(`${envelope.name} starts with ${formatCents(cents)}`);
      router.back();
    } catch (err) {
      setError(`Couldn’t save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const helper =
    check.kind === 'overbudget'
      ? { text: `That’s ${formatCents(check.by)} more than Ready to assign. You’ll be over until money comes back out of an envelope.`, color: 'warning' as const }
      : check.kind === 'too-much'
        ? { text: `Only ${formatCents(check.most)} is in ${mode === 'add' ? otherName : 'this envelope'}.`, color: 'danger' as const }
        : mode === 'add'
          ? { text: `Comes from ${otherName} (${formatCents(other === null ? ready : balanceOf(other))}).`, color: 'textSecondary' as const }
          : { text: `Goes to ${otherName}.`, color: 'textSecondary' as const };

  // Envelopes with money to give, for covering or moving.
  const sources = view.envelopes.filter(e => e.id !== envelope.id && balanceOf(e.id) > 0);
  const destinations = view.envelopes.filter(e => e.id !== envelope.id);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // Android: lets the list scroll back up inside the sheet instead of
      // every downward drag pulling the sheet closed.
      nestedScrollEnabled>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            {group.name}
          </ThemedText>
          <ThemedText style={styles.name} accessibilityRole="header">
            {envelope.name}
          </ThemedText>
        </View>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>

      <View style={styles.balance}>
        <View style={styles.balanceLine}>
          <ThemedText themeColor={STATUS_COLOR[v.status]} style={styles.available}>
            {formatCents(v.balance)}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{v.status === 'over' ? 'overspent' : 'left'}</ThemedText>
        </View>
        <FillBar fill={v.fill} color={theme[STATUS_COLOR[v.status]]} height={8} />
        <View style={styles.balanceLine}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {formatCents(v.spent)} spent{v.invested !== 0 ? ` · ${formatCents(v.invested)} invested` : ''}
            {v.received !== 0 ? ` · ${formatCents(v.received)} income` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {v.carried !== 0
              ? `${formatCents(v.carried)} carried ${v.added < 0 ? '−' : '+'} ${formatCents(Math.abs(v.added))} added`
              : `${formatCents(v.added)} added`}
          </ThemedText>
        </View>
      </View>

      <LinkedAccount view={view} envelope={envelope} />

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Segmented<Mode> options={MODES} value={mode} onChange={changeMode} />

        {mode === 'start' ? (
          <>
            <TextInput
              accessibilityLabel="Starting balance"
              value={startText}
              onChangeText={setStartText}
              placeholder="$0.00"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.amountInput, { color: theme.text }]}
            />
            <Button
              title="Save starting balance"
              loading={updateMoney.isPending}
              onPress={saveStart}
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              What this envelope already held when you started budgeting in {formatMonth(view.start)},
              like savings set aside before. It comes out of your starting Ready to assign.
            </ThemedText>
          </>
        ) : (
          <>
            <TextInput
              accessibilityLabel={mode === 'add' ? 'Amount to add' : 'Amount to take out'}
              value={text}
              onChangeText={setText}
              placeholder="$0.00"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.amountInput, { color: theme.text }]}
            />
            {mode === 'add' && (
              <View style={styles.chips}>
                {quickPicks(v, envelope.target).map(p => (
                  <Chip
                    key={`${p.kind}-${p.amount}`}
                    label={pickLabel(p)}
                    selected={typed === p.amount}
                    onPress={() => setText(centsText(p.amount))}
                  />
                ))}
              </View>
            )}
            <Chooser label={mode === 'add' ? 'From' : 'To'} valueLabel={otherName} placeholder="Ready to assign">
              {close => (
                <ChoiceGroup>
                  <ChoiceRow
                    label="Ready to assign"
                    detail={formatCents(ready)}
                    selected={other === null}
                    first
                    onPress={() => {
                      setOther(null);
                      close();
                    }}
                  />
                  {(mode === 'add' ? sources : destinations).map(e => (
                    <ChoiceRow
                      key={e.id}
                      label={e.name}
                      detail={formatCents(balanceOf(e.id))}
                      selected={other === e.id}
                      first={false}
                      onPress={() => {
                        setOther(e.id);
                        close();
                      }}
                    />
                  ))}
                </ChoiceGroup>
              )}
            </Chooser>
            <Button
              title={
                check.kind === 'none'
                  ? 'Enter an amount'
                  : mode === 'add'
                    ? `Add ${formatCents(amount)} to ${envelope.name}`
                    : `Move ${formatCents(amount)} to ${otherName}`
              }
              disabled={!canSave}
              loading={setAssigned.isPending}
              onPress={move}
            />
            <ThemedText type="small" themeColor={helper.color} style={styles.center} accessibilityLiveRegion="polite">
              {helper.text}
            </ThemedText>
          </>
        )}
        {error && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        )}
      </View>

      <Button
        variant="plain"
        title="Exact amount, target and linked account"
        onPress={() =>
          router.push({ pathname: '/budget/[envelopeId]', params: { envelopeId: envelope.id, month } })
        }
      />

      <Spending envelopeId={envelope.id} month={month} />
    </ScrollView>
  );
}

/**
 * For an envelope tied to a savings account: whether the account holds what
 * its envelopes say. Display only; nothing is moved.
 */
function LinkedAccount({ view, envelope }: { view: BudgetView; envelope: Envelope }) {
  const theme = useTheme();
  const accounts = useAccounts();
  const account = accounts.data?.find(a => a.id === envelope.linked_account_id);
  if (!account) return null;

  const linked = view.envelopes.filter(e => e.linked_account_id === account.id);
  const check = linkedCheck(
    account.balance,
    linked.map(e => view.month.envelopes[e.id]?.balance ?? 0),
  );
  const names = linked.length > 1 ? `${linked.map(e => e.name).join(' + ')} hold` : 'This envelope holds';
  const status =
    check.difference === 0
      ? { text: 'They match.', color: 'accent' as const }
      : check.difference > 0
        ? { text: `The account has ${formatCents(check.difference)} more than its envelopes.`, color: 'textSecondary' as const }
        : { text: `Move ${formatCents(-check.difference)} into ${accountDisplayName(account)} to match.`, color: 'warning' as const };

  return (
    <View style={[styles.linked, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small">
        {names} {formatCents(check.envelopes)}. {accountDisplayName(account)} has {formatCents(check.account)}.
      </ThemedText>
      <ThemedText type="small" themeColor={status.color}>
        {status.text}
      </ThemedText>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: theme.text, borderColor: theme.text } : { borderColor: theme.border },
        pressed && styles.dim,
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Spending({ envelopeId, month }: { envelopeId: string; month: Month }) {
  const theme = useTheme();
  const txns = useEnvelopeTransactions(envelopeId, month);
  const short = monthName(month, 'short');

  return (
    <View>
      <ThemedText style={styles.sectionTitle}>Transactions in {monthName(month)}</ThemedText>
      {txns.isPending ? (
        <ActivityIndicator />
      ) : txns.error ? (
        <ThemedText themeColor="danger">Couldn’t load transactions: {txns.error.message}</ThemedText>
      ) : txns.data.length === 0 ? (
        <ThemedText themeColor="textSecondary" style={[styles.txn, { borderColor: theme.border }]}>
          Nothing spent from this envelope yet.
        </ThemedText>
      ) : (
        txns.data.map(t => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityHint="Edit or move to another envelope"
            onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.openId } })}
            style={({ pressed }) => [styles.txn, { borderColor: theme.border }, pressed && styles.dim]}>
            <View style={styles.date}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.caps}>
                {short}
              </ThemedText>
              <ThemedText style={styles.day}>{Number(t.date.slice(8))}</ThemedText>
            </View>
            <View style={styles.flex}>
              <ThemedText numberOfLines={1} style={styles.payee}>
                {t.payee}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {[
                  t.isInvestment ? 'Invested' : t.isIncome ? 'Income' : t.category,
                  t.account,
                  t.isSplitPart ? 'Part of a split' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
            <ThemedText themeColor={t.amount > 0 ? 'accent' : 'text'} style={styles.txnAmount}>
              {formatCents(t.amount)}
            </ThemedText>
          </Pressable>
        ))
      )}
    </View>
  );
}

function pickLabel(p: QuickPick): string {
  const money = formatCents(p.amount);
  switch (p.kind) {
    case 'cover':
      return `Cover ${money}`;
    case 'refill':
      return `Refill ${money}`;
    case 'target':
      return `To target ${money}`;
    case 'round':
      return `+${money.replace('.00', '')}`;
  }
}

/** Whole dollars without cents, so a quick pick reads "25" rather than "25.00". */
function centsText(cents: number): string {
  if (cents === 0) return '';
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

/** Positive cents, or null when blank, zero or not a number. */
function parse(text: string): number | null {
  if (!text.trim()) return null;
  try {
    const cents = signedAmount(text, 'in');
    return cents === 0 ? null : cents;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.four, paddingTop: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  name: { fontSize: 24, lineHeight: 30, fontWeight: 800, letterSpacing: -0.3 },
  balance: { gap: Spacing.two + Spacing.half },
  balanceLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  available: { fontSize: 40, lineHeight: 46, fontWeight: 800, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  linked: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.three },
  amountInput: {
    fontFamily: FontFamilies[800],
    fontSize: 36,
    textAlign: 'center',
    paddingVertical: Spacing.one,
    fontVariant: ['tabular-nums'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two },
  chip: {
    borderWidth: 1,
    borderRadius: 18,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  sectionTitle: { fontWeight: 700, marginBottom: Spacing.one },
  txn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  date: { width: 40, alignItems: 'center' },
  caps: { textTransform: 'uppercase', fontSize: 11, lineHeight: 13 },
  day: { fontSize: 17, lineHeight: 20, fontWeight: 700 },
  payee: { fontWeight: 600 },
  txnAmount: { fontWeight: 600, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  dim: { opacity: 0.5 },
});
