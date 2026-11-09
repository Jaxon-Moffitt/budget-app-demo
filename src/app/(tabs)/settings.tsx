import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BankSync } from '@/components/bank-sync';
import { Button } from '@/components/form';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SEED_KEYS, SEED_LABELS } from '@/constants/custom-theme';
import { Spacing, type ColorSchemePreference } from '@/constants/theme';
import { unreadablePairs } from '@/domain/colors';
import { formatMonth } from '@/domain/month';
import { useTheme } from '@/hooks/use-theme';
import { useHousehold } from '@/lib/queries';
import { useAppLock } from '@/providers/app-lock-provider';
import { useAppearance } from '@/providers/appearance-provider';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const lock = useAppLock();
  const appearance = useAppearance();
  const household = useHousehold(true);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Settings</ThemedText>

          <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Signed in as
            </ThemedText>
            <ThemedText>{session?.user.email}</ThemedText>
          </View>

          <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Appearance
            </ThemedText>
            <Segmented<ColorSchemePreference>
              options={[
                { value: 'system', label: 'Phone' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'custom', label: 'Custom' },
              ]}
              value={appearance.preference}
              onChange={choice => void appearance.setPreference(choice)}
            />
            {appearance.preference === 'custom' && <CustomColors />}
          </View>

          {lock.available && (
            <View style={[styles.section, styles.row, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.rowLabel}>Unlock with {lock.label}</ThemedText>
              <Switch
                value={lock.enabled}
                onValueChange={lock.setEnabled}
                accessibilityLabel={`Unlock with ${lock.label}`}
              />
            </View>
          )}

          {household.data && (
            <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Household
              </ThemedText>
              <ThemedText>{household.data.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {household.data.memberCount === 1
                  ? 'Just you so far'
                  : `${household.data.memberCount} members`}
              </ThemedText>
              {household.data.memberCount < 2 && (
                <Button variant="plain" title="Add partner" onPress={() => router.push('/add-partner')} />
              )}
            </View>
          )}

          <BankSync />

          {household.data && (
            <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Budget
              </ThemedText>
              <Button variant="plain" title="Manage envelopes" onPress={() => router.push('/envelopes')} />
              <Button variant="plain" title="Manage categories" onPress={() => router.push('/categories')} />
              <Button variant="plain" title="Rules" onPress={() => router.push('/rules')} />
              {household.data.budgetStart && (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Budget starts in {formatMonth(household.data.budgetStart)}
                  </ThemedText>
                  <Button variant="plain" title="Start fresh from a new month" onPress={() => router.push('/budget-start')} />
                </>
              )}
            </View>
          )}

          <Button variant="plain" title="Sign out" onPress={signOut} />

          <AppVersion />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Which code the phone is running, for checking that an update arrived:
 * the channel it listens on, its native fingerprint, and the update.
 */
function AppVersion() {
  if (!Updates.isEnabled) {
    return (
      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
        {Platform.OS === 'web' ? 'Web version · always up to date' : 'Development build · updates off'}
      </ThemedText>
    );
  }
  const runtime = Updates.runtimeVersion?.slice(0, 7) ?? 'unknown';
  const update = Updates.isEmbeddedLaunch
    ? 'built-in code'
    : `update ${Updates.updateId?.slice(0, 8) ?? '?'}${
        Updates.createdAt ? ` from ${Updates.createdAt.toLocaleDateString()}` : ''
      }`;
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.version} selectable>
      Channel {Updates.channel ?? 'none'} · runtime {runtime} · {update}
    </ThemedText>
  );
}

/** The four custom-theme colors; each row opens the color picker. */
function CustomColors() {
  const theme = useTheme();
  const appearance = useAppearance();
  const seeds = appearance.seeds;
  if (!seeds) return null;
  const hardToRead = appearance.palette ? unreadablePairs(appearance.palette).length > 0 : false;

  return (
    <View style={styles.custom}>
      {SEED_KEYS.map((key, i) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`${SEED_LABELS[key].title}: ${seeds[key]}`}
          accessibilityHint="Opens the color picker"
          onPress={() => router.push({ pathname: '/theme-color', params: { key } })}
          style={({ pressed }) => [
            styles.colorRow,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
            pressed && styles.dim,
          ]}>
          <View style={[styles.swatch, { backgroundColor: seeds[key], borderColor: theme.border }]} />
          <View style={styles.rowLabel}>
            <ThemedText>{SEED_LABELS[key].title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {SEED_LABELS[key].description}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hex}>
            {seeds[key]}
          </ThemedText>
        </Pressable>
      ))}
      {hardToRead && (
        <ThemedText type="small" themeColor="warning">
          Some text may be hard to read with these colors. Try a background and cards that are both light or both dark.
        </ThemedText>
      )}
      <View style={styles.resetRow}>
        <View style={styles.rowLabel}>
          <Button variant="plain" title="Start from Light" onPress={() => void appearance.resetSeeds('light')} />
        </View>
        <View style={styles.rowLabel}>
          <Button variant="plain" title="Start from Dark" onPress={() => void appearance.resetSeeds('dark')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  section: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { flex: 1 },
  custom: { marginTop: Spacing.two },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + Spacing.one },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  hex: { fontVariant: ['tabular-nums'] },
  resetRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  dim: { opacity: 0.5 },
  version: { textAlign: 'center', marginTop: Spacing.two },
});
