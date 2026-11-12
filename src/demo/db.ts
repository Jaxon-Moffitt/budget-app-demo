/**
 * The demo's stand-in for Supabase: an in-memory database that answers the
 * same supabase-js calls the app makes (select with embedded relations,
 * filters, ordering, writes, and the RPCs). Everything lives in memory, so
 * a reload starts over from the seed.
 */
import type { Session } from '@supabase/supabase-js';

import { seed, type Tables } from './seed';

type Row = Record<string, any>;
type Result = { data: any; error: { message: string } | null; count?: number };

let tables: Tables = seed();
let nextId = 1;
const newId = () => `demo-${Date.now().toString(36)}-${nextId++}`;

/** Starts the demo over from fresh dummy data (also used by tests). */
export function resetDemo(today?: Date) {
  tables = seed(today);
}

export function demoTables(): Tables {
  return tables;
}

class DemoError extends Error {}

// Relations ---------------------------------------------------------------------

/** Embeds the app selects, by table and embedded table name. */
const RELATIONS: Record<string, Record<string, { kind: 'one'; fk: string } | { kind: 'many'; fk: string }>> = {
  transactions: {
    payees: { kind: 'one', fk: 'payee_id' },
    accounts: { kind: 'one', fk: 'account_id' },
    envelopes: { kind: 'one', fk: 'envelope_id' },
    categories: { kind: 'one', fk: 'category_id' },
  },
  envelope_groups: { envelopes: { kind: 'many', fk: 'group_id' } },
  households: { household_members: { kind: 'many', fk: 'household_id' } },
};

type Field =
  | { type: 'column'; name: string }
  | { type: 'embed'; alias: string; table: string; inner: boolean; fields: Field[] | 'count' };

