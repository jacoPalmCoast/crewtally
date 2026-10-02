import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { Page } from '@/components/Page';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import { acceptInvite, acceptInviteCode, peekInvite, type PeekResult } from '@/lib/mobileApi';
import { useOperationKeeper } from '@/lib/operation';
import { roleLabel, tokenFromLink } from '@/lib/roles';

const CODE_WRONG = "That code didn't work. Check the email address and the code, or ask for a new invitation.";

function joinError(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  if (status === undefined) return 'Could not connect to CrewTally. Check your connection and try again.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (status === 409) return 'This invitation can no longer be used. Ask the organizer.';
  if (status === 400 || status === 410 || status === 404) return CODE_WRONG;
  return 'Could not join. Please try again.';
}

/** JoinTeam, JoinInvite and the link path. The person is already signed in. */
export default function JoinScreen() {
  const colors = useColors();
  const router = useRouter();
  const { openJoined } = useWorkspace();
  const op = useOperationKeeper();
  const [mode, setMode] = useState<'code' | 'link'>('code');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [peek, setPeek] = useState<PeekResult | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (workspaceId: string) => {
    op.done();
    await openJoined(workspaceId);
    router.replace('/joined' as never);
  };

  const submitCode = async () => {
    const e = email.trim().toLowerCase();
    const c = code.trim();
    if (busy || !e || !/^\d{6}$/.test(c)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await acceptInviteCode(e, c, op.idFor(`code|${e}|${c}`));
      await finish(result.workspace_id);
    } catch (err) {
      setError(joinError(err));
    } finally {
      setBusy(false);
    }
  };

  const checkLink = async () => {
    const t = tokenFromLink(link);
    if (busy) return;
    setError(null);
    setPeek(null);
    setUnavailable(false);
    if (!t) { setUnavailable(true); return; }
    setBusy(true);
    try {
      const r = await peekInvite(t);
      if (r.available) { setPeek(r); setToken(t); } else setUnavailable(true);
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status === undefined) setError('Could not connect to CrewTally. Check your connection and try again.');
      else if (status === 429) setError('Too many attempts. Wait a minute and try again.');
      else setUnavailable(true);
    } finally {
      setBusy(false);
    }
  };

  const acceptLink = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await acceptInvite(token, op.idFor(`link|${token}`));
      await finish(result.workspace_id);
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 410 || status === 404) { setPeek(null); setUnavailable(true); } else setError(joinError(err));
    } finally {
      setBusy(false);
    }
  };

  if (unavailable) {
    return (
      <Page>
        <Card>
          <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>
            This invitation isn't available
          </Text>
          <Text allowFontScaling testID="invite-unavailable" style={[styles.body, { color: colors.mutedForeground }]}>
            This invitation isn't available. Ask for a new one.
          </Text>
          <PrimaryButton label="Back" onPress={() => setUnavailable(false)} />
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>Join a team</Text>
      <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
        Use the email address the invitation was sent to and its 6-digit code, or paste the invitation link.
      </Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        <SecondaryButton label="Email and code" style={mode === 'code' ? { borderColor: colors.primary, borderWidth: 2 } : undefined}
          testID="join-mode-code" onPress={() => { setMode('code'); setError(null); }} />
        <SecondaryButton label="Invitation link" style={mode === 'link' ? { borderColor: colors.primary, borderWidth: 2 } : undefined}
          testID="join-mode-link" onPress={() => { setMode('link'); setError(null); }} />
      </View>
      {mode === 'code' ? (
        <>
          <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
            autoCorrect={false} autoComplete="email" textContentType="emailAddress" testID="join-email" />
          <Field label="6-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
            maxLength={6} autoComplete="one-time-code" testID="join-code" />
          {error ? <Notice testID="join-error">{error}</Notice> : null}
          <PrimaryButton label={busy ? 'Joining…' : 'Join'} testID="join-submit"
            disabled={busy || !email.trim() || code.length !== 6} onPress={() => void submitCode()} />
        </>
      ) : (
        <>
          <Field label="Invitation link" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false}
            keyboardType="url" testID="join-link" />
          {peek ? (
            <Card>
              <Text accessibilityRole="header" allowFontScaling style={[styles.name, { color: colors.foreground }]}>{peek.workspace_name}</Text>
              <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
                You would join as {roleLabel(peek.role ?? 'PARTNER')}.
              </Text>
              <PrimaryButton label={busy ? 'Joining…' : 'Join this workspace'} testID="join-accept" disabled={busy} onPress={() => void acceptLink()} />
            </Card>
          ) : (
            <PrimaryButton label={busy ? 'Checking…' : 'Check link'} testID="join-check" disabled={busy || !link.trim()} onPress={() => void checkLink()} />
          )}
          {error ? <Notice testID="join-error">{error}</Notice> : null}
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  tabs: { gap: 8 },
});
