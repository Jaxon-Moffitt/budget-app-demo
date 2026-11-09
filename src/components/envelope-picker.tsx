import { ActivityIndicator, View } from 'react-native';

import { ChoiceGroup, ChoiceRow, Chooser } from '@/components/choice';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { visibleGroups } from '@/domain/categories';
import { useEnvelopes } from '@/lib/queries';

/**
 * Every envelope, grouped as on the Budget tab. One tap picks. Hidden
 * envelopes are left out unless already chosen.
 */
export function EnvelopePicker({
  value,
  onChange,
  exclude,
  detail,
}: {
  value: string | null;
  onChange(envelopeId: string): void;
  /** An envelope not to offer, such as the one being deleted. */
  exclude?: string;
  /** Extra text per envelope, such as its balance. */
  detail?(envelopeId: string): string | undefined;
}) {
  const envelopes = useEnvelopes();

  if (envelopes.isPending) return <ActivityIndicator />;
  if (envelopes.error) {
    return <ThemedText themeColor="danger">Couldn’t load envelopes: {envelopes.error.message}</ThemedText>;
  }

  const groups = visibleGroups(
    envelopes.data.map(g => ({ ...g, envelopes: g.envelopes.filter(e => e.id !== exclude) })),
    value,
  );
  return (
    <View style={{ gap: Spacing.one }}>
      {groups.map(group => (
        <ChoiceGroup key={group.id} label={group.name}>
          {group.envelopes.map((e, i) => (
            <ChoiceRow
              key={e.id}
              label={e.name}
              detail={detail?.(e.id)}
              selected={e.id === value}
              first={i === 0}
              onPress={() => onChange(e.id)}
            />
          ))}
        </ChoiceGroup>
      ))}
    </View>
  );
}

/**
 * EnvelopePicker behind a one-line button, for forms with several fields.
 * With noneLabel, choosing no envelope is allowed and offered first.
 */
export function EnvelopeChooser({
  value,
  onChange,
  label = 'Envelope',
  noneLabel,
}: {
  value: string | null;
  onChange(envelopeId: string | null): void;
  label?: string;
  noneLabel?: string;
}) {
  const envelopes = useEnvelopes();
  const name = envelopes.data?.flatMap(g => g.envelopes).find(e => e.id === value)?.name ?? null;
  return (
    <Chooser label={label} valueLabel={name ?? noneLabel ?? null} placeholder="Choose an envelope">
      {close => (
        <>
          {noneLabel && (
            <ChoiceGroup>
              <ChoiceRow
                label={noneLabel}
                selected={value === null}
                first
                onPress={() => {
                  onChange(null);
                  close();
                }}
              />
            </ChoiceGroup>
          )}
          <EnvelopePicker
            value={value}
            onChange={id => {
              onChange(id);
              close();
            }}
          />
        </>
      )}
    </Chooser>
  );
}
