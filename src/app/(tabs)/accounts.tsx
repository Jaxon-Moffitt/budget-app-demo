import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { accountDisplayName, groupAccounts, type AccountTypeGroup } from '@/domain/accounts';
import { formatCents } from '@/domain/money';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccounts, useBankRefresh, type Account } from '@/lib/queries';

export default function AccountsScreen() {
  const theme = useTheme();
  const query = useAccounts();
  const bank = useBankRefresh();

  // One list section per type; the first type in each budget group also
  // carries that group's heading.
  const sections = useMemo(
    () =>
      groupAccounts(query.data ?? []).flatMap((group, groupIndex) =>
        group.types.map((typeGroup, typeIndex) => ({
          key: `${group.title}:${typeGroup.type}`,
          heading: typeIndex === 0 ? { ...group, first: groupIndex === 0 } : null,
          typeGroup,
          data: typeGroup.accounts,
        })),
      ),
    [query.data],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <SectionList
          sections={sections}
          keyExtractor={account => account.id}
          contentContainerStyle={styles.content}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={bank.refreshing} onRefresh={bank.refresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <ThemedText type="subtitle" style={styles.title}>
                  Accounts
                </ThemedText>
                <Button variant="plain" title="Add account" onPress={() => router.push('/account/new')} />
              </View>
              {bank.error && <ThemedText themeColor="danger">{bank.error}</ThemedText>}
              {query.error && (
                <ThemedText themeColor="danger">Couldn’t load accounts: {query.error.message}</ThemedText>
              )}
            </View>
          }
          ListEmptyComponent={
            query.isPending ? (
              <ActivityIndicator />
            ) : (
              <ThemedText themeColor="textSecondary">
                No accounts yet. Link your bank in Settings, or add one by hand.
              </ThemedText>
            )
          }
          renderSectionHeader={({ section }) => (
            <>
              {section.heading && (
                <View
                  accessibilityRole="header"
                  style={[
                    styles.groupHeading,
                    !section.heading.first && [styles.groupDivider, { borderColor: theme.border }],
                  ]}>
                  <ThemedText style={styles.groupTitle}>{section.heading.title}</ThemedText>
                  <ThemedText style={[styles.groupTitle, styles.amount]}>
                    {formatCents(section.heading.total)}
                  </ThemedText>
                </View>
              )}
              <TypeHeader group={section.typeGroup} />
            </>
          )}
          renderItem={({ item, index, section }) => (
            <AccountRow
              account={item}
              first={index === 0}
              last={index === section.data.length - 1}
              background={theme.backgroundElement}
              border={theme.border}
            />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function TypeHeader({ group }: { group: AccountTypeGroup<Account> }) {
  return (
    <View accessibilityRole="header" style={styles.typeHeader}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.typeLabel}>
        {group.label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.amount}>
        {formatCents(group.total)}
      </ThemedText>
    </View>
  );
}

function AccountRow({
  account,
  first,
  last,
  background,
  border,
}: {
  account: Account;
  first: boolean;
  last: boolean;
  background: string;
  border: string;
}) {
  const synced = account.last_synced_at
    ? `Synced ${new Date(account.last_synced_at).toLocaleString([], {
        dateStyle: 'short',
        timeStyle: 'short',
      })}`
    : null;
  const displayName = accountDisplayName(account);
  // The type is the section label now, so it isn't repeated here.
  const details = [
    account.sfin_account_id === null ? 'Manual' : null,
    // With a nickname, the bank's name is the useful second line.
    displayName === account.name ? account.sfin_org_name : account.name,
    synced,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Edit nickname, type and budget"
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: background },
        first && styles.firstRow,
        last && styles.lastRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: border },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1}>{displayName}</ThemedText>
        {details ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {details}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText style={styles.amount}>
        {formatCents(account.balance)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  header: { gap: Spacing.two, marginBottom: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  groupHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
  },
  groupDivider: {
    marginTop: Spacing.five,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  groupTitle: { fontSize: 20, lineHeight: 28, fontWeight: 700 },
  typeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  typeLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  firstRow: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  lastRow: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  rowText: { flex: 1 },
  pressed: { opacity: 0.6 },
  amount: { fontVariant: ['tabular-nums'] },
});
