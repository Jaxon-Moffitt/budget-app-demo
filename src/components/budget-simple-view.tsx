import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { accountDisplayName, compareAccounts } from '@/domain/accounts';
import { isHidden } from '@/domain/categories';
import { formatCents } from '@/domain/money';
import { localDate, monthName } from '@/domain/month';
import { defaultDiscretionary, monthBills } from '@/domain/simple';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUnfiledSpending } from '@/lib/analytics';
import { useForecasts } from '@/lib/forecast';
import { useAccounts } from '@/lib/queries';
import { useChosenEnvelopes } from '@/lib/simple-envelopes';

/**
 * The Budget tab at its simplest: money waiting to go into envelopes,
 * spending waiting for an envelope, how much is left in the everyday
 * envelopes, and this month's bills with whether each is already covered.
 */
export function BudgetSimpleView({ toggle }: { toggle: ReactNode }) {
  const theme = useTheme();
  const { forecasts, budget, isPending, error } = useForecasts();
  const accounts = useAccounts();
  const chosen = useChosenEnvelopes();
  const start = budget.household.data?.budgetStart ?? null;
  const unfiled = useUnfiledSpending(start ? `${start}-01` : null);
  const [refreshing, setRefreshing] = useState(false);
  const view = budget.view;
  const today = localDate();

  const bills = useMemo(() => [...(forecasts?.values() ?? [])].flatMap(f => f.bills), [forecasts]);
  const discretionary = useMemo(() => {
    if (!view) return [];
    const visible = view.groups.map(g => ({ ...g, envelopes: g.envelopes.filter(e => !isHidden(g, e)) }));
    const savings = new Set(
      (accounts.data ?? []).filter(a => a.type === 'savings' || a.type === 'emergency_fund').map(a => a.id),
    );
    const ids = chosen.data ?? defaultDiscretionary(visible, new Set(bills.map(b => b.envelopeId)), savings);
    const order = visible.flatMap(g => g.envelopes);
    return order.filter(e => ids.includes(e.id));
  }, [view, accounts.data, chosen.data, bills]);

  // Each spending envelope under the bank account its money sits in, in
  // the Accounts tab's order; any not tied to an open account come last.
  const spendingGroups = useMemo(() => {
    const open = (accounts.data ?? []).filter(a => !a.closed).sort(compareAccounts);
    const groups = open
      .map(account => ({ key: account.id, account, envelopes: discretionary.filter(e => e.linked_account_id === account.id) }))
      .filter(g => g.envelopes.length > 0);
    const placed = new Set(groups.map(g => g.key));
    const loose = discretionary.filter(e => !e.linked_account_id || !placed.has(e.linked_account_id));
    return loose.length > 0 ? [...groups, { key: 'none', account: null, envelopes: loose }] : groups;
  }, [accounts.data, discretionary]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([budget.refetch(), unfiled.refetch(), accounts.refetch()]).catch(() => {});
    setRefreshing(false);
  }

  if (isPending || accounts.isPending || chosen.isPending || !view) {
    return (
      <View style={styles.content}>
        {toggle}
        <ActivityIndicator style={styles.loading} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.content}>
        {toggle}
        <ThemedText themeColor="danger">Couldn’t load the budget: {error.message}</ThemedText>
      </View>
    );
  }

  const balanceOf = (id: string) => view.month.envelopes[id]?.balance ?? 0;
  const thisMonth = monthBills(bills, balanceOf, today);
  const names = new Map(view.envelopes.map(e => [e.id, e.name]));
  const income = Math.max(0, view.month.readyToAssign);
  const allCovered = thisMonth.every(b => b.status !== 'short');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {toggle}
      <ThemedText style={styles.title} accessibilityRole="header">
        {monthName(today.slice(0, 7))}
      </ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Income to put in envelopes: ${formatCents(income)}`}
          accessibilityHint="Fill envelopes from the budget"
          onPress={() => router.push({ pathname: '/budget/fill', params: { month: today.slice(0, 7) } })}
          style={({ pressed }) => [styles.topRow, pressed && styles.dim]}>
          <ThemedText style={styles.flex}>Income to put in envelopes</ThemedText>
          <ThemedText style={styles.topAmount} themeColor={income > 0 ? 'accent' : 'textSecondary'}>
            {formatCents(income)}
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Expenses to assign to envelopes: ${formatCents(unfiled.data?.total ?? 0)}`}
          accessibilityHint="See the transactions waiting for an envelope"
          onPress={() => router.navigate({ pathname: '/transactions', params: { filter: 'review' } })}
          style={({ pressed }) => [styles.topRow, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }, pressed && styles.dim]}>
          <View style={styles.flex}>
            <ThemedText>Expenses to assign to envelopes</ThemedText>
            {!!unfiled.data?.count && (
              <ThemedText type="small" themeColor="textSecondary">
                {unfiled.data.count} {unfiled.data.count === 1 ? 'transaction' : 'transactions'}
              </ThemedText>
            )}
          </View>
          <ThemedText style={styles.topAmount} themeColor={unfiled.data?.total ? 'warning' : 'textSecondary'}>
            {unfiled.isPending ? '…' : formatCents(unfiled.data?.total ?? 0)}
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
          Spending money left
        </ThemedText>
        {discretionary.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.note}>
            No envelopes chosen.
          </ThemedText>
        ) : (
          spendingGroups.map(group => (
            <View key={group.key} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint={group.account ? 'See its transactions' : undefined}
                disabled={!group.account}
                onPress={() => group.account && router.push({ pathname: '/account/history', params: { id: group.account.id } })}
                style={({ pressed }) => [styles.accountHead, pressed && styles.dim]}>
                {group.account && <Icon name="bank" size={20} color={theme.accent} />}
                <ThemedText numberOfLines={2} style={[styles.flex, styles.accountName]}>
                  {group.account ? accountDisplayName(group.account) : 'Not tied to an account'}
                </ThemedText>
                {group.account && (
                  <ThemedText style={styles.amount} themeColor={group.account.balance < 0 ? 'danger' : 'textSecondary'}>
                    {formatCents(group.account.balance)}
                  </ThemedText>
                )}
              </Pressable>
              {group.envelopes.map(e => {
                const left = balanceOf(e.id);
                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.name}: ${formatCents(left)} left`}
                    accessibilityHint="See this month's money in and out"
                    onPress={() => router.push({ pathname: '/budget/spending', params: { envelopeId: e.id } })}
                    style={({ pressed }) => [
                      styles.row,
                      { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                      pressed && styles.dim,
                    ]}>
                    <Icon name="envelope" size={18} color={theme.textSecondary} />
                    <ThemedText numberOfLines={1} style={[styles.flex, styles.name]}>
                      {e.name}
                    </ThemedText>
                    <ThemedText style={styles.amount} themeColor={left < 0 ? 'danger' : 'text'}>
                      {formatCents(left)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
        <Button variant="plain" title="Choose envelopes" onPress={() => router.push('/budget/simple-envelopes')} />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
          Expected expenses this month
        </ThemedText>
        {thisMonth.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.note}>
            No bills expected this month.
          </ThemedText>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              {thisMonth.map((b, i) => (
                <Pressable
                  key={`${b.merchant}-${b.date}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.merchant}, ${formatCents(b.amount)}, ${b.status === 'paid' ? 'paid' : b.status === 'covered' ? 'covered' : `${formatCents(b.short)} short`}`}
                  accessibilityHint="Open its envelope"
                  onPress={() =>
                    router.push({ pathname: '/budget/envelope', params: { envelopeId: b.envelopeId, month: today.slice(0, 7) } })
                  }
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                    pressed && styles.dim,
                  ]}>
                  <View style={[styles.check, { borderColor: b.status === 'short' ? theme.danger : theme.accent }, b.status !== 'short' && { backgroundColor: b.status === 'paid' ? theme.track : theme.accent }]}>
                    <ThemedText style={[styles.checkMark, { color: b.status === 'short' ? theme.danger : b.status === 'paid' ? theme.textSecondary : theme.onAccent }]}>
                      {b.status === 'short' ? '!' : '✓'}
                    </ThemedText>
                  </View>
                  <View style={styles.flex}>
                    <ThemedText numberOfLines={1} style={[styles.name, b.status === 'paid' && styles.paid]}>
                      {b.merchant}
                    </ThemedText>
                    <ThemedText type="small" themeColor={b.status === 'short' ? 'danger' : 'textSecondary'} numberOfLines={1}>
                      {b.status === 'paid'
                        ? `Paid ${monthName(b.date.slice(0, 7), 'short')} ${Number(b.date.slice(8))}`
                        : `${b.late ? 'Due now' : `${monthName(b.date.slice(0, 7), 'short')} ${Number(b.date.slice(8))}`} · ${names.get(b.envelopeId) ?? ''}${b.status === 'short' ? ` · ${formatCents(b.short)} short` : ''}`}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.amount, b.status === 'paid' && styles.paid]}>{formatCents(b.amount)}</ThemedText>
                </Pressable>
              ))}
            </View>
            <ThemedText type="small" themeColor={allCovered ? 'accent' : 'danger'} style={styles.note}>
              {allCovered
                ? 'Every bill this month is covered by what’s in its envelope.'
                : 'Some bills aren’t covered yet. Tap one to add money to its envelope.'}
            </ThemedText>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.three,
  },
  loading: { marginTop: Spacing.six },
  title: { fontSize: 30, lineHeight: 36, fontWeight: 800, letterSpacing: -0.6, paddingHorizontal: Spacing.one },
  card: { borderRadius: 20, overflow: 'hidden' },
  accountHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + Spacing.one, padding: Spacing.three },
  accountName: { fontWeight: 700 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  topAmount: { fontSize: 22, fontWeight: 800, fontVariant: ['tabular-nums'] },
  section: { gap: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  name: { fontWeight: 600 },
  amount: { fontWeight: 600, fontVariant: ['tabular-nums'] },
  paid: { opacity: 0.55 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 13, lineHeight: 16, fontWeight: 800 },
  note: { paddingHorizontal: Spacing.two },
  flex: { flex: 1 },
  dim: { opacity: 0.6 },
});
