import {
  contrast,
  deriveTheme,
  inkFor,
  isDark,
  mix,
  normalizeHex,
  readable,
  unreadablePairs,
  type ThemeSeeds,
} from '../colors';

const base = { warning: '#985B0E', danger: '#B94739' };

describe('color basics', () => {
  it('normalizes hex', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('267b4c')).toBe('#267B4C');
    expect(() => normalizeHex('blue')).toThrow();
  });

  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // A known pair from WebAIM: #767676 on white is just over 4.5.
    expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('mixes colors', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#267B4C', '#267B4C', 0.7)).toBe('#267B4C');
  });

  it('tells dark from light', () => {
    expect(isDark('#120F0C')).toBe(true);
    expect(isDark('#F7F3ED')).toBe(false);
  });
});

describe('readable', () => {
  it('leaves a color alone when it already reads well', () => {
    expect(readable('#2A1F19', ['#F7F3ED'], 4.5)).toBe('#2A1F19');
  });

  it('nudges a color until it reaches the contrast', () => {
    const fixed = readable('#9ACD32', ['#FFFFFF'], 4.5);
    expect(contrast(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('finds a shade that works on both a light and a dark surface when one exists', () => {
    const fixed = readable('#FF0000', ['#000000', '#FFFFFF'], 4.5);
    expect(contrast(fixed, '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('picks dark ink on light colors and light ink on dark ones', () => {
    expect(isDark(inkFor('#FFE066'))).toBe(true);
    expect(isDark(inkFor('#21402C'))).toBe(false);
  });
});

describe('deriveTheme', () => {
  it('rebuilds a readable palette from the light theme’s own colors', () => {
    const p = deriveTheme(
      { background: '#F7F3ED', card: '#FFFDFA', accent: '#267B4C', hero: '#21402C' },
      base,
    );
    expect(unreadablePairs(p)).toEqual([]);
    expect(p.accent).toBe('#267B4C');
    expect(p.background).toBe('#F7F3ED');
    expect(isDark(p.text)).toBe(true);
  });

  it('rebuilds a readable dark palette', () => {
    const p = deriveTheme(
      { background: '#120F0C', card: '#1F1B17', accent: '#7BCC98', hero: '#88D1A2' },
      { warning: '#EBB25F', danger: '#F68675' },
    );
    expect(unreadablePairs(p)).toEqual([]);
    expect(isDark(p.text)).toBe(false);
  });

  it('adjusts an accent that would be unreadable', () => {
    const p = deriveTheme({ background: '#FFFFFF', card: '#FFFFFF', accent: '#FFF59D', hero: '#3949AB' }, base);
    expect(p.accent).not.toBe('#FFF59D');
    expect(contrast(p.accent, p.backgroundElement)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the hero card text readable at the dimmed opacity', () => {
    const p = deriveTheme({ background: '#FFFFFF', card: '#FFFFFF', accent: '#00695C', hero: '#FFD54F' }, base);
    expect(contrast(p.onHero, p.hero)).toBeGreaterThanOrEqual(7);
    expect(contrast(p.onDanger, p.danger)).toBeGreaterThanOrEqual(4.5);
  });

  // A spread of picks people might make, from pastel to neon to near-black.
  const seedSets: ThemeSeeds[] = [
    { background: '#FDF6E3', card: '#FFFFFF', accent: '#268BD2', hero: '#073642' },
    { background: '#002B36', card: '#073642', accent: '#B58900', hero: '#2AA198' },
    { background: '#FFE4EC', card: '#FFF5F8', accent: '#E91E63', hero: '#880E4F' },
    { background: '#0D0221', card: '#1B0B3A', accent: '#FF2A6D', hero: '#05D9E8' },
    { background: '#E8F5E9', card: '#FFFFFF', accent: '#43A047', hero: '#1B5E20' },
    { background: '#808080', card: '#9E9E9E', accent: '#FFEB3B', hero: '#212121' },
    { background: '#FFFFFF', card: '#F5F5F5', accent: '#FFFF00', hero: '#FFFF00' },
    { background: '#000000', card: '#111111', accent: '#000080', hero: '#000000' },
  ];

  it.each(seedSets)('keeps every text pair readable for %o', seeds => {
    expect(unreadablePairs(deriveTheme(seeds, base))).toEqual([]);
  });
});
