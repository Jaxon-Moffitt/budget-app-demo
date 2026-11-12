import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { CategoryChooser } from '@/components/category-picker';
import { DateField } from '@/components/date-field';
import { EnvelopeChooser } from '@/components/envelope-picker';
import { Button, TextField } from '@/components/form';
import { KeyboardView } from '@/components/keyboard-view';
import { PayeeField } from '@/components/payee-field';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { accountDisplayName } from '@/domain/accounts';
import {
  kindAllowsEnvelope,
  kindUsesEnvelope,
  signedAmount,
  suggestedKind,
  type Direction,
  type TransactionKind,
} from '@/domain/transactions';
import { Spacing } from '@/constants/theme';
import { lastChoiceForPayee, useAccounts, type TransactionFields } from '@/lib/queries';

export type TransactionFormValues = {
  accountId: string | null;
  date: string;
  amountText: string;
  direction: Direction;
  payeeName: string;
  kind: TransactionKind | null;
  envelopeId: string | null;
  categoryId: string | null;
  notes: string;
};

export const DIRECTIONS = [
  { value: 'out', label: 'Money out' },
  { value: 'in', label: 'Money in' },
] as const;

const KINDS = [
  { value: 'spending', label: 'Spend' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'investment', label: 'Invest' },
] as const;

const KIND_NOTES: Record<TransactionKind, string> = {
  spending: 'Comes out of an envelope. A refund goes back into it.',
  income: 'Goes to Ready to assign, or straight into an envelope if you pick one (like interest on its savings account).',
  transfer:
    'Money moving between your own accounts, like savings or a card payment. The budget ignores it. Use Mark as transfer to link the other side.',
  investment: 'Money sent to an investment account. It comes out of an envelope but counts as invested, not spent.',
};

/**
 * The type is fixed by something else (a linked transfer, a split): the
 * note explains why, and the flags say which choices are still open.
 */
export type KindLock = { note: string; envelope: boolean; category: boolean };

/**
 * Shared by Add and Edit. With `locked`, the bank's facts (account, date,
 * amount) are shown but can't be changed; payee, type, envelope, category
 * and notes can.
 */
