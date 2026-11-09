import { ruleProblem, ruleRow, suggestMatchText, type RuleDraft } from '../rules';

const draft = (overrides: Partial<RuleDraft>): RuleDraft => ({
  matchText: 'PAYROLL',
  direction: null,
  accountId: null,
  kind: 'income',
  envelopeId: null,
  categoryId: null,
  ...overrides,
});

describe('suggestMatchText', () => {
  it('keeps the name and drops numbers that change', () => {
    expect(suggestMatchText('PAYROLL ACME CORP 8812')).toBe('PAYROLL ACME CORP');
    expect(suggestMatchText('KROGER #123 SPRINGFIELD')).toBe('KROGER');
    expect(suggestMatchText('  Netflix.com  ')).toBe('Netflix.com');
    expect(suggestMatchText('SQ *BLUE BOTTLE COFFEE')).toBe('BLUE BOTTLE COFFEE');
    expect(suggestMatchText('BROKERAGE BUY INVESTMENT EXCHANGE')).toBe('BROKERAGE BUY INVESTMENT');
  });

  it('falls back to the start of the text when every word has a number', () => {
    expect(suggestMatchText('ACH 0042 99812')).toBe('ACH');
    expect(suggestMatchText('12345 67890')).toBe('12345 67890');
  });
});

describe('ruleProblem', () => {
  it('needs text, and an envelope for spending and investments', () => {
    expect(ruleProblem(draft({ matchText: '  ' }))).toMatch(/text/);
    expect(ruleProblem(draft({ matchText: 'x'.repeat(101) }))).toMatch(/100/);
    expect(ruleProblem(draft({ kind: 'spending' }))).toMatch(/envelope/);
    expect(ruleProblem(draft({ kind: 'investment' }))).toMatch(/investments/);
    expect(ruleProblem(draft({ kind: 'spending', envelopeId: 'e1' }))).toBeNull();
    expect(ruleProblem(draft({}))).toBeNull();
  });
});

describe('ruleRow', () => {
  it('drops an envelope the kind does not use, and categories on transfers', () => {
    // Income may keep an envelope.
    expect(ruleRow(draft({ matchText: ' PAYROLL ', envelopeId: 'e1', categoryId: 'c1' }))).toMatchObject({
      match_text: 'PAYROLL',
      envelope_id: 'e1',
      category_id: 'c1',
    });
    expect(ruleRow(draft({ kind: 'transfer', categoryId: 'c1' }))).toMatchObject({ category_id: null });
    expect(ruleRow(draft({ kind: 'spending', envelopeId: 'e1' }))).toMatchObject({ envelope_id: 'e1' });
    expect(ruleRow(draft({ kind: 'transfer', envelopeId: 'e1' }))).toMatchObject({ envelope_id: null });
  });
});
