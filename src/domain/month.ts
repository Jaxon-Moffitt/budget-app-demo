/** A budget month in "YYYY-MM" form. */
export type Month = string;

export function addMonths(month: Month, delta: number): Month {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + delta;
  const y = Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return `${y}-${String(mm).padStart(2, '0')}`;
}

/** Every month from `start` to `end`, inclusive. */
export function monthRange(start: Month, end: Month): Month[] {
  const months: Month[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) {
    months.push(m);
  }
  return months;
}

/** The month a "YYYY-MM-DD" date falls in. */
export function monthOf(date: string): Month {
  return date.slice(0, 7);
}

/**
 * A "YYYY-MM-DD" date for display, e.g. "Thu, Oct 8". Built from parts
 * because `new Date("2026-10-08")` is UTC midnight, which is the 7th in the US.
 */
export function formatDay(date: string, locale?: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** A Date's calendar day in local time, as "YYYY-MM-DD" (toISOString would give the UTC day). */
export function localDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-10" → "October", "2026-10" with style 'short' → "Oct". */
export function monthName(month: Month, style: 'long' | 'short' = 'long', locale?: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: style });
}

/** "2026-10" → "October 2026". */
export function formatMonth(month: Month, locale?: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
