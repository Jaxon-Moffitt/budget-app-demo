/**
 * Rules file new bank transactions automatically. The database applies
 * them (on insert, and through apply_rules()); this module holds what the
 * screens need. Pure, so it's tested.
 */
import { kindAllowsEnvelope, kindUsesEnvelope, type TransactionKind } from './transactions.ts';

export type RuleDirection = 'in' | 'out';

export type RuleDraft = {
  matchText: string;
  direction: RuleDirection | null;
  accountId: string | null;
  kind: TransactionKind;
  envelopeId: string | null;
  categoryId: string | null;
};

/**
 * A starting point for the text to match, from a bank description: the
 * first few words, without card numbers, store numbers or dates, which
 * change from one transaction to the next.
 * "PAYROLL ACME CORP 8812" → "PAYROLL ACME CORP"; "KROGER #123 SPRINGFIELD" → "KROGER".
 */
export function suggestMatchText(description: string): string {
  // Card processors put their own tag in front: "SQ *BLUE BOTTLE", "TST* CAFE".
  const name = description.trim().replace(/^(SQ|TST|SP|PAYPAL|PP|IN)\s*\*\s*/i, '');
  const words = name.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (/[0-9#*]/.test(word)) {
      // Stop at the first number once there's a name: what follows is
      // usually a location or reference that varies.
      if (kept.length > 0) break;
      continue;
    }
    kept.push(word);
    if (kept.length === 3) break;
  }
  return kept.length > 0 ? kept.join(' ') : description.trim().slice(0, 30);
}

/** Why a rule can't be saved yet, or null. */
export function ruleProblem(rule: RuleDraft): string | null {
  const text = rule.matchText.trim();
  if (!text) return 'Enter the text to look for.';
  if (text.length > 100) return 'Keep the text under 100 characters.';
  if (kindUsesEnvelope(rule.kind) && !rule.envelopeId) {
    return rule.kind === 'investment' ? 'Choose the envelope investments come from.' : 'Choose an envelope.';
  }
  return null;
}

/** The fields to save: an envelope only for kinds that use one. */
export function ruleRow(rule: RuleDraft) {
  return {
    match_text: rule.matchText.trim(),
    direction: rule.direction,
    account_id: rule.accountId,
    kind: rule.kind,
    envelope_id: kindAllowsEnvelope(rule.kind) ? rule.envelopeId : null,
    category_id: rule.kind === 'transfer' ? null : rule.categoryId,
  };
}
