import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import { kindLabel, roleLabel } from '@/lib/roles';

/** The workspace switcher. Switching clears in-memory screens and reloads from the API. */
export function WorkspaceList({ onSwitched }: { onSwitched?: () => void }) {
  const colors = useColors();
  const router = useRouter();
  const { workspaces } = useAuth();
  const { workspaceId, switchTo } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const list = workspaces ?? [];

  const pick = async (id: string) => {
    setError(null);
    if (id === workspaceId) { onSwitched?.(); return; }
    await switchTo(id);
    onSwitched?.();
  };

  return (
    <View style={styles.wrap}>
      {list.length === 0 ? (
        <Card>
          <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>No workspaces</Text>
          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
            Your account is still here. Create a Home workspace, or join a team with an invitation.
          </Text>
        </Card>
      ) : (
        <Card>
          {list.map((w) => {
            const current = w.id === workspaceId;
            return (
              <Pressable
                key={w.id}
                accessibilityRole="button"
                accessibilityState={{ selected: current }}
                accessibilityLabel={`${w.name}, ${kindLabel(w.kind)}, ${roleLabel(w.role)}${current ? ', current' : ''}`}
                testID={`workspace-row-${w.id}`}
                onPress={() => void pick(w.id)}
                style={styles.row}
              >
                <View style={styles.rowText}>
                  <Text allowFontScaling style={[styles.name, { color: colors.foreground }]}>{w.name}</Text>
                  <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
                    {kindLabel(w.kind)} · {roleLabel(w.role)}
                  </Text>
                </View>
                {current ? (
                  <View style={styles.current}>
                    <Feather accessible={false} name="check" size={18} color={colors.primary} />
                    <Text allowFontScaling style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>Current</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Card>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <PrimaryButton label="Create a Home workspace" testID="switcher-create" onPress={() => router.push('/create-workspace' as never)} />
      <SecondaryButton label="Join a team" testID="switcher-join" onPress={() => router.push('/join' as never)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
