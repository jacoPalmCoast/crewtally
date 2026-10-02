import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Page } from '@/components/Page';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import { getMembers } from '@/lib/mobileApi';
import { roleLabel } from '@/lib/roles';

export default function JoinedScreen() {
  const colors = useColors();
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const [organizer, setOrganizer] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    getMembers()
      .then((r) => {
        const o = r.members.find((m) => m.role === 'ORGANIZER' || m.role === 'OWNER');
        if (live && o) setOrganizer(o.display_name ?? o.name ?? null);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [workspaceId]);

  const name = workspace?.name ?? 'this workspace';
  const home = workspace?.kind !== 'BUSINESS';
  return (
    <Page>
      <Feather accessible={false} name="check-circle" size={36} color={colors.primary} />
      <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>You joined</Text>
      <Text allowFontScaling testID="joined-text" style={[styles.body, { color: colors.foreground }]}>
        {home
          ? `You're helping with ${name}. ${organizer ?? 'The organizer'} manages the plan.`
          : `You joined ${name}.`}
      </Text>
      {workspace ? (
        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>Your role: {roleLabel(workspace.role)}</Text>
      ) : null}
      <PrimaryButton label="Continue" testID="joined-continue" onPress={() => router.replace('/(tabs)' as never)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 26 },
});
