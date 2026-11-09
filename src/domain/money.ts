/**
 * All money in the app is an integer number of cents (-1234 = -$12.34).
 * Never do arithmetic on decimal amounts.
 */
export type Cents = number;

/** Parses a decimal string such as "-12.3" or "1,024.50" into cents without using floats. */
export function parseAmount(value: string): Cents {
  const trimmed = value.trim().replace(/,/g, '');
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    throw new Error(`Invalid amount: "${value}"`);
  }
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`Amount has more than two decimal places: "${value}"`);
  }
  const cents = Number(whole || '0') * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'));
  return sign === '-' && cents !== 0 ? -cents : cents;
}

/** Formats cents as a currency string, e.g. -1234 → "-$12.34". */
export function formatCents(cents: Cents, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
