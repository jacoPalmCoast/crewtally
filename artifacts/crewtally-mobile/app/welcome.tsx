import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Page } from '@/components/Page';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';

export default function WelcomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { workspace } = useWorkspace();
  return (
    <Page>
      <Feather accessible={false} name="check-circle" size={36} color={colors.primary} />
      <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>
        {workspace ? `Welcome to ${workspace.name}` : 'Welcome'}
      </Text>
      <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
        CrewTally keeps a record of the work and payments you make yourself. It never moves money.
      </Text>
      {/* Phase 2 adds the setup screens and the sample project here. */}
      <PrimaryButton label="Create my project" testID="welcome-create" onPress={() => router.replace('/(tabs)' as never)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 26 },
});
