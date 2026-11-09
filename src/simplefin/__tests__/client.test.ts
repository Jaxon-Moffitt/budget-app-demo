import { claimAccessUrl, decodeSetupToken, fetchAccounts, parseAccessUrl } from '../client';

const ACCESS_URL = 'https://user:p%40ss@bridge.example.com/simplefin';

function mockFetch(response: { status?: number; text?: string; json?: unknown }) {
  return jest.fn(async () => ({
    ok: (response.status ?? 200) < 400,
    status: response.status ?? 200,
    text: async () => response.text ?? '',
    json: async () => response.json,
  })) as unknown as jest.Mock & typeof fetch;
}

describe('decodeSetupToken', () => {
  it('decodes a base64 claim URL', () => {
    const token = btoa('https://bridge.example.com/simplefin/claim/abc');
    expect(decodeSetupToken(token)).toBe('https://bridge.example.com/simplefin/claim/abc');
  });

  it('rejects tokens that are not claim URLs', () => {
    expect(() => decodeSetupToken(btoa('hello'))).toThrow('claim URL');
  });
});

describe('claimAccessUrl', () => {
  it('posts to the claim URL and returns the access URL', async () => {
    const fetchImpl = mockFetch({ text: `${ACCESS_URL}\n` });
    const token = btoa('https://bridge.example.com/claim/abc');
    await expect(claimAccessUrl(token, fetchImpl)).resolves.toBe(ACCESS_URL);
    expect(fetchImpl).toHaveBeenCalledWith('https://bridge.example.com/claim/abc', { method: 'POST' });
  });

  it('reports an already-claimed token', async () => {
    const token = btoa('https://bridge.example.com/claim/abc');
    await expect(claimAccessUrl(token, mockFetch({ status: 403 }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('parseAccessUrl', () => {
  it('moves credentials into a Basic auth header', () => {
    expect(parseAccessUrl(ACCESS_URL)).toEqual({
      baseUrl: 'https://bridge.example.com/simplefin',
      authorization: `Basic ${btoa('user:p@ss')}`,
    });
  });
});

describe('fetchAccounts', () => {
  it('builds the query and returns accounts', async () => {
    const fetchImpl = mockFetch({ json: { errors: [], accounts: [{ id: 'a1' }] } });
    const result = await fetchAccounts(
      ACCESS_URL,
      { startDate: new Date('2026-09-01T00:00:00Z'), pending: true, accountIds: ['a1', 'a2'] },
      fetchImpl,
    );
    expect(result.accounts).toEqual([{ id: 'a1' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://bridge.example.com/simplefin/accounts?version=2&start-date=1788220800&pending=1&account=a1&account=a2',
      { headers: { Authorization: `Basic ${btoa('user:p@ss')}` } },
    );
  });

  it('fills in v2 lists the server left out', async () => {
    const result = await fetchAccounts(ACCESS_URL, {}, mockFetch({ json: { accounts: [] } }));
    expect(result).toEqual({ errlist: [], errors: [], connections: [], accounts: [] });
  });

  it('reports an unpaid Bridge subscription', async () => {
    await expect(fetchAccounts(ACCESS_URL, {}, mockFetch({ status: 402 }))).rejects.toMatchObject({
      code: 'PAYMENT_REQUIRED',
    });
  });

  it('reports revoked access', async () => {
    await expect(fetchAccounts(ACCESS_URL, {}, mockFetch({ status: 403 }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
