/**
 * Color math for the custom theme: WCAG contrast, mixing, and turning the
 * four colors a person picks into every color the app uses, with text
 * colors adjusted until they're readable on the surfaces they sit on.
 */

/** "#RRGGBB", uppercase. */
export type Hex = string;

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a hex color: "${hex}"`);
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function toHex([r, g, b]: Rgb): Hex {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** Normalizes any 3- or 6-digit hex to "#RRGGBB". */
export function normalizeHex(hex: string): Hex {
  return toHex(parseHex(hex));
}

/** WCAG 2 relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `amount` 0 is `from`, 1 is `to`. */
export function mix(from: string, to: string, amount: number): Hex {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount) as Rgb);
}

/** True when light text reads better on this color than dark text. */
export function isDark(hex: string): boolean {
  return contrast(hex, '#FFFFFF') > contrast(hex, '#000000');
}

/**
 * The color closest to `color` that reaches `min` contrast against every
 * surface. It moves toward white or black in small steps, trying whichever
 * direction gets there sooner. If no shade works on all surfaces (say, one
 * is black and one white), it returns the shade with the best worst case.
 */
export function readable(color: string, surfaces: string[], min: number): Hex {
  const worst = (c: string) => Math.min(...surfaces.map(s => contrast(c, s)));
  if (worst(color) >= min) return normalizeHex(color);

  let best: Hex = normalizeHex(color);
  let bestScore = worst(color);
  for (let step = 1; step <= 40; step++) {
    for (const target of ['#FFFFFF', '#000000']) {
      const candidate = mix(color, target, step / 40);
      const score = worst(candidate);
      if (score >= min) return candidate;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best;
}

/** Near-white or near-black, tinted toward `color`, whichever reads better on it. */
export function inkFor(color: string, min = 4.5): Hex {
  const light = mix(color, '#FFFFFF', 0.92);
  const dark = mix(color, '#000000', 0.88);
  const pick = contrast(light, color) >= contrast(dark, color) ? light : dark;
  return readable(pick, [color], min);
}

/** The four colors a person picks for a custom theme. */
export type ThemeSeeds = {
  background: Hex;
  /** Cards and grouped lists. */
  card: Hex;
  /** Buttons, money that's there, full fill bars. */
  accent: Hex;
  /** The Ready to assign card. */
  hero: Hex;
};

/** Every color the app uses; the same keys as `Colors.light` in constants/theme.ts. */
export type Palette = {
  text: Hex;
  background: Hex;
  backgroundElement: Hex;
  backgroundSelected: Hex;
  chip: Hex;
  textSecondary: Hex;
  accent: Hex;
  onAccent: Hex;
  warning: Hex;
  danger: Hex;
  /** Text on the Ready to assign card when it turns red. */
  onDanger: Hex;
  border: Hex;
  track: Hex;
  hero: Hex;
  onHero: Hex;
  disabled: Hex;
  onDisabled: Hex;
};

/** WCAG AA for normal text. */
export const TEXT_CONTRAST = 4.5;
/**
 * The Ready to assign card dims its text to 75-85% opacity, which costs
 * contrast, so its text starts from a higher bar.
 */
const HERO_CONTRAST = 7;

/**
 * The full palette from four picked colors. `base` supplies the warning
 * and danger hues (the matching light or dark palette), so "running low"
 * and "overspent" always look like themselves; they're only shifted
 * enough to stay readable.
 */
export function deriveTheme(seeds: ThemeSeeds, base: { warning: Hex; danger: Hex }): Palette {
  const background = normalizeHex(seeds.background);
  const card = normalizeHex(seeds.card);
  const ink = isDark(background) ? '#FFFFFF' : '#000000';

  const chip = mix(background, ink, 0.08);
  const surfaces = [background, card, chip];
  const text = readable(mix(background, ink, 0.88), surfaces, TEXT_CONTRAST);
  const textSecondary = readable(mix(text, background, 0.4), surfaces, TEXT_CONTRAST);
  const accent = readable(seeds.accent, [background, card], TEXT_CONTRAST);
  const danger = readable(base.danger, [background, card], TEXT_CONTRAST);
  const hero = normalizeHex(seeds.hero);
  const disabled = mix(background, ink, 0.14);

  return {
    text,
    background,
    backgroundElement: card,
    backgroundSelected: chip,
    chip,
    textSecondary,
    accent,
    onAccent: inkFor(accent),
    warning: readable(base.warning, [background, card], TEXT_CONTRAST),
    danger,
    onDanger: inkFor(danger, HERO_CONTRAST),
    border: mix(card, ink, 0.12),
    track: mix(card, ink, 0.1),
    hero,
    onHero: inkFor(hero, HERO_CONTRAST),
    disabled,
    // Disabled text only needs to be visible, not comfortable to read.
    onDisabled: readable(mix(disabled, text, 0.5), [disabled], 3),
  };
}

/** Text/surface pairs in a palette that fall short of `TEXT_CONTRAST`. */
export function unreadablePairs(p: Palette): string[] {
  const pairs: [keyof Palette, keyof Palette][] = [
    ['text', 'background'],
    ['text', 'backgroundElement'],
    ['textSecondary', 'background'],
    ['textSecondary', 'backgroundElement'],
    ['accent', 'backgroundElement'],
    ['danger', 'backgroundElement'],
    ['warning', 'backgroundElement'],
    ['onAccent', 'accent'],
    ['onHero', 'hero'],
    ['onDanger', 'danger'],
  ];
  return pairs
    .filter(([fg, bg]) => contrast(p[fg], p[bg]) < TEXT_CONTRAST)
    .map(([fg, bg]) => `${fg} on ${bg}`);
}
