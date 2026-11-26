import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { accountDisplayName, accountTypeLabel, compareAccounts } from '@/domain/accounts';
import { isHidden } from '@/domain/categories';
import { linkedCheck } from '@/domain/envelope';
import { formatCents } from '@/domain/money';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentMonth, useBudget } from '@/lib/budget';
import { useAccounts, type Account, type Envelope } from '@/lib/queries';

/**
 * The Budget tab by account: each bank account with its balance and the
 * envelopes whose money sits in it (an envelope's linked account), each
 * envelope with its balance. Envelopes not tied to an account are listed
 * after. Tapping an envelope opens its timeline.
 */
export function BudgetAccountsView({ toggle }: { toggle: ReactNode }) {
  const theme = useTheme();
  const accounts = useAccounts();
  const budget = useBudget(currentMonth());
  const { isPending, error } = budget;
  const [refreshing, setRefreshing] = useState(false);
  const view = budget.view;

  async function refresh() {
    setRefreshing(true);
    await Promise.all([accounts.refetch(), budget.refetch()]).catch(() => {});
    setRefreshing(false);
  }

  if (accounts.isPending || isPending || !view) {
    return (
      <View style={styles.content}>
        {toggle}
        <ActivityIndicator style={styles.loading} />
      </View>
    );
  }
  if (accounts.error || error) {
    return (
      <View style={styles.content}>
        {toggle}
        <ThemedText themeColor="danger">Couldn’t load: {(accounts.error ?? error)?.message}</ThemedText>
      </View>
    );
  }

  const visible = view.groups.flatMap(g => g.envelopes.filter(e => !isHidden(g, e)));
  const open = (accounts.data ?? []).filter(a => !a.closed).sort(compareAccounts);
  const onBudget = open.filter(a => a.on_budget);
  const offBudget = open.filter(a => !a.on_budget);
  const placed = new Set(open.map(a => a.id));
  const loose = visible.filter(e => !e.linked_account_id || !placed.has(e.linked_account_id));
  const balanceOf = (id: string) => view.month.envelopes[id]?.balance ?? 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {toggle}
      <View style={styles.header}>
        <ThemedText style={styles.title} accessibilityRole="header">
          Accounts
        </ThemedText>
        <View style={[styles.ready, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Ready to assign
          </ThemedText>
          <ThemedText style={styles.readyAmount} themeColor={view.month.readyToAssign < 0 ? 'danger' : 'accent'}>
            {formatCents(view.month.readyToAssign)}
          </ThemedText>
        </View>
      </View>

      {onBudget.map(account => (
        <AccountCard
          key={account.id}
          account={account}
          envelopes={visible.filter(e => e.linked_account_id === account.id)}
          balanceOf={balanceOf}
        />
      ))}

      {loose.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.cardHead}>
            <View style={styles.flex}>
              <ThemedText style={styles.accountName}>Not tied to an account</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Choose an envelope’s account in its settings to list it under that account.
              </ThemedText>
            </View>
          </View>
          {loose.map(e => (
            <EnvelopeLine key={e.id} envelope={e} balance={balanceOf(e.id)} />
          ))}
        </View>
      )}

      {offBudget.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.cardHead}>
            <ThemedText style={[styles.accountName, styles.flex]}>Off budget</ThemedText>
          </View>
          {offBudget.map(a => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityHint="See its transactions"
              onPress={() => router.push({ pathname: '/account/history', params: { id: a.id } })}
              style={({ pressed }) => [styles.line, { borderColor: theme.border }, pressed && styles.dim]}>
              <Icon name="bank" size={20} color={theme.textSecondary} />
              <View style={styles.flex}>
                <ThemedText numberOfLines={1}>{accountDisplayName(a)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {accountTypeLabel(a.type)}
                </ThemedText>
              </View>
              <ThemedText style={styles.amount}>{formatCents(a.balance)}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function AccountCard({
  account,
  envelopes,
  balanceOf,
}: {
  account: Account;
  envelopes: Envelope[];
  balanceOf(id: string): number;
}) {
  const theme = useTheme();
  const check = linkedCheck(account.balance, envelopes.map(e => balanceOf(e.id)));
  const status =
    envelopes.length === 0
      ? null
      : check.difference === 0
        ? { text: `Envelopes hold ${formatCents(check.envelopes)}: exactly what's in the account.`, color: 'accent' as const }
        : check.difference > 0
          ? {
              text: `Envelopes hold ${formatCents(check.envelopes)}; the account has ${formatCents(check.difference)} more.`,
              color: 'textSecondary' as const,
            }
          : {
              text: `Envelopes hold ${formatCents(check.envelopes)}; the account is ${formatCents(-check.difference)} short of that.`,
              color: 'warning' as const,
            };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="See its transactions"
        onPress={() => router.push({ pathname: '/account/history', params: { id: account.id } })}
        style={({ pressed }) => [styles.cardHead, pressed && styles.dim]}>
        <Icon name="bank" size={22} color={theme.accent} />
        <View style={styles.flex}>
          <ThemedText style={styles.accountName} numberOfLines={2}>
            {accountDisplayName(account)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {accountTypeLabel(account.type)}
          </ThemedText>
        </View>
        <ThemedText style={styles.accountBalance} themeColor={account.balance < 0 ? 'danger' : 'text'}>
          {formatCents(account.balance)}
        </ThemedText>
      </Pressable>
      {envelopes.map(e => (
        <EnvelopeLine key={e.id} envelope={e} balance={balanceOf(e.id)} />
      ))}
      {status && (
        <ThemedText type="small" themeColor={status.color} style={styles.status}>
          {status.text}
        </ThemedText>
      )}
    </View>
  );
}

/** One envelope under its account, with its balance. */
function EnvelopeLine({ envelope, balance }: { envelope: Envelope; balance: number }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${envelope.name}: ${formatCents(balance)}`}
      accessibilityHint="See its timeline"
      onPress={() => router.push({ pathname: '/budget/timeline', params: { envelopeId: envelope.id } })}
      style={({ pressed }) => [styles.line, { borderColor: theme.border }, pressed && styles.dim]}>
      <Icon name="envelope" size={18} color={theme.textSecondary} />
      <ThemedText numberOfLines={1} style={[styles.flex, styles.envelopeName]}>
        {envelope.name}
      </ThemedText>
      <ThemedText style={styles.amount} themeColor={balance < 0 ? 'danger' : 'text'}>
        {formatCents(balance)}
      </ThemedText>
    </Pressable>
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
  header: { gap: Spacing.two },
  title: { fontSize: 30, lineHeight: 36, fontWeight: 800, letterSpacing: -0.6, paddingHorizontal: Spacing.one },
  ready: { borderRadius: 16, padding: Spacing.three, flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  readyAmount: { marginLeft: 'auto', fontSize: 20, fontWeight: 800, fontVariant: ['tabular-nums'] },
  card: { borderRadius: 20, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  accountName: { fontSize: 17, fontWeight: 700 },
  accountBalance: { fontSize: 20, fontWeight: 800, fontVariant: ['tabular-nums'] },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  envelopeName: { fontWeight: 600 },
  amount: { fontWeight: 600, fontVariant: ['tabular-nums'] },
  status: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  flex: { flex: 1 },
  dim: { opacity: 0.6 },
});
