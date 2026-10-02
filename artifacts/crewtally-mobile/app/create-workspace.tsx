import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { Page } from '@/components/Page';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import { useOperationKeeper } from '@/lib/operation';

export default function CreateWorkspaceScreen() {
  const colors = useColors();
  const router = useRouter();
  const { createHome } = useWorkspace();
  const op = useOperationKeeper();
  const [name, setName] = useState('My home');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = async () => {
    if (busy || trimmed.length < 1 || trimmed.length > 80) return;
    setBusy(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Same operation_id on a retry of the same request.
      await createHome(trimmed, timezone, op.idFor(`${trimmed}|${timezone}`));
      op.done();
      router.replace('/welcome' as never);
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      setError(status === 400
        ? 'Check the name and try again. It needs 1 to 80 characters.'
        : status === 409
          ? 'That request was already used with different details. Go back and try again.'
          : 'Could not create the workspace. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>Name your Home workspace</Text>
      <Field label="Workspace name" value={name} onChangeText={setName} maxLength={80} autoCapitalize="words"
        testID="workspace-name" hint="Uses this device's time zone." returnKeyType="done" onSubmitEditing={() => void submit()} />
      {error ? <Notice testID="create-error">{error}</Notice> : null}
      <PrimaryButton label={busy ? 'Creating…' : 'Create workspace'} testID="create-submit" disabled={busy || trimmed.length < 1} onPress={() => void submit()} />
    </Page>
  );
}

const styles = StyleSheet.create({ title: { fontSize: 24, fontWeight: '700' } });
