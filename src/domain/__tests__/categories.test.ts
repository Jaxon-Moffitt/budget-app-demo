import { cleanName, isHidden, moveId, nameProblem, nextSortOrder, visibleGroups, visibleItems } from '../categories';

const cat = (id: string, hidden = false) => ({ id, name: id, hidden });

describe('categories', () => {
  it('treats a category in a hidden group as hidden', () => {
    expect(isHidden({ ...cat('g'), hidden: true }, cat('a'))).toBe(true);
    expect(isHidden(cat('g'), cat('a', true))).toBe(true);
    expect(isHidden(cat('g'), cat('a'))).toBe(false);
  });

  it('leaves hidden categories and empty groups out of pickers', () => {
    const groups = [
      { ...cat('bills'), envelopes: [cat('rent'), cat('old', true)] },
      { ...cat('gone', true), envelopes: [cat('x')] },
      { ...cat('empty'), envelopes: [cat('y', true)] },
    ];
    const visible = visibleGroups(groups);
    expect(visible.map(g => g.id)).toEqual(['bills']);
    expect(visible[0].envelopes.map(c => c.id)).toEqual(['rent']);
  });

  it('keeps a hidden category that is already chosen', () => {
    const groups = [{ ...cat('bills'), envelopes: [cat('rent'), cat('old', true)] }];
    expect(visibleGroups(groups, 'old')[0].envelopes.map(c => c.id)).toEqual(['rent', 'old']);
  });

  it('leaves hidden categories out unless already chosen', () => {
    const items = [cat('gas'), cat('old', true)];
    expect(visibleItems(items).map(i => i.id)).toEqual(['gas']);
    expect(visibleItems(items, 'old').map(i => i.id)).toEqual(['gas', 'old']);
  });

  it('moves an id up or down, and not past the ends', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveId(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveId(ids, 'a', -1)).toBe(ids);
    expect(moveId(ids, 'c', 1)).toBe(ids);
    expect(moveId(ids, 'z', 1)).toBe(ids);
  });

  it('puts new items after the last one', () => {
    expect(nextSortOrder([{ sort_order: 3 }, { sort_order: 10 }])).toBe(11);
    expect(nextSortOrder([])).toBe(1);
  });

  it('cleans and checks names', () => {
    expect(cleanName('  Pet   care ')).toBe('Pet care');
    const others = [{ id: '1', name: 'Groceries' }];
    expect(nameProblem('   ', others)).toBe('Enter a name.');
    expect(nameProblem(' groceries ', others)).toMatch(/already/);
    expect(nameProblem('Groceries', others, '1')).toBeNull();
    expect(nameProblem('Gas', others)).toBeNull();
  });
});
