/**
 * Finds subscriptions and bills in transaction history: the same merchant
 * charging about the same amount on a steady schedule. Pure, so it can be
 * tested with made-up histories.
 */
import type { Cents } from './money.ts';

export type ChargeRow = {
  date: string;
  /** Negative: money out. */
  amount: Cents;
  /** Payee name, else the bank's description. */
  merchant: string;
};

export type Cadence = 'weekly' | 'every 2 weeks' | 'monthly' | 'every 3 months' | 'yearly';

export type Recurring = {
  merchant: string;
  cadence: Cadence;
  /** Typical charge, positive. */
  amount: Cents;
  /** True when charges differ by more than a little (a utility bill, say). */
  varies: boolean;
  lastDate: string;
  nextDate: string;
  /** What it costs in an average month. */
  monthly: Cents;
  count: number;
};

/**
 * `months` is set for calendar schedules, which land on the same day each
 * time. `spread` is how far charges may stray from the typical amount:
 * tight for weekly ones, since a weekly grocery run is regular too.
 */
const CADENCES: { cadence: Cadence; min: number; max: number; minCharges: number; spread: number; months?: number }[] = [
  { cadence: 'weekly', min: 5, max: 9, minCharges: 4, spread: 0.1 },
  { cadence: 'every 2 weeks', min: 12, max: 16, minCharges: 3, spread: 0.1 },
  { cadence: 'monthly', min: 26, max: 35, minCharges: 3, spread: 0.25, months: 1 },
  { cadence: 'every 3 months', min: 84, max: 98, minCharges: 2, spread: 0.25, months: 3 },
  { cadence: 'yearly', min: 350, max: 380, minCharges: 2, spread: 0.25, months: 12 },
];

const DAY = 24 * 60 * 60 * 1000;
const toDay = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY;
const fromDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
/** The same day `n` months later, or the month's last day if it's shorter. */
function addCalendarMonths(date: string, n: number): string {
  const index = +date.slice(0, 4) * 12 + (+date.slice(5, 7) - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(+date.slice(8, 10), last)).padStart(2, '0')}`;
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Groups card and bank descriptions that are the same merchant: "NETFLIX.COM
 * 866-579" and "Netflix.com 866-580", or "AMAZON MKTP US*2K4" and "*9X1".
 */
export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\*.*$/, '')
    .replace(/[#\d]+/g, ' ')
    .replace(/[^a-z&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Merchants that charge on a schedule and still do, most expensive per
 * month first. A schedule needs most gaps between charges to fit one
 * cadence, monthly and longer ones on about the same day of the month,
 * and most charges close to the typical amount (within 25%, or 10% for
 * weekly schedules, so a weekly grocery run doesn't count). One that's missed about two charges in a
 * row is treated as cancelled.
 */
export function findRecurring(rows: ChargeRow[], today: string): Recurring[] {
  const groups = new Map<string, ChargeRow[]>();
  for (const row of rows) {
    if (row.amount >= 0) continue;
    const key = merchantKey(row.merchant);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const found: Recurring[] = [];
  const now = toDay(today);
  for (const charges of groups.values()) {
    if (charges.length < 2) continue;
    charges.sort((a, b) => a.date.localeCompare(b.date));
    const days = charges.map(c => toDay(c.date));
    const gaps = days.slice(1).map((d, i) => d - days[i]);
    const gap = median(gaps);
    const fit = CADENCES.find(c => gap >= c.min && gap <= c.max);
    if (!fit || charges.length < fit.minCharges) continue;
    const onSchedule = gaps.filter(g => g >= fit.min && g <= fit.max).length;
    if (onSchedule / gaps.length < 0.75) continue;

    // Bills and subscriptions charge on about the same day of the month; a
    // favorite restaurant visited roughly monthly doesn't. Days are compared
    // round the month, so the 30th and the 1st are close.
    if (fit.months) {
      const dom = charges.map(c => +c.date.slice(8, 10));
      const usual = median(dom);
      const near = dom.filter(d => Math.min(Math.abs(d - usual), 31 - Math.abs(d - usual)) <= 3).length;
      if (near / dom.length < 0.75) continue;
    }

    const amounts = charges.map(c => -c.amount);
    const typical = median(amounts);
    const close = amounts.filter(a => Math.abs(a - typical) <= Math.max(typical * fit.spread, 100)).length;
    if (close / amounts.length < 0.75) continue;

    const last = days[days.length - 1];
    if (now - last > gap * 2 + 3) continue;

    // The latest charges say most about the current price. Renewals that
    // come a few times a year use the last one: prices change between them.
    const recent = fit.months && fit.months >= 3 ? amounts[amounts.length - 1] : median(amounts.slice(-3));
    const lastDate = charges[charges.length - 1].date;
    found.push({
      merchant: charges[charges.length - 1].merchant,
      cadence: fit.cadence,
      amount: Math.round(recent),
      varies: amounts.slice(-6).some(a => Math.abs(a - recent) > Math.max(recent * 0.05, 100)),
      lastDate,
      nextDate: fit.months ? addCalendarMonths(lastDate, fit.months) : fromDay(last + Math.round(gap)),
      monthly: Math.round((recent * 30.44) / gap),
      count: charges.length,
    });
  }
  return found.sort((a, b) => b.monthly - a.monthly);
}
