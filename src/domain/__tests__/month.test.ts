import { addMonths, formatDay, formatMonth, localDate, monthOf, monthRange } from '../month';

describe('month helpers', () => {
  it('adds months across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -14)).toBe('2025-01');
  });

  it('lists an inclusive range', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('gets the month of a date', () => {
    expect(monthOf('2026-10-03')).toBe('2026-10');
  });

  it('formats a date in local time, not UTC', () => {
    expect(formatDay('2026-10-08', 'en-US')).toBe('Thu, Oct 8');
  });

  it('gives the local calendar day', () => {
    expect(localDate(new Date(2026, 9, 9, 23, 30))).toBe('2026-10-09');
  });

  it('names a month', () => {
    expect(formatMonth('2026-10', 'en-US')).toBe('October 2026');
  });
});
