import { formatCents, parseAmount } from '../money';

describe('parseAmount', () => {
  it.each([
    ['12.34', 1234],
    ['-12.34', -1234],
    ['-0.5', -50],
    ['.99', 99],
    ['100', 10000],
    ['1,024.50', 102450],
    ['+3.00', 300],
    ['-0.00', 0],
    ['2.5000', 250],
  ])('parses %s', (value, expected) => {
    expect(parseAmount(value)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '.', '1.234'])('rejects %p', value => {
    expect(() => parseAmount(value)).toThrow();
  });
});

describe('formatCents', () => {
  it('formats as dollars', () => {
    expect(formatCents(-123456)).toBe('-$1,234.56');
  });
});
