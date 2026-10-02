import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Page } from '@/components/Page';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { WorkspaceList } from '@/components/WorkspaceList';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import { getConfig } from '@/lib/mobileApi';

/** Shown while signed in with no open workspace: loading, error, access removed, switcher, or first run. */
export default function GateScreen() {
  const colors = useColors();
  const router = useRouter();
  const { phase, error, retry, acknowledgeRemoved } = useWorkspace();
  const config = useQuery({ queryKey: ['config'], queryFn: getConfig, enabled: phase === 'none', retry: false });

  let body: React.ReactNode;
  if (phase === 'error') {
    body = (
      <>
        <Notice testID="gate-error">{error ?? 'Something went wrong.'}</Notice>
        <PrimaryButton label="Try again" onPress={retry} testID="gate-retry" />
      </>
    );
  } else if (phase === 'removed') {
    body = (
      <Card>
        <Feather accessible={false} name="lock" size={28} color={colors.copper} />
        <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>Access removed</Text>
        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
          You no longer have access to this workspace. Your account and other workspaces are still here.
        </Text>
        <PrimaryButton label="Choose a workspace" testID="removed-continue" onPress={acknowledgeRemoved} />
      </Card>
    );
  } else if (phase === 'switcher') {
    body = (
      <>
        <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>Workspaces</Text>
        <WorkspaceList />
      </>
    );
  } else if (phase === 'none') {
    body = (
      <>
        <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>
          What do you want to set up?
        </Text>
        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
          A workspace holds the work and payments you record.
        </Text>
        <PrimaryButton label="Home" testID="choose-home" onPress={() => router.push('/create-workspace' as never)} />
        <SecondaryButton label="Join a team" testID="choose-join" onPress={() => router.push('/join' as never)} />
        {config.data?.business_enabled ? (
          // Business screens arrive in a later phase; the choice is listed but cannot be opened yet.
          <SecondaryButton label="Business" testID="choose-business" disabled onPress={() => undefined} />
        ) : null}
      </>
    );
  } else {
    body = (
      <View style={styles.center} accessibilityLiveRegion="polite" testID="gate-loading">
        <ActivityIndicator color={colors.primary} />
        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>Opening your workspace…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      <Page>{body}</Page>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 48 },
});