function splitTop(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelect(select: string): Field[] {
  return splitTop(select).map(token => {
    const m = token.match(/^(?:(\w+):)?(\w+)(!inner)?\((.*)\)$/s);
    if (!m) return { type: 'column', name: token };
    const [, alias, table, inner, inside] = m;
    return {
      type: 'embed',
      alias: alias ?? table,
      table,
      inner: Boolean(inner),
      fields: inside.trim() === 'count' ? 'count' : parseSelect(inside),
    };
  });
}

function project(table: string, row: Row, fields: Field[]): Row {
  const out: Row = {};
  for (const f of fields) {
    if (f.type === 'column') {
      if (f.name === '*') Object.assign(out, row);
      else out[f.name] = row[f.name] ?? null;
      continue;
    }
    const rel = RELATIONS[table]?.[f.table];
    if (!rel) throw new DemoError(`Unknown relation ${table} → ${f.table}`);
    if (rel.kind === 'one') {
      const target = row[rel.fk] ? tables[f.table as keyof Tables].find((r: Row) => r.id === row[rel.fk]) : null;
      out[f.alias] = target ? (f.fields === 'count' ? { count: 1 } : project(f.table, target, f.fields)) : null;
    } else {
      const children = (tables[f.table as keyof Tables] as Row[]).filter(r => r[rel.fk] === row.id);
      out[f.alias] = f.fields === 'count' ? [{ count: children.length }] : children.map(c => project(f.table, c, f.fields as Field[]));
    }
  }
  return out;
}

// Filters ---------------------------------------------------------------------

type Filter = { col: string; test(value: unknown): boolean };

function lookup(row: Row, col: string): unknown {
  return col.split('.').reduce<unknown>((v, key) => (v && typeof v === 'object' ? (v as Row)[key] : undefined), row);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return a < b ? -1 : 1;
}

/** PostgREST's text form, as used in .or(): "imported_id.is.null,imported_id.neq.starting-balance". */
function parseCondition(text: string): Filter {
  const [col, op, ...rest] = text.split('.');
  const raw = rest.join('.');
  const value = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw;
  switch (op) {
    case 'is':
      return { col, test: v => (v ?? null) === value };
    case 'eq':
      return { col, test: v => String(v) === String(value) };
    case 'neq':
      return { col, test: v => v !== null && v !== undefined && String(v) !== String(value) };
    default:
      throw new DemoError(`Unsupported filter ${op}`);
  }
}

// Query builder ---------------------------------------------------------------

type Mode =
  | { kind: 'select'; fields: Field[] }
  | { kind: 'insert'; rows: Row[] }
  | { kind: 'update'; changes: Row }
  | { kind: 'upsert'; rows: Row[]; onConflict: string[]; ignoreDuplicates: boolean }
  | { kind: 'delete' };

class Query implements PromiseLike<Result> {
  private mode: Mode = { kind: 'select', fields: [{ type: 'column', name: '*' }] };
  private filters: Filter[] = [];
  private orders: { col: string; ascending: boolean; referencedTable?: string }[] = [];
  private window: { from: number; to: number } | null = null;
  private max: number | null = null;
  private one: 'single' | 'maybe' | null = null;
  private returning: Field[] | null = null;
  private counting: { head: boolean } | null = null;

  constructor(private table: keyof Tables) {}

  select(fields = '*', options: { count?: 'exact'; head?: boolean } = {}) {
    if (options.count) this.counting = { head: options.head ?? false };
    if (this.mode.kind === 'select') this.mode = { kind: 'select', fields: parseSelect(fields) };
    // After insert, select() asks for the new rows back, as in PostgREST.
    else this.returning = parseSelect(fields);
    return this;
  }
  insert(values: Row | Row[]) {
    this.mode = { kind: 'insert', rows: Array.isArray(values) ? values : [values] };
    return this;
  }
  update(changes: Row) {
    this.mode = { kind: 'update', changes };
    return this;
  }
  upsert(values: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = {
      kind: 'upsert',
      rows: Array.isArray(values) ? values : [values],
      onConflict: (options.onConflict ?? 'id').split(',').map(s => s.trim()),
      ignoreDuplicates: options.ignoreDuplicates ?? false,
    };
    return this;
  }
  delete() {
    this.mode = { kind: 'delete' };
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters.push({ col, test: v => v === value || String(v) === String(value) });
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push({ col, test: v => v !== null && v !== undefined && v !== value });
    return this;
  }
  gte(col: string, value: any) {
    this.filters.push({ col, test: v => v !== null && v !== undefined && (v as any) >= value });
    return this;
  }
  gt(col: string, value: any) {
    this.filters.push({ col, test: v => v !== null && v !== undefined && (v as any) > value });
    return this;
  }
  lte(col: string, value: any) {
    this.filters.push({ col, test: v => v !== null && v !== undefined && (v as any) <= value });
    return this;
  }
  lt(col: string, value: any) {
    this.filters.push({ col, test: v => v !== null && v !== undefined && (v as any) < value });
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push({ col, test: v => values.includes(v) });
    return this;
  }
  is(col: string, value: unknown) {
    this.filters.push({ col, test: v => (v ?? null) === value });
    return this;
  }
  not(col: string, op: string, value: unknown) {
    const inner = parseCondition(`${col}.${op}.${value === null ? 'null' : String(value)}`);
    this.filters.push({ col, test: v => !inner.test(v) });
    return this;
  }
  or(conditions: string) {
    const parts = splitTop(conditions).map(parseCondition);
    // Each part may name a different column, so it tests the whole row.
    this.filters.push({ col: '__row__', test: row => parts.some(p => p.test(lookup(row as Row, p.col))) });
    return this;
  }
  order(col: string, options: { ascending?: boolean; referencedTable?: string } = {}) {
    this.orders.push({ col, ascending: options.ascending ?? true, referencedTable: options.referencedTable });
    return this;
  }
  range(from: number, to: number) {
    this.window = { from, to };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  // The type argument matches supabase-js's; the demo doesn't check it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  single<T = unknown>() {
    this.one = 'single';
    return this;
  }
  maybeSingle() {
    this.one = 'maybe';
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    let result: Result;
    try {
      const data = this.run();
      result = this.counting
        ? { data: this.counting.head ? null : data, error: null, count: Array.isArray(data) ? data.length : 0 }
        : { data, error: null };
    } catch (e) {
      result = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
    // A short delay, as a network call would have.
    return new Promise<Result>(resolve => setTimeout(() => resolve(result), 60)).then(onfulfilled, onrejected);
  }

  private matches(row: Row, projected?: Row): boolean {
    return this.filters.every(f => {
      if (f.col === '__row__') return f.test(row);
      if (f.col.includes('.')) return projected ? f.test(lookup(projected, f.col)) : true;
      return f.test(row[f.col]);
    });
  }

  private rows(): Row[] {
    return tables[this.table] as Row[];
  }

  private run(): unknown {
    switch (this.mode.kind) {
      case 'select':
        return this.runSelect(this.mode.fields);
      case 'insert': {
        const inserted = this.mode.rows.map(r => insertRow(this.table, r));
        afterInsert(this.table, inserted);
        if (!this.returning) return null;
        const fields = this.returning;
        const out = inserted.map(row => project(this.table, row, fields));
        return this.one ? (out[0] ?? null) : out;
      }
      case 'update': {
        for (const row of this.rows().filter(r => this.matches(r))) updateRow(this.table, row, this.mode.changes);
        return null;
      }
      case 'upsert': {
        const { rows, onConflict, ignoreDuplicates } = this.mode;
        const inserted: Row[] = [];
        for (const r of rows) {
          const existing = this.rows().find(x => onConflict.every(c => x[c] === r[c]));
          if (existing) {
            if (!ignoreDuplicates) updateRow(this.table, existing, r);
          } else {
            inserted.push(insertRow(this.table, r));
          }
        }
        afterInsert(this.table, inserted);
        return null;
      }
      case 'delete': {
        const doomed = this.rows().filter(r => this.matches(r));
        for (const row of doomed) deleteRow(this.table, row);
        return null;
      }
    }
  }

  private runSelect(fields: Field[]): unknown {
    const embeds = fields.filter((f): f is Extract<Field, { type: 'embed' }> => f.type === 'embed');
    let out: { row: Row; projected: Row }[] = this.rows()
      .filter(r => this.matches(r))
      .map(row => ({ row, projected: project(this.table, row, fields) }));
    // Filters on embedded columns, and inner joins.
    out = out.filter(({ row, projected }) => {
      if (!this.matches(row, projected)) return false;
      return embeds.every(e => !e.inner || projected[e.alias] !== null);
    });
    const own = this.orders.filter(o => !o.referencedTable);
    out.sort((a, b) => {
      for (const o of own) {
        const c = compare(a.row[o.col], b.row[o.col]);
        if (c !== 0) return o.ascending ? c : -c;
      }
      return 0;
    });
    let data = out.map(o => o.projected);
    for (const o of this.orders.filter(x => x.referencedTable)) {
      const alias = embeds.find(e => e.table === o.referencedTable)?.alias ?? o.referencedTable!;
      const keys = this.orders.filter(x => x.referencedTable === o.referencedTable);
      for (const d of data) {
        if (Array.isArray(d[alias])) {
          d[alias] = [...d[alias]].sort((a: Row, b: Row) => {
            for (const k of keys) {
              const c = compare(a[k.col], b[k.col]);
              if (c !== 0) return k.ascending ? c : -c;
            }
            return 0;
          });
        }
      }
    }
    if (this.window) data = data.slice(this.window.from, this.window.to + 1);
    if (this.max !== null) data = data.slice(0, this.max);
    if (this.one === 'single') {
      if (data.length !== 1) throw new DemoError('JSON object requested, multiple (or no) rows returned');
      return data[0];
    }
    if (this.one === 'maybe') {
      if (data.length > 1) throw new DemoError('JSON object requested, multiple rows returned');
      return data[0] ?? null;
    }
    return data;
  }
}

// Writes, with the database's defaults and rules ------------------------------

const DEFAULTS: Partial<Record<keyof Tables, () => Row>> = {
  transactions: () => ({
    pending: false,
    cleared: true,
    notes: null,
    imported_id: null,
    imported_payee: null,
    payee_id: null,
    kind: null,
    envelope_id: null,
    category_id: null,
    transfer_id: null,
    parent_id: null,
    is_parent: false,
    auto_linked: false,
  }),
  envelopes: () => ({ target: null, starting_balance: 0, linked_account_id: null, hidden: false, sort_order: 0 }),
  envelope_groups: () => ({ hidden: false, sort_order: 0 }),
  categories: () => ({ default_envelope_id: null, hidden: false, sort_order: 0 }),
  rules: () => ({ direction: null, account_id: null, envelope_id: null, category_id: null, sort_order: 0 }),
};

function checkTransaction(row: Row) {
  const uses = row.kind === 'spending' || row.kind === 'investment';
  if (row.kind === 'spending' && !row.envelope_id && !row.is_parent) {
    throw new DemoError('Spending needs an envelope');
  }
  if (row.kind === 'investment' && !row.envelope_id) throw new DemoError('Investments need an envelope');
  if (!uses && row.kind !== 'income' && row.envelope_id) throw new DemoError('Only spending, investments and income use an envelope');
}

function checkName(table: keyof Tables, row: Row) {
  if (table !== 'categories' && table !== 'envelopes') return;
  if (!String(row.name ?? '').trim()) throw new DemoError('Enter a name.');
}

function insertRow(table: keyof Tables, values: Row): Row {
  const row: Row = { ...(DEFAULTS[table]?.() ?? {}), created_at: new Date().toISOString(), ...values };
  row.id ??= newId();
  if (table === 'transactions') checkTransaction(row);
  checkName(table, row);
  (tables[table] as Row[]).push(row);
  return row;
}

function updateRow(table: keyof Tables, row: Row, changes: Row) {
  const next = { ...row, ...changes };
  if (table === 'transactions') checkTransaction(next);
  checkName(table, next);
  Object.assign(row, changes);
}

function deleteRow(table: keyof Tables, row: Row) {
  const list = tables[table] as Row[];
  if (table === 'envelope_groups' && tables.envelopes.some(e => e.group_id === row.id)) {
    throw new DemoError('Only empty groups can be deleted');
  }
  list.splice(list.indexOf(row), 1);
  if (table === 'transactions') {
    // Split parts go with their parent; a transfer's other side is unlinked.
    for (const child of tables.transactions.filter(t => t.parent_id === row.id)) deleteRow('transactions', child);
    for (const t of tables.transactions.filter(t => t.transfer_id === row.id)) t.transfer_id = null;
  }
  if (table === 'categories') {
    for (const t of tables.transactions) if (t.category_id === row.id) t.category_id = null;
    for (const r of tables.rules) if (r.category_id === row.id) r.category_id = null;
  }
  if (table === 'envelopes') {
    tables.budget_months = tables.budget_months.filter(b => b.envelope_id !== row.id);
    tables.rules = tables.rules.filter(r => r.envelope_id !== row.id);
    for (const c of tables.categories) if (c.default_envelope_id === row.id) c.default_envelope_id = null;
  }
}

/** Like the database trigger: new rows get filed by the rules. */
function afterInsert(table: keyof Tables, rows: Row[]) {
  if (table !== 'transactions') return;
  const ids = rows.map(r => r.id).filter(Boolean);
  if (ids.length) autoFile(ids);
}

// RPCs --------------------------------------------------------------------------

const account = (id: string) => tables.accounts.find(a => a.id === id);
const txn = (id: string) => {
  const t = tables.transactions.find(x => x.id === id);
  if (!t) throw new DemoError('Transaction not found');
  return t;
};

function budgetActivity(startMonth: string) {
  const start = `${startMonth}-01`;
  const rows = tables.transactions.filter(t => account(t.account_id)?.on_budget && !t.is_parent);
  const out: Row[] = [
    {
      month: null,
      envelope_id: null,
      kind: 'opening',
      amount: rows.filter(t => t.date < start).reduce((s, t) => s + t.amount, 0),
    },
  ];
  const groups = new Map<string, Row>();
  for (const t of rows) {
    if (t.date < start) continue;
    if (t.kind === 'transfer' || (t.kind === null && t.transfer_id)) continue;
    const kind = t.imported_id === 'starting-balance' ? 'starting' : (t.kind ?? 'unreviewed');
    const envelope = ['spending', 'investment', 'income'].includes(kind) ? t.envelope_id : null;
    const key = `${t.date.slice(0, 7)}|${envelope}|${kind}`;
    const g = groups.get(key) ?? { month: t.date.slice(0, 7), envelope_id: envelope, kind, amount: 0 };
    g.amount += t.amount;
    groups.set(key, g);
  }
  return [...out, ...groups.values()];
}

function linkPair(a: Row, b: Row, budgetEnvelope: string | null, auto: boolean) {
  const aOn = account(a.account_id)!.on_budget;
  const bOn = account(b.account_id)!.on_budget;
  for (const [self, other, on] of [
    [a, b, aOn],
    [b, a, bOn],
  ] as const) {
    self.transfer_id = other.id;
    self.auto_linked = auto;
    if (aOn && bOn) {
      self.kind = 'transfer';
      self.envelope_id = null;
    } else if (!on) {
      self.kind = null;
      self.envelope_id = null;
    } else if (self.amount < 0) {
      self.kind = 'investment';
      self.envelope_id = budgetEnvelope ?? self.envelope_id;
    } else {
      self.kind = 'income';
      self.envelope_id = null;
    }
  }
}

/** Rules, then unambiguous transfers: a simplified version of the real filer. */
function autoFile(ids: string[]): number {
  let filed = 0;
  const lower = (s: unknown) => String(s ?? '').toLowerCase();
  const rules = [...tables.rules].sort((a, b) => a.sort_order - b.sort_order);
  for (const id of ids) {
    const t = tables.transactions.find(x => x.id === id);
    if (!t || t.kind !== null || t.transfer_id || t.parent_id || t.is_parent || t.imported_id === 'starting-balance') continue;
    if (!account(t.account_id)?.on_budget) continue;
    const payee = lower(tables.payees.find(p => p.id === t.payee_id)?.name);
    const rule = rules.find(
      r =>
        (!r.account_id || r.account_id === t.account_id) &&
        (!r.direction || (r.direction === 'in') === t.amount > 0) &&
        (lower(t.imported_payee).includes(lower(r.match_text).trim()) || payee.includes(lower(r.match_text).trim())),
    );
    if (rule) {
      t.kind = rule.kind;
      t.envelope_id = rule.envelope_id;
      t.category_id = rule.category_id ?? t.category_id;
      filed++;
    }
  }
  const pool = tables.transactions.filter(
    t =>
      !t.transfer_id &&
      !t.parent_id &&
      !t.is_parent &&
      t.amount !== 0 &&
      t.imported_id !== 'starting-balance' &&
      (t.kind === null || t.kind === 'transfer'),
  );
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const partners = (x: Row) =>
    pool.filter(
      y =>
        y.account_id !== x.account_id &&
        y.amount === -x.amount &&
        days(x.date, y.date) <= 7 &&
        account(x.account_id)!.on_budget &&
        account(y.account_id)!.on_budget,
    );
  for (const x of pool) {
    if (!ids.includes(x.id) || x.transfer_id) continue;
    const options = partners(x).filter(y => !y.transfer_id);
    if (options.length === 1 && partners(options[0]).filter(z => !z.transfer_id).length === 1) {
      linkPair(x, options[0], null, true);
      filed += 2;
    }
  }
  return filed;
}

const RPCS: Record<string, (args: Row) => unknown> = {
  budget_activity: ({ start_month }) => budgetActivity(start_month),

  account_balances: () =>
    tables.accounts.map(a => ({
      account_id: a.id,
      balance: tables.transactions.filter(t => t.account_id === a.id && !t.parent_id).reduce((s, t) => s + t.amount, 0),
    })),

  apply_rules: () =>
    autoFile(
      tables.transactions
        .filter(t => !t.transfer_id && !t.parent_id && (t.kind === null || t.kind === 'transfer' || t.kind === 'investment'))
        .map(t => t.id),
    ),

  link_transfer: ({ first_id, second_id, budget_envelope }) => {
    const a = txn(first_id);
    const b = txn(second_id);
    if (a.account_id === b.account_id) throw new DemoError('A transfer needs two different accounts');
    if (a.amount !== -b.amount) throw new DemoError('The two sides of a transfer must be equal and opposite');
    const budgetSide = account(a.account_id)!.on_budget && !account(b.account_id)!.on_budget ? a : !account(a.account_id)!.on_budget && account(b.account_id)!.on_budget ? b : null;
    if (budgetSide && budgetSide.amount < 0 && !budget_envelope) throw new DemoError('Choose the envelope this investment comes from');
    linkPair(a, b, budget_envelope ?? null, false);
    return null;
  },

  unlink_transfer: ({ transaction_id }) => {
    const t = txn(transaction_id);
    const other = t.transfer_id ? tables.transactions.find(x => x.id === t.transfer_id) : null;
    for (const r of [t, other]) {
      if (!r) continue;
      Object.assign(r, { transfer_id: null, kind: null, envelope_id: null, auto_linked: false });
    }
    return null;
  },

  create_transfer: ({ from_account, to_account, amount, transfer_date, budget_envelope, transfer_notes }) => {
    if (amount <= 0) throw new DemoError('Enter the amount moved, above zero');
    if (from_account === to_account) throw new DemoError('A transfer needs two different accounts');
    const fromOn = account(from_account)!.on_budget;
    const toOn = account(to_account)!.on_budget;
    if (fromOn && !toOn && !budget_envelope) throw new DemoError('Choose the envelope this investment comes from');
    const out = insertRow('transactions', { household_id: 'h1', account_id: from_account, date: transfer_date, amount: -amount, notes: transfer_notes });
    const inn = insertRow('transactions', { household_id: 'h1', account_id: to_account, date: transfer_date, amount, notes: transfer_notes });
    linkPair(out, inn, budget_envelope ?? null, false);
    return out.id;
  },

  save_split: ({ parent, parts }) => {
    const p = txn(parent);
    if (p.transfer_id) throw new DemoError('Unlink the transfer before splitting it');
    if (parts.length < 2) throw new DemoError('A split needs at least two parts');
    if (parts.some((x: Row) => !x.envelope_id || !x.amount)) throw new DemoError('Each part needs an amount and an envelope');
    if (parts.reduce((s: number, x: Row) => s + x.amount, 0) !== p.amount) throw new DemoError('The parts must add up to the transaction');
    tables.transactions = tables.transactions.filter(t => t.parent_id !== p.id);
    Object.assign(p, { is_parent: true, kind: 'spending', envelope_id: null, category_id: null });
    for (const x of parts) {
      insertRow('transactions', {
        household_id: p.household_id,
        account_id: p.account_id,
        date: p.date,
        amount: x.amount,
        kind: 'spending',
        envelope_id: x.envelope_id,
        category_id: x.category_id ?? null,
        notes: x.notes ?? null,
        parent_id: p.id,
        pending: p.pending,
      });
    }
    return null;
  },

  remove_split: ({ parent }) => {
    tables.transactions = tables.transactions.filter(t => t.parent_id !== parent);
    Object.assign(txn(parent), { is_parent: false, kind: null, envelope_id: null });
    return null;
  },

  delete_envelope: ({ envelope, replacement }) => {
    const old = tables.envelopes.find(e => e.id === envelope);
    if (!old) throw new DemoError('Envelope not found');
    if (replacement) {
      for (const b of tables.budget_months.filter(x => x.envelope_id === envelope)) {
        const into = tables.budget_months.find(x => x.envelope_id === replacement && x.month === b.month);
        if (into) into.assigned += b.assigned;
        else tables.budget_months.push({ ...b, envelope_id: replacement });
      }
      const target = tables.envelopes.find(e => e.id === replacement)!;
      target.starting_balance += old.starting_balance;
      for (const t of tables.transactions) if (t.envelope_id === envelope) t.envelope_id = replacement;
      for (const c of tables.categories) if (c.default_envelope_id === envelope) c.default_envelope_id = replacement;
      for (const r of tables.rules) if (r.envelope_id === envelope) r.envelope_id = replacement;
    } else {
      for (const t of tables.transactions) if (t.envelope_id === envelope) Object.assign(t, { kind: null, envelope_id: null });
    }
    deleteRow('envelopes', old);
    return null;
  },

  set_envelope_order: ({ ordered }) => setOrder('envelopes', ordered),
  set_envelope_group_order: ({ ordered }) => setOrder('envelope_groups', ordered),
  set_category_order: ({ ordered }) => setOrder('categories', ordered),
  set_rule_order: ({ ordered }) => setOrder('rules', ordered),

  create_account: ({ account_name, account_type, in_budget, starting_balance, starting_date }) => {
    const acct = insertRow('accounts', {
      household_id: 'h1',
      name: account_name,
      nickname: null,
      type: account_type,
      on_budget: in_budget,
      closed: false,
      sort_order: 0,
      sfin_account_id: null,
      sfin_org_name: null,
      balance_current: null,
      last_synced_at: null,
    });
    const payee = tables.payees.find(p => p.name === 'Starting Balance');
    insertRow('transactions', {
      household_id: 'h1',
      account_id: acct.id,
      date: starting_date,
      amount: starting_balance,
      payee_id: payee?.id ?? null,
      imported_id: 'starting-balance',
    });
    return acct.id;
  },

  create_household: () => {
    throw new DemoError('Not available in the demo');
  },
  add_household_member: () => {
    throw new DemoError('Not available in the demo: the real app adds a partner by email');
  },
};

function setOrder(table: 'envelopes' | 'envelope_groups' | 'categories' | 'rules', ordered: string[]) {
  ordered.forEach((id, i) => {
    const row = (tables[table] as Row[]).find(r => r.id === id);
    if (row) row.sort_order = i + 1;
  });
  return null;
}

// The client ----------------------------------------------------------------------

const DEMO_USER = {
  id: 'demo-user',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'demo@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const DEMO_SESSION = {
  access_token: 'demo',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  user: DEMO_USER,
} as Session;
type AuthError = { message: string } | null;

function delay<T>(value: T): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), 60));
}

