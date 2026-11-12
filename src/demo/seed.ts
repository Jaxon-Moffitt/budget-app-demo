/**
 * Made-up data for the demo: a household budgeting from last month, with
 * this month filled in up to today. Dates are worked out from today so the
 * demo never looks stale. Amounts are integer cents, as in the real app.
 */
import { addMonths, localDate, type Month } from '../domain/month.ts';

type Row = Record<string, any>;

export type Tables = {
  households: Row[];
  household_members: Row[];
  accounts: Row[];
  envelope_groups: Row[];
  envelopes: Row[];
  categories: Row[];
  payees: Row[];
  transactions: Row[];
  budget_months: Row[];
  rules: Row[];
  sync_runs: Row[];
};

const H = 'h1';

function daysIn(month: Month): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function seed(now: Date = new Date()): Tables {
  const today = localDate(now);
  const current = today.slice(0, 7);
  const previous = addMonths(current, -1);
  const day = (month: Month, d: number) => `${month}-${String(Math.min(d, daysIn(month))).padStart(2, '0')}`;
  const beforeStart = day(addMonths(previous, -1), 31);

  const accounts: Row[] = [
    ['chk', 'Everyday Checking (1234)', 'checking', true],
    ['sav', 'High-Yield Savings (5678)', 'savings', true],
    ['trv', 'Travel Savings (9012)', 'savings', true],
    ['card', 'Rewards Visa (3456)', 'credit', true],
    ['brk', 'Brokerage (7890)', 'investment', false],
  ].map(([id, name, type, onBudget], i) => ({
    id,
    household_id: H,
    name,
    nickname: null,
    type,
    on_budget: onBudget,
    closed: false,
    sort_order: i,
    sfin_account_id: null,
    sfin_org_name: null,
    balance_current: null,
    last_synced_at: null,
  }));

  const groups = [
    ['fixed', 'Fixed Expenses'],
    ['saving', 'Savings'],
    ['fun', 'Discretionary'],
  ].map(([id, name], i) => ({ id, household_id: H, name, hidden: false, sort_order: i + 1 }));

  // id, group, name, monthly target (cents), starting balance, linked account
  const envelopeSpecs: [string, string, string, number | null, number, string | null][] = [
    ['rent', 'fixed', 'Rent', 145000, 0, null],
    ['util', 'fixed', 'Utilities & Internet', 18000, 0, null],
    ['phone', 'fixed', 'Phone plan', 4500, 0, null],
    ['subs', 'fixed', 'Subscriptions', 3000, 0, null],
    ['ins', 'fixed', 'Insurance', 12800, 0, null],
    ['ef', 'saving', 'Emergency fund', 30000, 850000, 'sav'],
    ['travel', 'saving', 'Travel fund', 15000, 120000, 'trv'],
    ['car', 'saving', 'Car maintenance', 5000, 30000, null],
    ['invest', 'saving', 'Investing', 25000, 0, null],
    ['fts', 'fun', 'Free to spend', 70000, 0, null],
    ['gifts', 'fun', 'Gifts', 5000, 0, null],
  ];
  const envelopes = envelopeSpecs.map(([id, group_id, name, target, starting_balance, linked], i) => ({
    id,
    household_id: H,
    group_id,
    name,
    target,
    starting_balance,
    linked_account_id: linked,
    hidden: false,
    sort_order: i + 1,
  }));

  const categories = [
    ['groceries', 'Groceries', 'fts'],
    ['dining', 'Dining', 'fts'],
    ['gas', 'Gas', 'fts'],
    ['household', 'Household', 'fts'],
    ['gift', 'Gifts', 'gifts'],
    ['fun', 'Entertainment', 'fts'],
    ['housing', 'Housing', 'rent'],
    ['utilities', 'Utilities', 'util'],
    ['streaming', 'Streaming', 'subs'],
    ['insurance', 'Insurance', 'ins'],
    ['auto', 'Car repairs', 'car'],
  ].map(([id, name, env], i) => ({ id, household_id: H, name, default_envelope_id: env, hidden: false, sort_order: i + 1 }));

  const payees: Row[] = [];
  const payeeId = (name: string) => {
    let p = payees.find(x => x.name === name);
    if (!p) {
      p = { id: `p${payees.length + 1}`, household_id: H, name };
      payees.push(p);
    }
    return p.id;
  };

  const transactions: Row[] = [];
  let n = 0;
  const add = (t: {
    account: string;
    date: string;
    amount: number;
    payee?: string;
    description?: string;
    kind?: string | null;
    envelope?: string | null;
    category?: string | null;
    importedId?: string;
  }): Row => {
    const row: Row = {
      id: `t${++n}`,
      household_id: H,
      account_id: t.account,
      date: t.date,
      amount: t.amount,
      pending: false,
      cleared: true,
      notes: null,
      imported_id: t.importedId ?? `bank-${n}`,
      imported_payee: t.description ?? t.payee?.toUpperCase() ?? null,
      payee_id: t.payee ? payeeId(t.payee) : null,
      kind: t.kind ?? null,
      envelope_id: t.envelope ?? null,
      category_id: t.category ?? null,
      transfer_id: null,
      parent_id: null,
      is_parent: false,
      auto_linked: false,
      created_at: `${t.date}T12:00:00Z`,
    };
    transactions.push(row);
    return row;
  };
  const transfer = (from: string, to: string, date: string, amount: number, envelope: string | null = null) => {
    const toOnBudget = accounts.find(a => a.id === to)!.on_budget;
    const out = add({
      account: from,
      date,
      amount: -amount,
      description: `Transfer to ${accounts.find(a => a.id === to)!.name}`,
      kind: toOnBudget ? 'transfer' : 'investment',
      envelope: toOnBudget ? null : envelope,
    });
    const inn = add({
      account: to,
      date,
      amount,
      description: `Transfer from ${accounts.find(a => a.id === from)!.name}`,
      kind: toOnBudget ? 'transfer' : null,
    });
    out.transfer_id = inn.id;
    inn.transfer_id = out.id;
  };

  // What each account held before the budget started.
  for (const [account, amount] of [
    ['chk', 240000],
    ['sav', 850000],
    ['trv', 120000],
    ['card', -64000],
    ['brk', 1500000],
  ] as const) {
    add({ account, date: beforeStart, amount, payee: 'Starting Balance', importedId: 'starting-balance' });
  }

  const happened = (date: string) => date <= today;
  const spend = (account: string, month: Month, d: number, amount: number, payee: string, envelope: string, category: string | null = null) => {
    const date = day(month, d);
    if (happened(date)) add({ account, date, amount: -amount, payee, kind: 'spending', envelope, category });
  };

  let cardBalance = 64000;
  for (const month of [previous, current]) {
    const isPrev = month === previous;
    const at = (d: number) => day(month, d);
    for (const d of [1, 15]) {
      if (happened(at(d))) add({ account: 'chk', date: at(d), amount: 215000, payee: 'Acme Corp', description: 'ACME CORP PAYROLL', kind: 'income' });
    }
    spend('chk', month, 1, 145000, 'Greenwood Apartments', 'rent', 'housing');
    if (happened(at(2))) {
      transfer('chk', 'sav', at(2), 30000);
      transfer('chk', 'trv', at(2), 15000);
    }
    const cardStart = transactions.length;
    spend('card', month, 3, 8612, "Trader Joe's", 'fts', 'groceries');
    spend('card', month, 5, 1549, 'Netflix', 'subs', 'streaming');
    spend('card', month, 6, 4218, 'Corner Bistro', 'fts', 'dining');
    spend('chk', month, 8, 11243, 'City Power & Water', 'util', 'utilities');
    spend('card', month, 9, 4820, 'Shell', 'fts', 'gas');
    spend('card', month, 10, 10245, "Trader Joe's", 'fts', 'groceries');
    // Left without a category, for "Categorize transactions".
    spend('chk', month, 12, 6500, 'FastNet Internet', 'util');
    spend('card', month, 14, 1875, 'Taco Spot', 'fts', 'dining');
    if (happened(at(15))) transfer('chk', 'brk', at(15), 25000, 'invest');
    if (happened(at(16)) && cardBalance > 0) {
      transfer('chk', 'card', at(16), cardBalance);
      cardBalance = 0;
    }
    spend('card', month, 17, 7430, "Trader Joe's", 'fts', 'groceries');
    spend('chk', month, 18, 4500, 'Mobile Co', 'phone');
    spend('card', month, 20, 1199, 'Spotify', 'subs', 'streaming');
    spend('chk', month, 22, 12800, 'Safe Auto Insurance', 'ins', 'insurance');
    spend('card', month, 23, 4820, 'Shell', 'fts', 'gas');
    spend('card', month, 24, 9588, "Trader Joe's", 'fts', 'groceries');
    spend('card', month, 27, 6340, 'Sushi House', 'fts', 'dining');
    if (isPrev) {
      spend('card', month, 11, 3200, 'City Cinema', 'fts', 'fun');
      spend('card', month, 19, 18900, 'Quick Lube & Tire', 'car', 'auto');
      const last = daysIn(month);
      add({ account: 'sav', date: at(last), amount: 2842, payee: 'Interest', description: 'INTEREST PAID', kind: 'income', envelope: 'ef' });
      add({ account: 'trv', date: at(last), amount: 391, payee: 'Interest', description: 'INTEREST PAID', kind: 'income', envelope: 'travel' });
      add({ account: 'brk', date: at(last), amount: 1240, payee: 'Dividend', description: 'DIVIDEND REINVEST' });
    } else {
      // A birthday gift bigger than the Gifts envelope: it shows up overspent.
      spend('card', month, 3, 10500, 'Paper & Bloom', 'gifts', 'gift');
    }
    for (const t of transactions.slice(cardStart)) {
      if (t.account_id === 'card' && t.kind === 'spending') cardBalance -= t.amount;
    }
  }

  // A few recent ones nobody has filed yet, for To review.
  const recent = (back: number) => localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
  const unfiled: [number, string, number, string][] = [
    [0, 'card', -3499, 'AMAZON MKTP US*2K4'],
    [1, 'card', -5630, 'HOME DEPOT #0412'],
    [2, 'chk', -1200, 'CITY PARKING METER'],
  ];
  for (const [back, account, amount, description] of unfiled) {
    const date = recent(back);
    if (date >= `${current}-01`) add({ account, date, amount, description });
  }

  const budgetMonths: Row[] = [];
  const assign = (month: Month, amounts: Record<string, number>) => {
    for (const [envelope_id, assigned] of Object.entries(amounts)) {
      budgetMonths.push({ household_id: H, month, envelope_id, assigned });
    }
  };
  assign(previous, {
    rent: 145000,
    util: 18000,
    phone: 4500,
    subs: 3000,
    ins: 12800,
    ef: 30000,
    travel: 15000,
    car: 5000,
    invest: 25000,
    fts: 90000,
    gifts: 5000,
  });
  assign(current, {
    rent: 145000,
    util: 18000,
    phone: 4500,
    subs: 3000,
    ins: 12800,
    invest: 25000,
    fts: 60000,
    // Savings envelopes get their money when it moves to their accounts on
    // the 2nd, so each one always matches its account.
    ...(happened(day(current, 2)) ? { ef: 30000, travel: 15000 } : {}),
  });

  const rules = [
    ['PAYROLL', 'in', null, 'income', null, null],
    ['NETFLIX', 'out', null, 'spending', 'subs', 'streaming'],
    ['SPOTIFY', 'out', null, 'spending', 'subs', 'streaming'],
    ["TRADER JOE", 'out', null, 'spending', 'fts', 'groceries'],
    ['SHELL', 'out', null, 'spending', 'fts', 'gas'],
    ['INTEREST', 'in', 'sav', 'income', 'ef', null],
  ].map(([match_text, direction, account_id, kind, envelope_id, category_id], i) => ({
    id: `r${i + 1}`,
    household_id: H,
    match_text,
    direction,
    account_id,
    kind,
    envelope_id,
    category_id,
    sort_order: i + 1,
    created_at: `${previous}-01T00:00:00Z`,
  }));

  return {
    households: [{ id: H, name: 'Demo household', budget_start: previous }],
    household_members: [
      { household_id: H, user_id: 'demo-user' },
      { household_id: H, user_id: 'demo-partner' },
    ],
    accounts,
    envelope_groups: groups,
    envelopes,
    categories,
    payees,
    transactions,
    budget_months: budgetMonths,
    rules,
    sync_runs: [],
  };
}
