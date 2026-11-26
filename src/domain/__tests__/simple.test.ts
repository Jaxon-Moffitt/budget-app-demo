import type { EnvelopeBill } from '../forecast';
import { defaultDiscretionary, monthBills } from '../simple';

const bill = (b: Partial<EnvelopeBill> & Pick<EnvelopeBill, 'envelopeId' | 'merchant' | 'amount' | 'lastDate' | 'nextDate'>): EnvelopeBill => ({
  cadence: 'monthly',
  varies: false,
  monthly: b.amount,
  count: 4,
  ...b,
});

const rent = bill({ envelopeId: 'rent', merchant: 'Greenwood', amount: 145000, lastDate: '2026-12-01', nextDate: '2027-01-01' });
const power = bill({ envelopeId: 'util', merchant: 'City Power', amount: 11243, lastDate: '2026-11-08', nextDate: '2026-12-08' });
const internet = bill({ envelopeId: 'util', merchant: 'FastNet', amount: 6500, lastDate: '2026-11-12', nextDate: '2026-12-12' });
const insurance = bill({ envelopeId: 'ins', merchant: 'Safe Auto', amount: 76800, lastDate: '2026-11-22', nextDate: '2027-05-22', cadence: 'every 6 months', monthly: 12800 });

describe('monthBills', () => {
  const balances: Record<string, number> = { rent: 0, util: 15000, ins: 0 };
  const list = monthBills([rent, power, internet, insurance], id => balances[id] ?? 0, '2026-12-03');

  it('lists this month\'s bills in date order, with ones already paid marked paid', () => {
    expect(list.map(b => [b.merchant, b.date, b.status])).toEqual([
      ['Greenwood', '2026-12-01', 'paid'],
      ['City Power', '2026-12-08', 'covered'],
      ['FastNet', '2026-12-12', 'short'],
    ]);
  });

  it('covers an envelope\'s bills one by one from what it holds now', () => {
    // Utilities holds $150: power ($112.43) is covered, internet ($65) is $27.43 short.
    expect(list.find(b => b.merchant === 'FastNet')?.short).toBe(6500 - (15000 - 11243));
  });

  it('leaves out bills that aren\'t due this month', () => {
    expect(list.some(b => b.merchant === 'Safe Auto')).toBe(false);
  });

  it('puts a bill that\'s late at today', () => {
    const late = monthBills([power], () => 20000, '2026-12-10');
    expect(late).toEqual([expect.objectContaining({ date: '2026-12-10', late: true, status: 'covered' })]);
  });
});

describe('defaultDiscretionary', () => {
  const env = (id: string, linked: string | null = null) => ({ id, linked_account_id: linked });

  it('takes the envelopes in a spending group when there is one', () => {
    const groups = [
      { name: 'Fixed Expenses', envelopes: [env('rent')] },
      { name: 'Discretionary', envelopes: [env('fun'), env('gifts')] },
    ];
    expect(defaultDiscretionary(groups, new Set(), new Set())).toEqual(['fun', 'gifts']);
  });

  it('otherwise leaves out envelopes with bills or a savings account', () => {
    const groups = [{ name: 'Everything', envelopes: [env('rent'), env('ef', 'sav'), env('fun')] }];
    expect(defaultDiscretionary(groups, new Set(['rent']), new Set(['sav']))).toEqual(['fun']);
  });
});
