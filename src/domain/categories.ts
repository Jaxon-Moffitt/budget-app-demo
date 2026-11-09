/**
 * Rules for managing envelopes and categories that don't need the
 * database: what pickers show, reordering, and checking names.
 */

type Hideable = { id: string; name: string; hidden: boolean };
type Group<E extends Hideable> = Hideable & { envelopes: E[] };

/** An envelope counts as hidden when it or its group is hidden. */
export function isHidden(group: Hideable, envelope: Hideable): boolean {
  return group.hidden || envelope.hidden;
}

/**
 * What envelope pickers offer: no hidden groups or envelopes, and no empty
 * groups. keep is an id that stays even if hidden (the choice already made).
 */
export function visibleGroups<E extends Hideable, G extends Group<E>>(groups: G[], keep?: string | null): G[] {
  return groups
    .map(g => ({ ...g, envelopes: g.envelopes.filter(e => !isHidden(g, e) || e.id === keep) }))
    .filter(g => g.envelopes.length > 0);
}

/** What category pickers offer: no hidden ones, except one already chosen. */
export function visibleItems<T extends Hideable>(items: T[], keep?: string | null): T[] {
  return items.filter(i => !i.hidden || i.id === keep);
}

/** The ids in a new order, with one moved up (-1) or down (+1). Unchanged at the ends. */
export function moveId(ids: string[], id: string, step: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** A sort_order that puts a new item after all of these. */
export function nextSortOrder(items: { sort_order: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;
}

/** Trims and collapses spaces, the form names are saved in. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Why a name can't be used, or null. Names must be unique (ignoring case)
 * among the others given, since pickers and lists show only the name.
 */
export function nameProblem(name: string, others: { id: string; name: string }[], selfId?: string): string | null {
  const clean = cleanName(name);
  if (!clean) return 'Enter a name.';
  const taken = others.some(o => o.id !== selfId && o.name.toLowerCase() === clean.toLowerCase());
  return taken ? `There’s already one called “${clean}”.` : null;
}
