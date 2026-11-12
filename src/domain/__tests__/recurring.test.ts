import { findRecurring, merchantKey, type ChargeRow } from '../recurring';

const charge = (date: string, dollars: number, merchant: string): ChargeRow => ({
  date,
  amount: -Math.round(dollars * 100),
  merchant,
});

const monthly = (day: string, dollars: number, merchant: string, months: string[]) =>
  months.map(m => charge(`${m}-${day}`, dollars, merchant));

const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];

describe('merchantKey', () => {
  it('ignores reference numbers and card suffixes', () => {
    expect(merchantKey('NETFLIX.COM 866-579')).toBe(merchantKey('Netflix.com 866-580'));
    expect(merchantKey('AMAZON MKTP US*2K4')).toBe(merchantKey('AMAZON MKTP US*9X1'));
    expect(merchantKey('HOME DEPOT #0412')).toBe('home depot');
  });
});

describe('findRecurring', () => {
  it('finds a monthly subscription and when it comes next', () => {
    const [netflix] = findRecurring(monthly('05', 15.49, 'NETFLIX.COM', MONTHS), '2026-11-20');
    expect(netflix).toMatchObject({
      merchant: 'NETFLIX.COM',
      cadence: 'monthly',
      amount: 1549,
      varies: false,
      lastDate: '2026-11-05',
      nextDate: '2026-12-05',
      count: 6,
    });
    expect(netflix.monthly).toBeGreaterThan(1500);
    expect(netflix.monthly).toBeLessThan(1600);
  });

  it('keeps bills whose amount moves a little, and says so', () => {
    const power = [80, 95, 110, 102, 88, 91].map((d, i) => charge(`${MONTHS[i]}-08`, d, 'CITY POWER'));
    expect(findRecurring(power, '2026-11-20')[0]).toMatchObject({ cadence: 'monthly', varies: true });
  });

  it('uses the latest price after a price change', () => {
    const rows = [...monthly('20', 10.99, 'SPOTIFY', MONTHS.slice(0, 3)), ...monthly('20', 11.99, 'SPOTIFY', MONTHS.slice(3))];
    expect(findRecurring(rows, '2026-11-25')[0].amount).toBe(1199);
  });

  it('ignores a store you visit often for different amounts', () => {
    const groceries = [62, 140, 35, 98, 210, 47, 120, 76].map((d, i) =>
      charge(`2026-10-${String(1 + i * 4).padStart(2, '0')}`, d, "TRADER JOE'S"),
    );
    expect(findRecurring(groceries, '2026-11-01')).toEqual([]);
  });

  it('ignores a weekly shop even when the amounts are fairly steady', () => {
    const weekOf = (i: number) => new Date(Date.UTC(2026, 8, 5 + i * 7)).toISOString().slice(0, 10);
    const weekly = [86, 102, 74, 96, 91, 83, 99, 88].map((d, i) => charge(weekOf(i), d, "TRADER JOE'S"));
    expect(findRecurring(weekly, '2026-10-30')).toEqual([]);
    const gym = weekly.map(c => ({ ...c, amount: -1500, merchant: 'CLIMBING GYM' }));
    expect(findRecurring(gym, '2026-10-30')[0]).toMatchObject({ cadence: 'weekly' });
  });

  it('ignores a restaurant visited about once a month on different days', () => {
    const days = ['03', '11', '06', '15', '09', '02'];
    const sushi = MONTHS.map((m, i) => charge(`${m}-${days[i]}`, 60 + i, 'SUSHI HOUSE'));
    expect(findRecurring(sushi, '2026-11-20')).toEqual([]);
  });

  it('drops one that stopped charging', () => {
    expect(findRecurring(monthly('12', 9.99, 'HULU', MONTHS.slice(0, 3)), '2026-11-20')).toEqual([]);
  });

  it('finds yearly renewals from two charges, at the latest price', () => {
    const rows = [charge('2025-03-14', 119, 'AMAZON PRIME'), charge('2026-03-14', 139, 'AMAZON PRIME')];
    expect(findRecurring(rows, '2026-11-20')[0]).toMatchObject({
      cadence: 'yearly',
      amount: 13900,
      nextDate: '2027-03-14',
    });
  });

  it('keeps monthly charges on their day, even in short months', () => {
    const rows = monthly('31', 20, 'GYM', ['2026-07', '2026-08']).concat(charge('2026-09-30', 20, 'GYM'), charge('2026-10-31', 20, 'GYM'));
    expect(findRecurring(rows, '2026-11-10')[0].nextDate).toBe('2026-11-30');
  });

  it('needs more than two charges for a monthly schedule, and sorts by monthly cost', () => {
    expect(findRecurring(monthly('01', 1450, 'RENT', MONTHS.slice(4)), '2026-11-20')).toEqual([]);
    const both = [...monthly('01', 1450, 'RENT', MONTHS), ...monthly('05', 15.49, 'NETFLIX', MONTHS)];
    expect(findRecurring(both, '2026-11-20').map(r => r.merchant)).toEqual(['RENT', 'NETFLIX']);
  });
});
