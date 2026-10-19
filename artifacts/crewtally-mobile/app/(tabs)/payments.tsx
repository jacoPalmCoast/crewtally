import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { listPayments, recordPayment, clearPayment, reversePayment } from '@workspace/api-client-react';
import type { Payment, PaymentInput, PaymentResult, ReversalInput, ReversalResult, ClearanceInput, ClearPayment200 } from '@workspace/api-zod';
import { useProject } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import { useAssignments, useDomainAccess, useDomainScope, useDomainMutation, todayIn, parseCents, validDate, domainError } from '@/lib/domain';
import type { JsonDto } from '@/lib/api';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { ProjectPicker } from '@/components/ProjectPicker';
import { Notice } from '@/components/Notice';
import { Money } from '@/components/Money';
import { EmptyState } from '@/components/EmptyState';
import { StatusLabel } from '@/components/StatusLabel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';

const methods: ReadonlyArray<{ value: PaymentInput['method']; label: string }> = [
  { value: 'CASH', label: 'Cash' }, { value: 'CHECK', label: 'Check' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'ZELLE', label: 'Zelle' }, { value: 'OTHER', label: 'Other' },
];
const methodLabel = (value: PaymentInput['method']) => methods.find(m => m.value === value)!.label;

export default function PaymentsScreen() {
  const { projectId } = useProject();
  const { can } = useWorkspace();
  const allowed = useDomainAccess();
  const scope = useDomainScope();
  const colors = useColors();
  const [adding, setAdding] = useState(false);
  const payments = useQuery<JsonDto<Payment>[]>({
    queryKey: [...scope, 'payments'], queryFn: ({ signal }) => listPayments(undefined, { signal }),
    enabled: allowed && can['money.view'] === true, staleTime: 0, refetchInterval: 30000,
  });
  return <Screen title="Payments" workspaceHeader headerContent={<ProjectPicker />}>
    <View style={{ gap: 16 }}>
      <Text allowFontScaling style={{ color: colors.mutedForeground, lineHeight: 22 }}>
        Record payments made outside CrewTally. This saves a record, not a transfer. CrewTally never moves money.
      </Text>
      {!allowed || !can['money.view'] ? <Notice>Payment records are not available for this workspace role.</Notice> : <>
        {can['money.record'] ? <>
          <PrimaryButton label={adding ? 'Close payment form' : 'Record a payment'} testID="payment-open"
            disabled={!projectId} onPress={() => setAdding(!adding)} />
          {!projectId ? <Notice>Choose or create a project to allocate a payment to workers.</Notice> : null}
          {adding && projectId ? <PaymentForm key={projectId} /> : null}
        </> : null}
        <Text accessibilityRole="header" allowFontScaling style={{ color: colors.foreground, fontSize: 20, fontWeight: '600' }}>
          Workspace payment records
        </Text>
        {payments.isPending ? <Text style={{ color: colors.mutedForeground }}>Loading payment records…</Text>
          : payments.isError ? <><Notice>Could not load payment records.</Notice>
            <SecondaryButton label="Retry payments" onPress={() => { void payments.refetch(); }} /></>
          : !payments.data.length ? <EmptyState icon="credit-card" title="No payment records yet"
            description="Record a payment you made outside CrewTally. Split its amount across assigned workers." />
          : payments.data.map(p => <PaymentCard key={p.id} payment={p} />)}
      </>}
    </View>
  </Screen>;
}

