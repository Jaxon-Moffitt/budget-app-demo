/** Shapes returned by the SimpleFIN protocol (v2): https://www.simplefin.org/protocol.html */

export type SimpleFinTransaction = {
  id: string;
  /** Unix seconds; 0 while pending. */
  posted: number;
  /** Decimal string, negative for money leaving the account. */
  amount: string;
  description: string;
  /** Not in the spec, but the Bridge sends it for many banks. */
  payee?: string;
  memo?: string;
  /** Unix seconds when the purchase happened, if the bank reports it. */
  transacted_at?: number;
  pending?: boolean;
};

export type SimpleFinAccount = {
  id: string;
  name: string;
  /** Which bank login the account belongs to (v2). */
  conn_id?: string;
  currency: string;
  balance: string;
  'available-balance'?: string;
  /** Unix seconds. */
  'balance-date': number;
  /** Deprecated in v2 in favor of conn_id + connections. */
  org?: { name?: string; domain?: string; 'sfin-url'?: string; id?: string };
  transactions?: SimpleFinTransaction[];
};

export type SimpleFinConnection = {
  conn_id: string;
  name: string;
  org_id?: string;
  org_url?: string;
  sfin_url?: string;
};

/**
 * Codes are "prefix.subcode"; unknown subcodes should be treated as the bare
 * prefix. gen. = general, con. = a bank login (con.auth: needs re-auth at the
 * bridge), act. = one account.
 */
export type SimpleFinErrorEntry = {
  code: string;
  msg: string;
  conn_id?: string;
  account_id?: string;
};

export type SimpleFinAccountSet = {
  /** Structured errors; the Bridge asks apps to show these to users. */
  errlist: SimpleFinErrorEntry[];
  /** Deprecated string form. Quota warnings may still arrive here. */
  errors: string[];
  connections: SimpleFinConnection[];
  accounts: SimpleFinAccount[];
};
