import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { TimelineEvent } from '@/domain/forecast';
import { formatCents } from '@/domain/money';
import { formatDay, monthName } from '@/domain/month';
import { payScheduleLabel } from '@/domain/paychecks';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentMonth } from '@/lib/budget';
import { useForecasts, type EnvelopeForecast } from '@/lib/forecast';

/**
 * Modal from the Accounts view of the Budget tab: one envelope's coming
 * months. Money Fill from budget should add on each payday, bills expected
 * to come out of it, the balance after each, and whether the bills are
 * covered.
 */
export default function TimelineScreen() {
  const theme = useTheme();
  const { envelopeId } = useLocalSearchParams<{ envelopeId: string }>();
  const { forecasts, budget, isPending, error } = useForecasts();
  const view = budget.view;
  const household = budget.household.data;
  const envelope = view?.envelopes.find(e => e.id === envelopeId);
  const group = view?.groups.find(g => g.envelopes.some(e => e.id === envelopeId));
  const forecast = forecasts?.get(envelopeId);
  const balance = view?.month.envelopes[envelopeId]?.balance ?? 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">
              {group?.name ?? 'Envelope'} · timeline
            </ThemedText>
            <ThemedText type="subtitle" numberOfLines={2}>
              {envelope?.name ?? ''}
            </ThemedText>
          </View>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        {isPending ? (
          <ActivityIndicator />
        ) : error ? (
          <ThemedText themeColor="danger">Couldn’t load the timeline: {error.message}</ThemedText>
        ) : !envelope || !forecast || !household ? (
          <ThemedText themeColor="textSecondary">This envelope no longer exists.</ThemedText>
        ) : (
          <>
            <View style={[styles.card, styles.summary, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                In it now
              </ThemedText>
              <ThemedText style={styles.big} themeColor={balance < 0 ? 'danger' : 'text'}>
                {formatCents(balance)}
              </ThemedText>
              <Coverage forecast={forecast} />
              <ThemedText type="small" themeColor="textSecondary">
                {forecast.monthlyTarget > 0
                  ? `Gets ${formatCents(forecast.monthlyTarget)} a month from the budget, paid ${payScheduleLabel(household.paySchedule).toLowerCase()}.`
                  : 'Not in the monthly budget, so no paycheck fills are expected.'}
              </ThemedText>
            </View>

            {forecast.bills.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
                  Bills paid from it
                </ThemedText>
                <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  {forecast.bills.map((b, i) => (
                    <View
                      key={`${b.merchant}-${b.cadence}`}
                      style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
                      <View style={styles.flex}>
                        <ThemedText numberOfLines={1} style={styles.bold}>
                          {b.merchant}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {b.cadence[0].toUpperCase() + b.cadence.slice(1)} · last {formatDay(b.lastDate)}
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.amount}>
                        {b.varies ? '~' : ''}
                        {formatCents(b.amount)}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
                Coming up, through {monthName(forecast.until.slice(0, 7))}
              </ThemedText>
              {forecast.events.length === 0 ? (
                <ThemedText themeColor="textSecondary" style={styles.note}>
                  Nothing expected yet.
                </ThemedText>
              ) : (
                <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  {forecast.events.map((e, i) => (
                    <EventRow key={`${e.kind}-${e.date}-${i}`} event={e} first={i === 0} />
                  ))}
                </View>
              )}
            </View>

            <Button
              variant="tonal"
              title="Add or move money"
              onPress={() =>
                router.push({ pathname: '/budget/envelope', params: { envelopeId: envelope.id, month: currentMonth() } })
              }
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Paycheck fills are what Fill from budget would add on each payday, learned from your paycheck deposits.
              Bills are charges that repeat on a schedule, found in the last year and tied to this envelope by where
              they were filed or by a rule. Amounts and dates are estimates; ~ means the amount varies.
            </ThemedText>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Coverage({ forecast }: { forecast: EnvelopeForecast }) {
  const c = forecast.coverage;
  if (c.kind === 'short') {
    return (
      <ThemedText themeColor="danger">
        About {formatCents(c.short)} short for {c.bill.merchant} on {formatDay(c.date)}. Adding{' '}
        {formatCents(c.perPaycheck)} more each paycheck until then covers it.
      </ThemedText>
    );
  }
  if (c.kind === 'ok') {
    return (
      <ThemedText themeColor="accent">
        On track for {c.bill.merchant} ({formatCents(c.bill.amount)}) on {formatDay(c.date)}.
      </ThemedText>
    );
  }
  return <ThemedText themeColor="textSecondary">No bills on a schedule found for this envelope.</ThemedText>;
}

function EventRow({ event, first }: { event: TimelineEvent; first: boolean }) {
  const theme = useTheme();
  const isBill = event.kind === 'bill';
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
      <View style={styles.date}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.month}>
          {monthName(event.date.slice(0, 7), 'short')}
        </ThemedText>
        <ThemedText style={styles.day}>{Number(event.date.slice(8))}</ThemedText>
      </View>
      <View style={styles.flex}>
        <ThemedText numberOfLines={1} style={styles.bold}>
          {event.kind === 'bill' ? event.bill.merchant : 'Fill from budget'}
        </ThemedText>
        <ThemedText type="small" themeColor={event.kind === 'bill' && event.overdue ? 'warning' : 'textSecondary'}>
          {event.kind === 'bill' ? (event.overdue ? 'Expected already, not seen yet' : 'Expected bill') : 'Paycheck'}
        </ThemedText>
      </View>
      <View style={styles.amountCol}>
        <ThemedText themeColor={isBill ? 'text' : 'accent'} style={styles.amount}>
          {isBill ? '−' : '+'}
          {formatCents(Math.abs(event.amount))}
        </ThemedText>
        <ThemedText type="small" themeColor={event.balance < 0 ? 'danger' : 'textSecondary'} style={styles.tabular}>
          {formatCents(event.balance)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { borderRadius: 20, overflow: 'hidden' },
  summary: { padding: Spacing.three, gap: Spacing.one },
  big: { fontSize: 32, lineHeight: 38, fontWeight: 800, fontVariant: ['tabular-nums'] },
  section: { gap: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  date: { width: 34, alignItems: 'center' },
  month: { textTransform: 'uppercase', fontSize: 11 },
  day: { fontWeight: 700, fontSize: 17 },
  bold: { fontWeight: 600 },
  amountCol: { alignItems: 'flex-end' },
  amount: { fontWeight: 600, fontVariant: ['tabular-nums'] },
  tabular: { fontVariant: ['tabular-nums'] },
  note: { paddingHorizontal: Spacing.two },
  flex: { flex: 1 },
});