function PaymentForm() {
  const { project } = useProject();
  const assignments = useAssignments();
  const colors = useColors();
  const [date, setDate] = useState(() => todayIn(project!.timezone));
  const [method, setMethod] = useState<PaymentInput['method']>('CASH');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [methodNote, setMethodNote] = useState('');
  const [reference, setReference] = useState('');
  const [split, setSplit] = useState<Record<string, string>>({});
  const payment = useDomainMutation<Omit<PaymentInput, 'operation_id'>, PaymentResult>(recordPayment);
  const total = parseCents(amount);
  const available = assignments.data ?? [];
  const allocations = available.map(a => ({
    assignment_id: a.id, amount_minor: !split[a.id] || /^0+$/.test(split[a.id]) ? 0 : parseCents(split[a.id]),
  }));
  const splitValid = allocations.every(a => a.amount_minor !== null);
  const sum = allocations.reduce((acc, a) => acc + (a.amount_minor ?? 0), 0);
  const valid = validDate(date) && total !== null && splitValid && sum === total && !!recipient.trim() &&
    (method !== 'OTHER' || !!methodNote.trim()) && available.length > 0;
  return <Card>
    <Text accessibilityRole="header" allowFontScaling style={{ color: colors.foreground, fontSize: 20, fontWeight: '600' }}>New payment record</Text>
    <Field label="Payment date" hint="YYYY-MM-DD. The date you actually paid." value={date} onChangeText={setDate} maxLength={10} testID="payment-date" />
    <Field label="Recipient" value={recipient} onChangeText={setRecipient} maxLength={80} testID="payment-recipient" />
    <Field label="Total amount (cents)" hint="Whole cents only. For $125.00 enter 12500." value={amount} onChangeText={setAmount}
      keyboardType="number-pad" maxLength={8} testID="payment-cents" />
    {total !== null ? <Money cents={total} /> : null}
    <Text allowFontScaling style={{ color: colors.foreground, fontWeight: '600' }}>Payment method used</Text>
    {methods.map(m => <SecondaryButton key={m.value} testID={`payment-method-${m.value}`}
      label={`${method === m.value ? 'Selected: ' : ''}${m.label}`} disabled={payment.isPending} onPress={() => setMethod(m.value)} />)}
    {method === 'OTHER' ? <Field label="Other method description" value={methodNote} onChangeText={setMethodNote}
      maxLength={500} testID="payment-method-note" /> : null}
    <Field label="Reference (optional)" value={reference} onChangeText={setReference} maxLength={500} testID="payment-reference" />
    <Text accessibilityRole="header" allowFontScaling style={{ color: colors.foreground, fontSize: 18, fontWeight: '600' }}>Allocation split · {project!.name}</Text>
    {assignments.isPending ? <Text style={{ color: colors.mutedForeground }}>Loading assigned workers…</Text>
      : assignments.isError ? <><Notice>Could not load assignments.</Notice>
        <SecondaryButton label="Retry assignments" onPress={() => { void assignments.refetch(); }} /></>
      : !available.length ? <Notice>Assign workers in the Workers tab first.</Notice>
      : available.map(a => <Field key={a.id} label={`${a.display_name ?? 'Worker'} allocation (cents)`}
        hint={`Assignment starts ${a.start_date}${a.end_date ? `, ends ${a.end_date}` : ''}`}
        value={split[a.id] ?? ''} onChangeText={value => setSplit(old => ({ ...old, [a.id]: value }))}
        keyboardType="number-pad" maxLength={8} testID={`allocation-${a.id}`} />)}
    <Text allowFontScaling accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground }}>
      Allocated cents: {sum}. Must equal the total cents: {total ?? '—'}. Leave unused workers blank.
    </Text>
    {!splitValid || total !== null && sum !== total ? <Notice>The allocation amounts must be whole cents and sum exactly to the payment.</Notice> : null}
    <PrimaryButton testID="payment-save" label={payment.isPending ? 'Recording…' : 'Save payment record'}
      disabled={!valid || payment.isPending || assignments.isError || assignments.isPending}
      onPress={() => {
        if (!valid || total === null) return;
        void payment.mutateAsync({
          date, method, recipient: recipient.trim(), amount_minor: total,
          allocations: allocations.filter(a => a.amount_minor! > 0).map(a => ({ assignment_id: a.assignment_id, amount_minor: a.amount_minor! })),
          ...(method === 'OTHER' ? { method_note: methodNote.trim() } : {}),
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }).then(() => { setAmount(''); setSplit({}); setRecipient(''); setReference(''); setMethodNote(''); }).catch(() => undefined);
      }} />
    {payment.isSuccess ? <Notice tone="info">Payment record saved. No money was moved by CrewTally.</Notice> : null}
    {payment.isError ? <Notice>{domainError(payment.error)}</Notice> : null}
  </Card>;
}

