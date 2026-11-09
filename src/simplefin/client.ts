/**
 * Minimal SimpleFIN Bridge client. It uses only fetch/atob/btoa so the same
 * code runs in React Native, Node (tests) and Deno (Supabase Edge Functions).
 * Deno needs explicit .ts extensions on relative imports, hence the style.
 *
 * Flow:
 *  1. The user pastes a setup token from the bridge (base64 of a claim URL).
 *  2. claimAccessUrl() POSTs to the claim URL once and gets back a long-lived
 *     access URL with credentials in it. The setup token can't be reused.
 *  3. fetchAccounts() GETs {accessUrl}/accounts with HTTP Basic auth.
 */
import type { SimpleFinAccountSet } from './types.ts';

export class SimpleFinError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_TOKEN'
      | 'FORBIDDEN'
      | 'PAYMENT_REQUIRED'
      | 'HTTP_ERROR'
      | 'BAD_RESPONSE',
  ) {
    super(message);
    this.name = 'SimpleFinError';
  }
}

type Fetch = typeof fetch;

export function decodeSetupToken(setupToken: string): string {
  let decoded: string;
  try {
    decoded = atob(setupToken.trim());
  } catch {
    throw new SimpleFinError('Setup token is not valid base64', 'INVALID_TOKEN');
  }
  if (!/^https?:\/\//.test(decoded)) {
    throw new SimpleFinError('Setup token does not contain a claim URL', 'INVALID_TOKEN');
  }
  return decoded;
}

/** Exchanges a setup token for an access URL. Store the result as a secret. */
export async function claimAccessUrl(setupToken: string, fetchImpl: Fetch = fetch): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken);
  const response = await fetchImpl(claimUrl, { method: 'POST' });
  if (response.status === 403) {
    throw new SimpleFinError('Setup token was already claimed or is invalid', 'FORBIDDEN');
  }
  if (!response.ok) {
    throw new SimpleFinError(`Claim failed with HTTP ${response.status}`, 'HTTP_ERROR');
  }
  const accessUrl = (await response.text()).trim();
  parseAccessUrl(accessUrl);
  return accessUrl;
}

/** Splits "https://user:pass@host/path" into a base URL and Basic auth header. */
export function parseAccessUrl(accessUrl: string): { baseUrl: string; authorization: string } {
  let url: URL;
  try {
    url = new URL(accessUrl);
  } catch {
    throw new SimpleFinError('Access URL is malformed', 'INVALID_TOKEN');
  }
  if (!url.username || !url.password) {
    throw new SimpleFinError('Access URL has no credentials', 'INVALID_TOKEN');
  }
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = '';
  url.password = '';
  return {
    baseUrl: url.toString().replace(/\/$/, ''),
    authorization: `Basic ${btoa(`${username}:${password}`)}`,
  };
}

export type FetchAccountsOptions = {
  startDate?: Date;
  endDate?: Date;
  /** Include pending transactions. */
  pending?: boolean;
  /** Skip transactions entirely; cheap way to list accounts while linking. */
  balancesOnly?: boolean;
  accountIds?: string[];
};

export async function fetchAccounts(
  accessUrl: string,
  options: FetchAccountsOptions = {},
  fetchImpl: Fetch = fetch,
): Promise<SimpleFinAccountSet> {
  const { baseUrl, authorization } = parseAccessUrl(accessUrl);

  const params = new URLSearchParams({ version: '2' });
  if (options.balancesOnly) {
    params.append('balances-only', '1');
  } else {
    if (options.startDate) params.append('start-date', String(toUnixSeconds(options.startDate)));
    if (options.endDate) params.append('end-date', String(toUnixSeconds(options.endDate)));
    if (options.pending) params.append('pending', '1');
  }
  for (const id of options.accountIds ?? []) {
    params.append('account', id);
  }

  const response = await fetchImpl(`${baseUrl}/accounts?${params}`, {
    headers: { Authorization: authorization },
  });
  if (response.status === 403) {
    throw new SimpleFinError('Access was revoked; reconnect SimpleFIN', 'FORBIDDEN');
  }
  if (response.status === 402) {
    throw new SimpleFinError('SimpleFIN Bridge subscription needs payment', 'PAYMENT_REQUIRED');
  }
  if (!response.ok) {
    throw new SimpleFinError(`SimpleFIN returned HTTP ${response.status}`, 'HTTP_ERROR');
  }

  const body = (await response.json()) as Partial<SimpleFinAccountSet>;
  if (!Array.isArray(body.accounts)) {
    throw new SimpleFinError('SimpleFIN response has no accounts list', 'BAD_RESPONSE');
  }
  return {
    errlist: body.errlist ?? [],
    errors: body.errors ?? [],
    connections: body.connections ?? [],
    accounts: body.accounts,
  };
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
