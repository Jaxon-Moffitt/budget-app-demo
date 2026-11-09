import { localDate } from '../month';
import {
  amountFields,
  dateFromDay,
  isBankTransaction,
  rankTransferCandidates,
  signedAmount,
  splitProblem,
  splitRemaining,
  suggestPayees,
  investmentSide,
  kindAllowsEnvelope,
  kindUsesEnvelope,
  suggestedKind,
} from '../transactions';

describe('transaction helpers', () => {
  it('signs amounts by direction', () => {
    expect(signedAmount('12.34', 'out')).toBe(-1234);
    expect(signedAmount('$1,200', 'in')).toBe(120000);
    // A typed sign doesn't fight the toggle.
    expect(signedAmount('-5', 'in')).toBe(500);
    expect(() => signedAmount('abc', 'out')).toThrow();
  });

  it('splits a stored amount for the form', () => {
    expect(amountFields(-1234)).toEqual({ text: '12.34', direction: 'out' });
    expect(amountFields(500)).toEqual({ text: '5.00', direction: 'in' });
    expect(amountFields(0)).toEqual({ text: '0.00', direction: 'in' });
  });

  it('treats any imported row as a bank transaction', () => {
    expect(isBankTransaction('1784037000')).toBe(true);
    expect(isBankTransaction('starting-balance')).toBe(true);
    expect(isBankTransaction(null)).toBe(false);
  });

  it('round-trips a day through the date picker', () => {
    expect(localDate(dateFromDay('2026-03-08'))).toBe('2026-03-08');
  });

  it('puts a transfer category only on the budget side of a budget boundary', () => {
    const budget = (amount: number) => ({ onBudget: true, amount });
    const off = (amount: number) => ({ onBudget: false, amount });
    expect(investmentSide(budget(-100), budget(100))).toBe('none');
    expect(investmentSide(off(-100), off(100))).toBe('none');
    expect(investmentSide(budget(-100), off(100))).toBe('first');
    expect(investmentSide(off(100), budget(-100))).toBe('second');
    // Money coming into the budget is income, not an investment.
    expect(investmentSide(budget(100), off(-100))).toBe('none');
  });

  it('knows which kinds use an envelope and guesses a kind', () => {
    expect(kindUsesEnvelope('spending')).toBe(true);
    expect(kindUsesEnvelope('investment')).toBe(true);
    expect(kindUsesEnvelope('income')).toBe(false);
    expect(kindUsesEnvelope('transfer')).toBe(false);
    expect(kindUsesEnvelope(null)).toBe(false);
    expect(kindAllowsEnvelope('income')).toBe(true);
    expect(kindAllowsEnvelope('transfer')).toBe(false);
    expect(suggestedKind(500)).toBe('income');
    expect(suggestedKind(-500)).toBe('spending');
  });

  it('suggests the other side of a transfer', () => {
    const txn = { date: '2026-07-20', amount: -60000, accountId: 'income' };
    const ranked = rankTransferCandidates(txn, [
      { id: 'far', date: '2026-07-29', amount: 60000, accountId: '360' },
      { id: 'later', date: '2026-07-22', amount: 60000, accountId: '360' },
      { id: 'same-day', date: '2026-07-20', amount: 60000, accountId: '360' },
      { id: 'same-account', date: '2026-07-20', amount: 60000, accountId: 'income' },
      { id: 'wrong-sign', date: '2026-07-20', amount: -60000, accountId: '360' },
    ]);
    expect(ranked.map(c => c.id)).toEqual(['same-day', 'later']);
  });

  it('checks splits', () => {
    const food = { envelopeId: 'food' };
    const home = { envelopeId: 'home' };
    expect(splitRemaining(-10000, [{ amount: -6000 }, { amount: -3000 }])).toBe(-1000);
    expect(splitProblem(-10000, [{ amount: -10000, ...food }])).toMatch(/two parts/);
    expect(splitProblem(-10000, [{ amount: -6000, ...food }, { amount: -3000, ...home }])).toMatch(
      /add up/,
    );
    expect(
      splitProblem(-10000, [{ amount: -6000, ...food }, { amount: -4000, envelopeId: null }]),
    ).toMatch(/envelope/);
    expect(splitProblem(-10000, [{ amount: -6000, ...food }, { amount: -4000, ...home }])).toBeNull();
  });

  it('suggests payees, prefix matches first', () => {
    const names = ['Safeway', 'Safeway Fuel', 'WAL-MART #1920', 'Costco Gas', 'Ez Orchards'];
    expect(suggestPayees(names, 'saf')).toEqual(['Safeway', 'Safeway Fuel']);
    expect(suggestPayees(names, 'gas')).toEqual(['Costco Gas']);
    expect(suggestPayees(names, 'safeway')).toEqual(['Safeway Fuel']);
    expect(suggestPayees(names, '  ')).toEqual([]);
  });
});
