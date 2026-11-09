import type { ThemeSeeds } from '@/domain/colors';

/** The four colors of a custom theme, in the order Settings lists them. */
export const SEED_LABELS: Record<keyof ThemeSeeds, { title: string; description: string }> = {
  background: { title: 'Background', description: 'Behind everything' },
  card: { title: 'Cards', description: 'Envelope groups, lists and sheets' },
  accent: { title: 'Accent', description: 'Buttons and money that’s there' },
  hero: { title: 'Ready to assign card', description: 'The big card on the Budget tab' },
};

export const SEED_KEYS = Object.keys(SEED_LABELS) as (keyof ThemeSeeds)[];

export function isSeedKey(value: unknown): value is keyof ThemeSeeds {
  return typeof value === 'string' && value in SEED_LABELS;
}
