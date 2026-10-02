import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { removeMember } from '@/lib/mobileApi';
import { useOperationKeeper } from '@/lib/operation';
import { kindLabel, roleLabel } from '@/lib/roles';
import { SecondaryButton } from '@/components/SecondaryButton';
import { Feather } from '@expo/vector-icons';
import { ApiError, getAppVersion, getHealth, type ApiResponse, type HealthResponse } from '@/lib/api';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';

export default function MoreScreen() {
  const colors = useColors();
  const router = useRouter();
  const { userId } = useAuth();
  const { workspace, workspaceId, role, kind, can, afterLeaving } = useWorkspace();
  const leaveOp = useOperationKeeper();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const isHome = kind === 'HOME';
  const showPartner = isHome && can['members.manage'] === true;
  const showLeave = isHome && !!role && role !== 'ORGANIZER' && !!userId;

  const leave = async () => {
    if (!userId || leaving) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      try {
        await removeMember(userId, leaveOp.idFor(`leave|${workspaceId}`));
      } catch (e) {
        if ((e as { status?: number } | null)?.status !== 404) throw e;
        // Already removed/left: complete the same local cleanup and navigation.
      }
      leaveOp.done();
      await afterLeaving();
      router.replace('/switcher' as never);
    } catch {
      setLeaveError('Could not leave. Check your connection and try again.');
    } finally {
      setLeaving(false);
    }
  };
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
    <Screen title="More" workspaceHeader>
      <View style={[styles.card, styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <NavRow label="Workspaces" testID="more-workspaces" onPress={() => router.push('/switcher' as never)} />
        {showPartner ? (<><View style={[styles.divider, { backgroundColor: colors.border }]} /><NavRow label="Partner" testID="more-partner" onPress={() => router.push('/partner' as never)} /></>) : null}
        {showLeave ? (<><View style={[styles.divider, { backgroundColor: colors.border }]} /><NavRow label={`Leave ${workspace?.name ?? 'workspace'}`} testID="more-leave" onPress={() => setConfirmLeave(true)} /></>) : null}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <NavRow label="Account" testID="more-account" onPress={() => router.push('/account' as never)} />
      </View>
      {confirmLeave ? (
        <View style={[styles.card, styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, gap: 12 }]}>
          <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>
            You will lose access to {workspace?.name}. Work and payments you recorded stay in the records.
          </Text>
          <PrimaryButton label={leaving ? 'Leaving…' : `Leave ${workspace?.name ?? 'workspace'}`} testID="leave-confirm" disabled={leaving} onPress={() => void leave()} />
          <SecondaryButton label="Cancel" onPress={() => setConfirmLeave(false)} />
          {leaveError ? <Text accessibilityLiveRegion="polite" allowFontScaling style={[styles.errorText, { color: colors.destructive }]}>{leaveError}</Text> : null}
        </View>
      ) : null}
      <Text accessibilityRole="header" allowFontScaling style={[styles.sectionTitle, { color: colors.foreground }]}>
        Diagnostics
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <DiagnosticRow label="App version" value={getAppVersion()} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DiagnosticRow label="User" value={userId ? userId.slice(0, 8) : 'Unknown'} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DiagnosticRow label="Workspace" value={workspace ? workspace.id : 'Unknown'} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DiagnosticRow label="Role" value={role ? roleLabel(role).toUpperCase() : 'Unknown'} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DiagnosticRow label="Kind" value={kind ? kindLabel(kind).toUpperCase() : 'Unknown'} />
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

function NavRow({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" testID={testID} onPress={onPress} style={styles.row}>
      <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <Feather accessible={false} name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
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