function PaymentCard({ payment }: { payment: JsonDto<Payment> }) {
  const { can, workspace } = useWorkspace();
  const colors = useColors();
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => todayIn(workspace?.default_timezone ?? 'UTC'));
  const [kind, setKind] = useState<ReversalInput['kind']>('FULL');
  const clear = useDomainMutation<Omit<ClearanceInput, 'operation_id'>, ClearPayment200>(
    body => clearPayment(payment.id, body), payment.id);
  const reverse = useDomainMutation<Omit<ReversalInput, 'operation_id'>, ReversalResult>(
    body => reversePayment(payment.id, body), payment.id);
  const busy = clear.isPending || reverse.isPending;
  const reversed = reverse.isSuccess && reverse.data.unreversed_minor === 0;
  return <Card>
    <Text accessibilityRole="header" allowFontScaling style={{ color: colors.foreground, fontSize: 20, fontWeight: '600' }}>{payment.recipient_label}</Text>
    <Money cents={payment.amount_minor} testID={`payment-amount-${payment.id}`} />
    <Text allowFontScaling style={{ color: colors.mutedForeground }}>{payment.payment_date} · {methodLabel(payment.method)}</Text>
    {payment.reference ? <Text allowFontScaling style={{ color: colors.foreground }}>Reference: {payment.reference}</Text> : null}
    {payment.method_note ? <Text allowFontScaling style={{ color: colors.foreground }}>{payment.method_note}</Text> : null}
    {payment.clearance === 'ISSUED' ? <StatusLabel status="checkNotCleared" />
      : <Text testID={`clearance-${payment.id}`} allowFontScaling style={{ color: colors.foreground }}>
        {payment.clearance === 'CLEARED' ? 'Check cleared' : payment.clearance === 'RETURNED' ? 'Check returned' : 'Clearance not applicable'}
      </Text>}
    <Text allowFontScaling style={{ color: colors.mutedForeground }}>Allocated across {payment.allocations.length} worker assignment(s).</Text>
    {can['money.record'] && !reversed ? <>
      {payment.method === 'CHECK' && payment.clearance === 'ISSUED' ? <SecondaryButton label={clear.isPending ? 'Updating…' : 'Mark check cleared'}
        testID={`payment-clear-${payment.id}`} disabled={busy}
        onPress={() => { void clear.mutateAsync({ expected_version: payment.version }).catch(() => undefined); }} /> : null}
      {reversing ? <>
        <Notice>This adds a reversal to the records and updates balances. It does not return or move any money.</Notice>
        <Field label="Reversal reason" value={reason} onChangeText={setReason} maxLength={500} testID={`reverse-reason-${payment.id}`} />
        <Field label="Reversal effective date" hint="YYYY-MM-DD" value={effectiveDate} onChangeText={setEffectiveDate} maxLength={10}
          testID={`reverse-date-${payment.id}`} />
        {payment.method === 'CHECK' && payment.clearance !== 'RETURNED' ? <SecondaryButton label={kind === 'CHECK_RETURNED' ? 'Selected: Check returned' : 'Record as returned check'}
          disabled={busy} onPress={() => setKind(kind === 'CHECK_RETURNED' ? 'FULL' : 'CHECK_RETURNED')} /> : null}
        <PrimaryButton label={reverse.isPending ? 'Recording reversal…' : 'Confirm reversal record'} testID={`payment-reverse-confirm-${payment.id}`}
          disabled={busy || !reason.trim() || !validDate(effectiveDate)} onPress={() => {
            void reverse.mutateAsync({ kind, reason: reason.trim(), effective_date: effectiveDate, expected_version: payment.version })
              .then(() => { setReversing(false); setReason(''); }).catch(() => undefined);
          }} />
        <SecondaryButton label="Cancel reversal" disabled={busy} onPress={() => setReversing(false)} />
      </> : <SecondaryButton label="Reverse payment record" testID={`payment-reverse-${payment.id}`} disabled={busy}
        onPress={() => setReversing(true)} />}
    </> : null}
    {clear.isSuccess ? <Notice tone="info">Check clearance recorded.</Notice> : null}
    {reverse.isSuccess ? <Notice tone="info">{`Reversal recorded. Remaining unreversed cents: ${reverse.data.unreversed_minor}. No money was moved.`}</Notice> : null}
    {clear.isError || reverse.isError ? <Notice>{domainError(clear.error ?? reverse.error)}</Notice> : null}
  </Card>;
}