export function createDemoClient() {
  type Channel = { on(...args: unknown[]): Channel; subscribe(): Channel };
  const channel: Channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    from: (table: string) => {
      if (!(table in tables)) throw new Error(`Unknown table ${table}`);
      return new Query(table as keyof Tables);
    },
    rpc: (name: string, args: Row = {}): Promise<Result> => {
      try {
        const fn = RPCS[name];
        if (!fn) throw new DemoError(`Unknown function ${name}`);
        return delay({ data: fn(args), error: null });
      } catch (e) {
        return delay({ data: null, error: { message: e instanceof Error ? e.message : String(e) } });
      }
    },
    functions: {
      invoke: <T = unknown>(_name: string, _options?: unknown) =>
        delay({
          data: { status: 'skipped', message: 'Bank sync is turned off in the demo.' } as T,
          error: null as { message: string } | null,
        }),
    },
    channel: (_name: string) => channel,
    removeChannel: (_channel: unknown) => Promise.resolve('ok'),
    auth: {
      getSession: () => delay({ data: { session: DEMO_SESSION as Session | null }, error: null as AuthError }),
      onAuthStateChange: (_cb: (event: string, session: Session | null) => void) => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      signInWithPassword: (_credentials: unknown) => delay({ data: { session: DEMO_SESSION }, error: null as AuthError }),
      signUp: (_credentials: unknown) => delay({ data: { session: DEMO_SESSION as Session | null }, error: null as AuthError }),
      // Signing out of the demo just starts it over.
      signOut: () => {
        resetDemo();
        return delay({ error: null });
      },
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
    },
  };
}
