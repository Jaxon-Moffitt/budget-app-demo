/**
 * An envelope's coming months: when Fill from budget should add money (from
 * the pay schedule, learned paydays and the monthly budget), which bills
 * are expected to come out of it (from charge history), and the balance
 * that leaves. Rules, not a statistical model: bills on a schedule are
 * predicted from their schedule, and contributions are worked out exactly.
 */
import type { Cents } from './money.ts';
import { perPaycheck, type PaySchedule } from './paychecks.ts';
import { addCalendarMonths, findRecurring, merchantKey, type ChargeRow, type Recurring } from './recurring.ts';

const DAY = 24 * 60 * 60 * 1000;
const toDay = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY;
const fromDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Days of the month (or the last payday, for weekly pay) learned from
 * paycheck deposits. Paychecks are the larger income deposits: at least
 * half the size of the usual one, so interest and refunds don't count.
 */
function paychecks(income: { date: string; amount: Cents }[]): { date: string; amount: Cents }[] {
  const amounts = income.filter(i => i.amount > 0).map(i => i.amount);
  if (amounts.length === 0) return [];
  const usual = median(amounts.filter(a => a >= median(amounts)));
  return income.filter(i => i.amount >= usual / 2).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Paydays after `today` through `until`. Twice-a-month pay learns its two
 * days (one in each half of the month; 28 or later means the month's last
 * day), defaulting to the 1st and 15th. Weekly and every-2-weeks pay count
 * on from the last paycheck. Monthly pay learns its day.
 */
export function nextPaydays(
  income: { date: string; amount: Cents }[],
  schedule: PaySchedule,
  today: string,
  until: string,
): string[] {
  const checks = paychecks(income);
  const out: string[] = [];
  if (schedule === 'weekly' || schedule === 'biweekly') {
    const step = schedule === 'weekly' ? 7 : 14;
    let day = checks.length > 0 ? toDay(checks[checks.length - 1].date) : toDay(today);
    while (fromDay(day) <= today) day += step;
    for (; fromDay(day) <= until; day += step) out.push(fromDay(day));
    return out;
  }
  // The 28th or later counts as the month's last day, so the 30th and 31st agree.
  const doms = checks.map(c => Math.min(+c.date.slice(8, 10), 31)).map(d => (d >= 28 ? 31 : d));
  const usualDay = (ds: number[]) => Math.round(median(ds));
  let days: number[];
  if (doms.length === 0) days = schedule === 'monthly' ? [1] : [1, 15];
  else if (schedule === 'monthly') days = [usualDay(doms)];
  else {
    // Two paydays a month: split the days seen at the widest gap between
    // them (the 1st and 15th, the 15th and the last day, the 5th and 20th).
    const sorted = [...doms].sort((a, b) => a - b);
    let cut = -1;
    let widest = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap > widest) {
        widest = gap;
        cut = i;
      }
    }
    if (cut > 0 && widest >= 7) days = [usualDay(sorted.slice(0, cut)), usualDay(sorted.slice(cut))];
    else {
      // Only one payday seen so far: the other is about two weeks away.
      const d = usualDay(sorted);
      days = d <= 15 ? [d, d + 14] : [d - 14, d];
    }
  }
  let y = +today.slice(0, 4);
  let m = +today.slice(5, 7);
  for (let i = 0; i < 24; i++) {
    for (const d of days) {
      const day = d >= 28 ? lastDayOf(y, m) : Math.min(d, lastDayOf(y, m));
      const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (date > today && date <= until) out.push(date);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.sort();
}

/**
 * What Fill from budget would add to one envelope on each payday: one
 * paycheck's share of its monthly amount, never past the month's amount,
 * counting what's already in it this month.
 */
export function plannedContributions(
  paydays: string[],
  monthlyTarget: Cents,
  assignedThisMonth: Cents,
  schedule: PaySchedule,
  today: string,
): { date: string; amount: Cents }[] {
  if (monthlyTarget <= 0) return [];
  const share = perPaycheck(monthlyTarget, schedule);
  const assigned = new Map<string, Cents>([[today.slice(0, 7), assignedThisMonth]]);
  const out: { date: string; amount: Cents }[] = [];
  for (const date of paydays) {
    const month = date.slice(0, 7);
    const sofar = assigned.get(month) ?? 0;
    const add = Math.min(share, Math.max(0, monthlyTarget - sofar));
    assigned.set(month, sofar + add);
    if (add > 0) out.push({ date, amount: add });
  }
  return out;
}

export type EnvelopeBill = Recurring & { envelopeId: string };

/**
 * Bills on a schedule, each tied to the envelope it's paid from: the
 * envelope its latest filed charge went to, or else the envelope of the
 * first rule that matches it. Bills that can't be tied to one are left out.
 */
export function billsByEnvelope(
  charges: ChargeRow[],
  rules: { match_text: string; envelope_id: string | null; kind: string }[],
  today: string,
): EnvelopeBill[] {
  const filed = new Map<string, string>();
  for (const c of [...charges].sort((a, b) => a.date.localeCompare(b.date))) {
    if (c.envelopeId) filed.set(merchantKey(c.merchant), c.envelopeId);
  }
  const out: EnvelopeBill[] = [];
  for (const bill of findRecurring(charges, today)) {
    const name = bill.merchant.toLowerCase();
    const envelopeId =
      filed.get(merchantKey(bill.merchant)) ??
      rules.find(r => r.kind === 'spending' && r.envelope_id && name.includes(r.match_text.trim().toLowerCase()))
        ?.envelope_id ??
      null;
    if (envelopeId) out.push({ ...bill, envelopeId });
  }
  return out;
}

const CALENDAR: Partial<Record<Recurring['cadence'], number>> = {
  monthly: 1,
  'every 3 months': 3,
  'every 6 months': 6,
  yearly: 12,
};

/** Every expected date of a bill from its next one through `until`. */
export function billDates(bill: Recurring, until: string): string[] {
  const out: string[] = [];
  const months = CALENDAR[bill.cadence];
  const days = bill.cadence === 'weekly' ? 7 : 14;
  for (let date = bill.nextDate, n = 1; date <= until && n < 60; n++) {
    out.push(date);
    date = months ? addCalendarMonths(bill.nextDate, months * n) : fromDay(toDay(bill.nextDate) + days * n);
  }
  return out;
}

export type TimelineEvent =
  | { kind: 'contribution'; date: string; amount: Cents; balance: Cents }
  | { kind: 'bill'; date: string; amount: Cents; balance: Cents; bill: Recurring; overdue: boolean };

export type Coverage =
  | { kind: 'none' }
  | { kind: 'ok'; bill: Recurring; date: string }
  | { kind: 'short'; bill: Recurring; date: string; short: Cents; perPaycheck: Cents };

/**
 * The envelope's coming money in date order with the balance after each,
 * starting from today's balance. On the same day, money in comes first. A
 * bill expected before today that hasn't shown up is put at today. Then
 * whether every bill is covered: the first one the balance can't pay, and
 * how much more each payday before it would cover it.
 */
export function envelopeTimeline(
  balance: Cents,
  contributions: { date: string; amount: Cents }[],
  bills: Recurring[],
  today: string,
  until: string,
): { events: TimelineEvent[]; coverage: Coverage } {
  type Item = { date: string; rank: number; amount: Cents; bill?: Recurring; overdue: boolean };
  const items: Item[] = [
    ...contributions.map(c => ({ date: c.date, rank: 0, amount: c.amount, overdue: false })),
    ...bills.flatMap(bill =>
      billDates(bill, until).map(date => ({
        date: date < today ? today : date,
        rank: 1,
        amount: -bill.amount,
        bill,
        overdue: date < today,
      })),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank);

  let running = balance;
  let coverage: Coverage = { kind: 'none' };
  const events: TimelineEvent[] = items.map(item => {
    running += item.amount;
    if (!item.bill) return { kind: 'contribution', date: item.date, amount: item.amount, balance: running };
    if (coverage.kind !== 'short') {
      if (running < 0) {
        const paydaysBefore = contributions.filter(c => c.date <= item.date).length;
        coverage = {
          kind: 'short',
          bill: item.bill,
          date: item.date,
          short: -running,
          perPaycheck: paydaysBefore > 0 ? Math.ceil(-running / paydaysBefore) : -running,
        };
      } else if (coverage.kind === 'none') {
        coverage = { kind: 'ok', bill: item.bill, date: item.date };
      }
    }
    return { kind: 'bill', date: item.date, amount: item.amount, balance: running, bill: item.bill, overdue: item.overdue };
  });
  return { events, coverage };
}
