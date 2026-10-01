import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Feather } from '@expo/vector-icons';
import { ApiError, getAppVersion, getHealth, type ApiResponse, type HealthResponse } from '@/lib/api';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';

export default function MoreScreen() {
  const colors = useColors();
  const router = useRouter();
  const { workspace } = useAuth();
  const [health, setHealth] = useState<ApiResponse<HealthResponse> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await getHealth());
    } catch (caught) {
      setHealth(null);
      setError(caught instanceof ApiError
        ? caught
        : new ApiError({
            kind: 'http',
            code: 'UNEXPECTED_ERROR',
            message: 'The health check could not be completed.',
          }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  return (
    <Screen title="More">
      <View style={[styles.card, styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          testID="more-account"
          onPress={() => router.push('/account' as never)}
          style={styles.row}
        >
          <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>Account</Text>
          <Feather accessible={false} name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <Text accessibilityRole="header" allowFontScaling style={[styles.sectionTitle, { color: colors.foreground }]}>
        Diagnostics
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <DiagnosticRow label="App version" value={getAppVersion()} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DiagnosticRow label="Workspace" value={workspace ? workspace.id.slice(0, 8) : 'Unknown'} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.row}>
          <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>API status</Text>
          <View style={styles.statusValue}>
            {loading ? (
              <>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text accessibilityLiveRegion="polite" allowFontScaling style={[styles.value, { color: colors.mutedForeground }]}>Checking…</Text>
              </>
            ) : (
              <View style={styles.statusValue}>
                <Feather
                  accessible={false}
                  name={error ? 'alert-circle' : 'check-circle'}
                  size={18}
                  color={error ? colors.destructive : colors.primary}
                />
                <Text
                  accessibilityLiveRegion="polite"
                  allowFontScaling
                  style={[styles.value, { color: error ? colors.destructive : colors.primary }]}
                >
                  {error ? 'Unavailable' : health?.data.status === 'ok' ? 'ok' : 'Unavailable'}
                </Text>
              </View>
            )}
          </View>
        </View>
        {error ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.errorBlock}>
              <Text allowFontScaling style={[styles.errorText, { color: colors.destructive }]}>
                {error.message}
              </Text>
              {error.correlationId ? (
                <Text allowFontScaling style={[styles.meta, { color: colors.mutedForeground }]}>
                  Support ID: {error.correlationId}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}
        {!error && health?.correlationId ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <DiagnosticRow label="Correlation ID" value={health.correlationId} />
          </>
        ) : null}
      </View>
      {error ? (
        <PrimaryButton
          label="Try again"
          onPress={() => void loadHealth()}
          style={styles.retryButton}
        />
      ) : null}
    </Screen>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <Text allowFontScaling style={[styles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  accountCard: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right',
  },
  statusValue: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  errorBlock: {
    padding: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
  },
  meta: {
    fontSize: 14,
  },
  retryButton: {
    marginTop: 16,
  },
});