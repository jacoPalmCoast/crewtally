import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import { kindLabel, roleLabel } from '@/lib/roles';

/** Shown at the top of workspace routes: which workspace, and your role in it. */
export function WorkspaceHeader() {
  const colors = useColors();
  const router = useRouter();
  const { workspace } = useWorkspace();
  if (!workspace) return null;
  const detail = `${kindLabel(workspace.kind)} · ${roleLabel(workspace.role)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Workspace ${workspace.name}, ${detail}. Switch workspace`}
      testID="workspace-header"
      onPress={() => router.push('/switcher' as never)}
      style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.text}>
        <Text allowFontScaling numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{workspace.name}</Text>
        <Text allowFontScaling style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
      <Feather accessible={false} name="chevron-down" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  text: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 14 },
});