export function TransactionForm({
  title,
  subtitle,
  header,
  initial,
  locked = false,
  kindLock,
  actions,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onCancel,
  onMakeRule,
  footer,
}: {
  title: string;
  subtitle?: string;
  header?: ReactNode;
  initial: TransactionFormValues;
  locked?: boolean;
  kindLock?: KindLock;
  actions?: ReactNode;
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  onSubmit(fields: TransactionFields): void;
  onCancel(): void;
  /** Offers "Make a rule" with what's chosen on screen now. */
  onMakeRule?(values: TransactionFormValues): void;
  footer?: ReactNode;
}) {
  const accounts = useAccounts();
  const [values, setValues] = useState<TransactionFormValues>(() => ({
    ...initial,
    // A row nobody has reviewed starts on the likely type.
    kind: initial.kind ?? suggestedKind(initial.direction === 'in' ? 1 : -1),
  }));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) =>
    setValues(v => ({ ...v, [key]: value }));

  const account = accounts.data?.find(a => a.id === values.accountId);
  // Off-budget accounts (investments) aren't budgeted, so they have no type.
  const onBudget = account?.on_budget ?? true;
  const kind = kindLock ? initial.kind : values.kind;
  const showEnvelope = onBudget && (kindLock ? kindLock.envelope : kindAllowsEnvelope(kind));
  // Income may skip the envelope; spending and investments can't.
  const needsEnvelope = showEnvelope && kindUsesEnvelope(kind);
  const showCategory = onBudget && (kindLock ? kindLock.category : kind !== 'transfer');

  function submit() {
    setError(null);
    if (!values.accountId) {
      setError('Choose an account.');
      return;
    }
    let amount: number;
    try {
      amount = signedAmount(values.amountText, values.direction);
    } catch {
      setError('Enter the amount as a number, like 12.34.');
      return;
    }
    const envelopeId = showEnvelope ? values.envelopeId : kindLock ? initial.envelopeId : null;
    if (needsEnvelope && !envelopeId) {
      setError(kind === 'investment' ? 'Choose the envelope this investment comes from.' : 'Choose an envelope.');
      return;
    }
    onSubmit({
      accountId: values.accountId,
      date: values.date,
      amount,
      payeeName: values.payeeName,
      kind: onBudget ? kind : null,
      envelopeId: onBudget ? envelopeId : null,
      categoryId: showCategory ? values.categoryId : kindLock ? initial.categoryId : null,
      notes: values.notes.trim() || null,
    });
  }

  return (
    <KeyboardView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}
        <ThemedText type="subtitle">{title}</ThemedText>
        {subtitle && <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>}

        <PayeeField
          value={values.payeeName}
          onChange={name => set('payeeName', name)}
          onPick={payee => {
            // Fill in how this payee is usually filed, but never replace a choice.
            if (!onBudget || kindLock || values.envelopeId || values.categoryId) return;
            lastChoiceForPayee(payee.id).then(
              choice =>
                choice &&
                setValues(v =>
                  v.envelopeId || v.categoryId
                    ? v
                    : {
                        ...v,
                        kind: choice.kind,
                        envelopeId: choice.envelope_id,
                        categoryId: choice.category_id,
                      },
                ),
              () => {},
            );
          }}
        />

        <TextField
          label="Amount"
          placeholder="0.00"
          value={values.amountText}
          onChangeText={text => set('amountText', text)}
          keyboardType="decimal-pad"
          editable={!locked}
        />
        <Segmented
          options={DIRECTIONS}
          value={values.direction}
          onChange={d => set('direction', d)}
          disabled={locked}
        />

        <DateField label="Date" value={values.date} onChange={d => set('date', d)} disabled={locked} />

        <ThemedText type="smallBold" style={styles.label}>
          Account
        </ThemedText>
        {locked ? (
          <ThemedText themeColor="textSecondary">{account ? accountDisplayName(account) : '…'}</ThemedText>
        ) : (
          <AccountPicker value={values.accountId} onChange={id => set('accountId', id)} />
        )}

        <ThemedText type="smallBold" style={styles.label}>
          Type
        </ThemedText>
        {!onBudget ? (
          <ThemedText themeColor="textSecondary">
            Off-budget accounts, like investments, are tracked but not budgeted.
          </ThemedText>
        ) : kindLock ? (
          <ThemedText themeColor="textSecondary">{kindLock.note}</ThemedText>
        ) : (
          <>
            <Segmented<TransactionKind>
              options={KINDS}
              value={values.kind ?? 'spending'}
              onChange={k => set('kind', k)}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {KIND_NOTES[values.kind ?? 'spending']}
            </ThemedText>
          </>
        )}

        {showEnvelope && (
          <EnvelopeChooser
            label={kind === 'investment' ? 'Comes from envelope' : kind === 'income' ? 'Goes to' : 'Envelope'}
            noneLabel={kind === 'income' ? 'Ready to assign' : undefined}
            value={values.envelopeId}
            onChange={id => set('envelopeId', id)}
          />
        )}
        {showCategory && (
          <CategoryChooser
            value={values.categoryId}
            newEnvelopeId={values.kind === 'spending' ? values.envelopeId : null}
            onChange={c =>
              setValues(v => ({
                ...v,
                categoryId: c?.id ?? null,
                // A category's usual envelope fills in an empty one.
                envelopeId: v.envelopeId ?? (needsEnvelope ? (c?.default_envelope_id ?? null) : null),
              }))
            }
          />
        )}

        {actions}

        {onMakeRule && onBudget && !kindLock && (
          <Button variant="plain" title="Make a rule for transactions like this" onPress={() => onMakeRule(values)} />
        )}

        <TextField
          label="Notes"
          placeholder="Optional"
          value={values.notes}
          onChangeText={text => set('notes', text)}
          multiline
          style={styles.notes}
        />

        {(error ?? serverError) && (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {error ?? serverError}
          </ThemedText>
        )}

        <Button title={submitLabel} loading={submitting} onPress={submit} />
        <Button variant="plain" title="Cancel" onPress={onCancel} />
        {footer}
      </ScrollView>
    </KeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  label: { marginTop: Spacing.two },
  notes: { minHeight: 72, textAlignVertical: 'top' },
});
