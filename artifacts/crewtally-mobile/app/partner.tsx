import React, { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { Page } from '@/components/Page';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import {
  createInvitation, getInvitations, getMembers, removeMember, revokeInvitation, type CreatedInvitation,
} from '@/lib/mobileApi';
import { useOperationKeeper } from '@/lib/operation';
import { formatDate } from '@/lib/roles';

interface Ready { id: string; link: string | null; code: string | null; email: string; expiresAt?: string; already: boolean }

export function shareMessage(workspaceName: string, link: string, code: string, email: string): string {
  return `Join me on CrewTally to help keep track of ${workspaceName}. Open ${link} on your iPhone, or enter code ${code} with this email address: ${email}. It works for 7 days.`;
}

const errText = (e: unknown, fallback: string) => {
  const status = (e as { status?: number } | null)?.status;
  if (status === 409) return 'This workspace already has a partner or a pending invitation.';
  if (status === 403) return 'Only the organizer can do this.';
  if (status === undefined) return 'Could not connect to CrewTally. Check your connection and try again.';
  return fallback;
};

export default function PartnerScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const { workspace, workspaceId, can } = useWorkspace();
  const inviteOp = useOperationKeeper();
  const revokeOp = useOperationKeeper();
  const removeOp = useOperationKeeper();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ready, setReady] = useState<Ready | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const allowed = can['members.manage'] === true;

  const members = useQuery({ queryKey: ['ws', workspaceId, 'members'], queryFn: getMembers, enabled: allowed });
  const invitations = useQuery({ queryKey: ['ws', workspaceId, 'invitations'], queryFn: getInvitations, enabled: allowed });
  const refetchAll = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['ws', workspaceId, 'members'] }),
    qc.invalidateQueries({ queryKey: ['ws', workspaceId, 'invitations'] }),
  ]);

  const wsName = workspace?.name ?? 'this workspace';
  const partner = members.data?.members.find((m) => m.role === 'PARTNER');
  const pending = (invitations.data?.invitations ?? []).find(
    (i) => i.role === 'PARTNER' && i.status === 'PENDING' && new Date(i.expires_at).getTime() > Date.now(),
  );

  const toReady = (r: CreatedInvitation, em: string): Ready => ({
    id: r.id, link: r.link, code: r.code, email: em, expiresAt: r.expires_at, already: r.already_created === true || !r.token,
  });

  const invite = useMutation({
    mutationFn: async (input: { name: string; email: string }) => {
      const body = { role: 'PARTNER' as const, email: input.email, ...(input.name ? { name: input.name } : {}) };
      return createInvitation(body, inviteOp.idFor(`${input.email}|${input.name}`));
    },
    onSuccess: async (r, v) => { inviteOp.done(); setReady(toReady(r, v.email)); setError(null); await refetchAll(); },
    onError: (e) => setError(errText(e, 'Could not create the invitation. Try again.')),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => revokeInvitation(id, revokeOp.idFor(id)),
    onSuccess: async () => { revokeOp.done(); setReady(null); setError(null); await refetchAll(); },
    onError: (e) => setError(errText(e, 'Could not revoke the invitation. Try again.')),
  });

  const resend = useMutation({
    // Revoke this invitation, then create a new one to the same email: new link, new code, new 7 days.
    mutationFn: async (inv: { id: string; email: string; name: string | null }) => {
      await revokeInvitation(inv.id, revokeOp.idFor(inv.id));
      revokeOp.done();
      const body = { role: 'PARTNER' as const, email: inv.email, ...(inv.name ? { name: inv.name } : {}) };
      return createInvitation(body, inviteOp.idFor(`resend|${inv.id}`));
    },
    onSuccess: async (r, v) => { inviteOp.done(); setReady(toReady(r, v.email)); setError(null); await refetchAll(); },
    onError: async (e) => { setError(errText(e, 'Could not send a new invitation. Try again.')); await refetchAll(); },
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => removeMember(userId, removeOp.idFor(userId)),
    onSuccess: async () => { removeOp.done(); setConfirmRemove(false); setError(null); await refetchAll(); },
    onError: (e) => setError(errText(e, 'Could not remove the partner. Try again.')),
  });

  if (!allowed) {
    return (
      <Page>
        <Text allowFontScaling testID="partner-not-allowed" style={[styles.body, { color: colors.mutedForeground }]}>
          Only the organizer manages the partner.
        </Text>
      </Page>
    );
  }

  const loading = members.isPending || invitations.isPending;
  const loadFailed = members.isError || invitations.isError;
  const busy = invite.isPending || revoke.isPending || resend.isPending || remove.isPending;

  const copy = async (what: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(what);
  };

  const readyCard = ready ? (
    <Card>
      <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>
        {ready.already ? 'Invitation already created' : 'Invitation ready'}
      </Text>
      {ready.already || !ready.link || !ready.code ? (
        <>
          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
            The link and code are shown only once, when an invitation is created, and can't be shown again.
          </Text>
          <PrimaryButton label="Revoke and invite again" testID="partner-revoke-reinvite" disabled={busy}
            onPress={() => void resend.mutateAsync({ id: ready.id, email: ready.email, name: pending?.invitee_name ?? null }).catch(() => undefined)} />
        </>
      ) : (
        <>
          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>
            Shown once. Share it now; it can't be shown again.
          </Text>
          <View style={styles.kv}>
            <Text allowFontScaling style={[styles.label, { color: colors.mutedForeground }]}>Link</Text>
            <Text allowFontScaling selectable testID="partner-link" style={[styles.body, { color: colors.foreground }]}>{ready.link}</Text>
            <SecondaryButton label="Copy link" testID="partner-copy-link" onPress={() => void copy('link', ready.link as string)} />
          </View>
          <View style={styles.kv}>
            <Text allowFontScaling style={[styles.label, { color: colors.mutedForeground }]}>Code</Text>
            <Text allowFontScaling selectable testID="partner-code" style={[styles.code, { color: colors.foreground }]}>{ready.code}</Text>
            <SecondaryButton label="Copy code" testID="partner-copy-code" onPress={() => void copy('code', ready.code as string)} />
          </View>
          {copied ? <Notice tone="info">{copied === 'link' ? 'Link copied.' : 'Code copied.'}</Notice> : null}
          <PrimaryButton label="Share" testID="partner-share"
            onPress={() => void Share.share({ message: shareMessage(wsName, ready.link as string, ready.code as string, ready.email) })} />
        </>
      )}
    </Card>
  ) : null;

  let body: React.ReactNode;
  if (loading) {
    body = <Text allowFontScaling accessibilityLiveRegion="polite" style={[styles.body, { color: colors.mutedForeground }]}>Loading…</Text>;
  } else if (loadFailed) {
    body = (
      <>
        <Notice>Could not load the partner details.</Notice>
        <PrimaryButton label="Try again" onPress={() => void refetchAll()} />
      </>
    );
  } else if (partner) {
    const pn = partner.display_name ?? partner.name ?? 'Partner';
    body = (
      <Card>
        <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>{pn}</Text>
        <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>Partner since {formatDate(partner.joined_at)}</Text>
        {confirmRemove ? (
          <>
            <Text allowFontScaling style={[styles.body, { color: colors.foreground }]}>
              {pn} will lose access to {wsName}. Their work and payments stay in your records.
            </Text>
            <PrimaryButton label={remove.isPending ? 'Removing…' : 'Remove partner'} testID="partner-remove-confirm" disabled={busy}
              onPress={() => void remove.mutateAsync(partner.user_id).catch(() => undefined)} />
            <SecondaryButton label="Cancel" onPress={() => setConfirmRemove(false)} />
          </>
        ) : (
          <SecondaryButton label="Remove partner" testID="partner-remove" onPress={() => setConfirmRemove(true)} />
        )}
      </Card>
    );
  } else if (pending) {
    body = (
      <>
        {readyCard}
        <Card>
          <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>Invitation pending</Text>
          {pending.invitee_name ? <Text allowFontScaling style={[styles.body, { color: colors.foreground }]}>{pending.invitee_name}</Text> : null}
          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>{pending.email}</Text>
          <Text allowFontScaling style={[styles.body, { color: colors.mutedForeground }]}>Expires {formatDate(pending.expires_at)}</Text>
          <SecondaryButton label="Resend" testID="partner-resend" disabled={busy}
            onPress={() => void resend.mutateAsync({ id: pending.id, email: pending.email, name: pending.invitee_name }).catch(() => undefined)} />
          <SecondaryButton label="Revoke" testID="partner-revoke" disabled={busy}
            onPress={() => void revoke.mutateAsync(pending.id).catch(() => undefined)} />
        </Card>
      </>
    );
  } else {
    const valid = /^\S+@\S+\.\S+$/.test(email.trim());
    body = (
      <>
        {readyCard}
        <Text allowFontScaling style={[styles.body, { color: colors.foreground }]}>
          A partner can record work and payments, and add workers and projects. They can't change pay rates, remove people,
          invite others or manage the plan. They pay nothing.
        </Text>
        <Field label="Partner's name" hint="For your own reference." value={name} onChangeText={setName} maxLength={60}
          autoCapitalize="words" testID="partner-name" />
        <Field label="Partner's email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
          autoCorrect={false} autoComplete="email" textContentType="emailAddress" testID="partner-email" />
        <PrimaryButton label={invite.isPending ? 'Creating…' : 'Create invitation'} testID="partner-create" disabled={busy || !valid}
          onPress={() => void invite.mutateAsync({ name: name.trim(), email: email.trim().toLowerCase() }).catch(() => undefined)} />
      </>
    );
  }

  return (
    <Page>
      {body}
      {error ? <Notice testID="partner-error">{error}</Notice> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, fontWeight: '600' },
  kv: { gap: 6 },
  code: { fontSize: 28, fontWeight: '700', letterSpacing: 4 },
});
