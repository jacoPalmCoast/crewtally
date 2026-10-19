import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ApplyRateChange200, Assignment, RateAgreement, RateChangeInput, Worker, WorkerInput, WorkerUpdateInput, AssignmentInput } from '@workspace/api-zod';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { Notice } from '@/components/Notice';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ProjectPicker } from '@/components/ProjectPicker';
import { SecondaryButton } from '@/components/SecondaryButton';
import { StatusLabel } from '@/components/StatusLabel';
import { useColors } from '@/hooks/useColors';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useProject } from '@/contexts/ProjectContext';
import type { JsonDto } from '@/lib/api';
import {
  createWorker,
  updateWorker,
  createAssignment,
  applyRateChange,
} from '@workspace/api-client-react';
import {
  domainError,
  parseCents,
  todayIn,
  validDate,
  useAssignments,
  useBalances,
  useDomainAccess,
  useDomainMutation,
  useRates,
  useWorkers,
} from '@/lib/domain';

type WorkerDto = JsonDto<Worker>;
type AssignmentDto = JsonDto<Assignment>;
type RateDto = JsonDto<RateAgreement>;
type Basis = RateChangeInput['pay_basis'];

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <Notice>{message}</Notice>
      <SecondaryButton label="Try again" onPress={onRetry} />
    </Card>
  );
}

function AddWorkerForm({ canAdd }: { canAdd: boolean }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const colors = useColors();
  const create = useDomainMutation<Omit<WorkerInput, 'operation_id'>, unknown>((body) => createWorker(body));
  if (!canAdd) return <Notice tone="info">Your role can view workers but not add them.</Notice>;
  const trimmed = name.trim();
  const submit = () => {
    setSaved(null);
    create.mutate(
      { display_name: trimmed, phone: phone.trim() || null },
      { onSuccess: () => { setSaved(`${trimmed} was added.`); setName(''); setPhone(''); } },
    );
  };
  return (
    <Card>
      <Text allowFontScaling accessibilityRole="header" style={[styles.h2, { color: colors.foreground }]}>Add a worker</Text>
      <Field label="Name" value={name} onChangeText={setName} maxLength={60} testID="worker-name" autoCapitalize="words" />
      <Field label="Phone (optional)" value={phone} onChangeText={setPhone} maxLength={60} keyboardType="phone-pad" />
      {create.isError ? <Notice testID="worker-create-error">{domainError(create.error)}</Notice> : null}
      {saved ? <Notice tone="info">{saved}</Notice> : null}
      <PrimaryButton
        testID="worker-create"
        label={create.isPending ? 'Adding...' : 'Add worker'}
        disabled={!trimmed || create.isPending}
        onPress={submit}
      />
    </Card>
  );
}

function EditForm({ worker, onDone }: { worker: WorkerDto; onDone: () => void }) {
  const [name, setName] = useState(worker.display_name);
  const [phone, setPhone] = useState(worker.phone ?? '');
  const [active, setActive] = useState(worker.status === 'ACTIVE');
  const update = useDomainMutation<Omit<WorkerUpdateInput, 'operation_id'> & { id: string }, unknown>(
    ({ id, ...body }) => updateWorker(id, body),
  );
  const trimmed = name.trim();
  return (
    <View style={styles.gap}>
      <Field label="Name" value={name} onChangeText={setName} maxLength={60} autoCapitalize="words" />
      <Field label="Phone (optional)" value={phone} onChangeText={setPhone} maxLength={60} keyboardType="phone-pad" />
      <SecondaryButton
        label={active ? 'Status: Active (tap to set inactive)' : 'Status: Inactive (tap to set active)'}
        onPress={() => setActive(!active)}
      />
      {update.isError ? <Notice>{domainError(update.error)}</Notice> : null}
      <PrimaryButton
        testID={`worker-save-${worker.id}`}
        label={update.isPending ? 'Saving...' : 'Save worker'}
        disabled={!trimmed || update.isPending}
        onPress={() =>
          update.mutate(
            { id: worker.id, display_name: trimmed, phone: phone.trim() || null, status: active ? 'ACTIVE' : 'INACTIVE' },
            { onSuccess: onDone },
          )
        }
      />
      <SecondaryButton label="Cancel" onPress={onDone} />
    </View>
  );
}

function RateForm({ assignment, timezone, canSet }: { assignment: AssignmentDto; timezone: string; canSet: boolean }) {
  const colors = useColors();
  const id = assignment.worker_id;
  const rates = useRates(assignment.id);
  const [basis, setBasis] = useState<Basis>('DAY');
  const [cents, setCents] = useState('');
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState(() => todayIn(timezone));
  const [dayMinutes, setDayMinutes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const apply = useDomainMutation<Omit<RateChangeInput, 'operation_id'> & { assignment_id: string }, ApplyRateChange200>(
    ({ assignment_id, ...body }) => applyRateChange(assignment_id, body),
  );
  const list = (rates.data ?? []) as RateDto[];
  const today = todayIn(timezone);
  const current = useMemo(
    () => [...list].filter((x) => x.effective_from <= today).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0],
    [list, today],
  );
  const scheduled = useMemo(
    () => [...list].filter((x) => x.effective_from > today).sort((a, b) => a.effective_from.localeCompare(b.effective_from)),
    [list, today],
  );

  const submit = () => {
    setLocalError(null);
    const max = basis === 'HOUR' ? 100000 : 500000;
    const parsed: unknown = parseCents(cents, max);
    if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
      setLocalError(`Enter whole cents from 1 to ${max}, with no decimal point. For example, 15000 is $150.00.`);
      return;
    }
    if (!validDate(from)) {
      setLocalError('Enter the start date as YYYY-MM-DD.');
      return;
    }
    if (list.some((x) => x.effective_from === from)) {
      setLocalError('A rate already starts on that date. Choose a different date to replace it.');
      return;
    }
    let minutes: number | null = null;
    if (basis === 'DAY' && dayMinutes.trim()) {
      minutes = /^\d+$/.test(dayMinutes.trim()) ? Number(dayMinutes.trim()) : NaN;
      if (!Number.isInteger(minutes) || minutes < 60 || minutes > 1440) {
        setLocalError('Standard day minutes must be a whole number from 60 to 1440.');
        return;
      }
    }
    if (needsConfirm && !reason.trim()) {
      setLocalError('Give a reason before repricing recorded work.');
      return;
    }
    apply.mutate(
      {
        assignment_id: assignment.id,
        effective_from: from,
        pay_basis: basis,
        rate_minor: parsed,
        reason: reason.trim() || null,
        standard_day_minutes: basis === 'DAY' ? minutes : null,
        confirm: needsConfirm && confirm ? true : undefined,
      },
      {
        onSuccess: () => { setCents(''); setReason(''); setConfirm(false); setNeedsConfirm(false); },
        onError: (e) => {
          const code = (e as { code?: unknown; error?: { code?: unknown } } | null);
          if (code?.code === 'CONFIRMATION_REQUIRED' || code?.error?.code === 'CONFIRMATION_REQUIRED') setNeedsConfirm(true);
        },
      },
    );
  };

  return (
    <View style={[styles.sub, { borderColor: colors.border }]}>
      <Text allowFontScaling style={[styles.h3, { color: colors.foreground }]}>Pay rate</Text>
      {rates.isLoading ? <Text style={{ color: colors.mutedForeground }}>Loading rate...</Text> : null}
      {rates.isError ? <Retry message="Rates could not be loaded." onRetry={() => rates.refetch()} /> : null}
      {current ? (
        <View style={styles.row}>
          <Money cents={current.rate_minor} />
          <Text allowFontScaling style={{ color: colors.mutedForeground }}>
            per {current.pay_basis === 'DAY' ? 'day' : 'hour'} since {current.effective_from}
          </Text>
        </View>
      ) : rates.isSuccess && scheduled.length === 0 ? (
        <Notice tone="info">No rate is set yet. Work cannot be priced until you set one.</Notice>
      ) : null}
      {scheduled.map((x) => (
        <View key={x.id} style={styles.gap}>
          <Text allowFontScaling style={{ color: colors.mutedForeground }}>
            Scheduled: {x.pay_basis === 'DAY' ? 'per day' : 'per hour'} from {x.effective_from}
          </Text>
          <Money cents={x.rate_minor} />
        </View>
      ))}
      {canSet ? (
        <View style={styles.gap}>
          <View style={styles.row}>
            {(['DAY', 'HOUR'] as Basis[]).map((b) => (
              <Pressable
                key={b}
                testID={`rate-basis-${b}-${id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: basis === b }}
                onPress={() => setBasis(b)}
                style={[styles.chip, { borderColor: colors.primary, backgroundColor: basis === b ? colors.primary : colors.card }]}
              >
                <Text style={{ fontWeight: '600', color: basis === b ? colors.primaryForeground : colors.foreground }}>
                  {b === 'DAY' ? 'Per day' : 'Per hour'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="New rate in cents"
            hint="Whole cents only. For example, 15000 is $150.00."
            value={cents}
            onChangeText={setCents}
            keyboardType="number-pad"
            testID={`rate-cents-${id}`}
          />
          <Field
            label="Starts on (YYYY-MM-DD)"
            hint="To replace a rate, choose a new date that no other rate already starts on."
            value={from}
            onChangeText={setFrom}
            maxLength={10}
            autoCapitalize="none"
          />
          {basis === 'DAY' ? (
            <Field
              label="Standard day minutes (optional)"
              hint="Whole minutes from 60 to 1440."
              value={dayMinutes}
              onChangeText={setDayMinutes}
              keyboardType="number-pad"
            />
          ) : null}
          <Field label={needsConfirm ? 'Reason (required)' : 'Reason (optional)'} value={reason} onChangeText={setReason} maxLength={500} />
          {needsConfirm ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirm }}
              onPress={() => setConfirm(!confirm)}
              style={[styles.chip, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}
            >
              <Text style={{ color: colors.warning, fontWeight: '600' }}>
                {confirm ? 'Confirmed: recorded work will be repriced' : 'Tap to confirm repricing recorded work'}
              </Text>
            </Pressable>
          ) : null}
          {localError ? <Notice>{localError}</Notice> : null}
          {apply.isError ? <Notice>{domainError(apply.error)}</Notice> : null}
          {apply.isSuccess ? (
            <View style={styles.gap}>
              <Notice tone="info">Rate saved.</Notice>
              <Text allowFontScaling style={{ color: colors.mutedForeground }}>
                {apply.data.corrected_days} recorded day(s) repriced · server-calculated net change:
              </Text>
              <Money cents={apply.data.total_delta_minor} />
            </View>
          ) : null}
          <PrimaryButton
            testID={`rate-save-${id}`}
            label={apply.isPending ? 'Saving...' : 'Save rate'}
            disabled={!cents || apply.isPending || (needsConfirm && (!confirm || !reason.trim()))}
            onPress={submit}
          />
        </View>
      ) : (
        <Notice tone="info">Your role cannot change rates.</Notice>
      )}
    </View>
  );
}

function WorkerCard({
  worker, assignment, balance, projectId, timezone, canAdd, canSetRate, assignmentsReady,
}: {
  worker: WorkerDto;
  assignment: AssignmentDto | undefined;
  balance: number | null;
  projectId: string | null;
  timezone: string | null;
  canAdd: boolean;
  canSetRate: boolean;
  assignmentsReady: boolean;
}) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const assign = useDomainMutation<Omit<AssignmentInput, 'operation_id'> & { project_id: string }, unknown>(
    ({ project_id, ...body }) => createAssignment(project_id, body),
  );
  return (
    <Card>
      <View style={styles.row}>
        <Text allowFontScaling style={[styles.name, { color: colors.foreground }]}>{worker.display_name}</Text>
        {balance === null ? null : (
          <View style={styles.right}>
            <Money cents={balance} testID={`balance-${worker.id}`} />
            <StatusLabel status={balance > 0 ? 'owed' : balance < 0 ? 'advance' : 'settled'} />
          </View>
        )}
      </View>
      <Text allowFontScaling style={{ color: colors.mutedForeground, fontSize: 14 }}>
        {worker.status === 'ACTIVE' ? 'Active' : 'Inactive'}{worker.phone ? ` - ${worker.phone}` : ''}
      </Text>
      {editing ? (
        <EditForm worker={worker} onDone={() => setEditing(false)} />
      ) : canAdd ? (
        <SecondaryButton testID={`worker-edit-${worker.id}`} label="Edit worker" onPress={() => setEditing(true)} />
      ) : null}
      {assignment && timezone ? (
        <RateForm assignment={assignment} timezone={timezone} canSet={canSetRate} />
      ) : projectId && !assignmentsReady ? (
        <Text allowFontScaling style={{ color: colors.mutedForeground }}>Waiting for project assignments…</Text>
      ) : projectId && timezone && canAdd && worker.status === 'ACTIVE' ? (
        <View style={styles.gap}>
          {assign.isError ? <Notice>{domainError(assign.error)}</Notice> : null}
          <PrimaryButton
            testID={`worker-assign-${worker.id}`}
            label={assign.isPending ? 'Assigning...' : 'Assign to this project'}
            disabled={assign.isPending}
            onPress={() => assign.mutate({ project_id: projectId, worker_id: worker.id, start_date: todayIn(timezone) })}
          />
        </View>
      ) : (
        <Text style={{ color: colors.mutedForeground }}>Not on the selected project.</Text>
      )}
    </Card>
  );
}

export default function WorkersScreen() {
  const colors = useColors();
  const { can } = useWorkspace();
  const { projectId, project } = useProject();
  const workers = useWorkers();
  const balances = useBalances();
  const assignments = useAssignments();

  const hasAccess = useDomainAccess();
  const canAdd = !!can['people.add'];
  const canSetRate = !!can['rates.set'];
  const timezone = project?.timezone ?? null;
  const list = (workers.data ?? []) as WorkerDto[];
  const assignmentByWorker = useMemo(() => {
    const m = new Map<string, AssignmentDto>();
    const today = timezone ? todayIn(timezone) : null;
    for (const a of (assignments.data ?? []) as AssignmentDto[]) {
      if (!a.end_date || (today && a.end_date >= today)) m.set(a.worker_id, a);
    }
    return m;
  }, [assignments.data, timezone]);
  const balanceByWorker = useMemo(() => {
    if (!can['money.view'] || balances.isError || !balances.data) return null;
    const m = new Map<string, number>();
    for (const b of balances.data) {
      m.set(b.worker_id, (m.get(b.worker_id) ?? 0) + b.balance_minor);
    }
    return m;
  }, [balances.data, balances.isError, can['money.view']]);

  if (!hasAccess) {
    return (
      <Screen title="Workers" workspaceHeader>
        <EmptyState icon="lock" title="Access unavailable" description="Worker records are not available to your role in this workspace." />
      </Screen>
    );
  }

  return (
    <Screen title="Workers" workspaceHeader headerContent={<ProjectPicker />}>
      <View style={styles.gap}>
        <AddWorkerForm canAdd={canAdd} />
        {!projectId ? <Notice tone="info">Select a project to assign workers and set rates.</Notice> : null}
        {workers.isLoading ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground }}>Loading workers...</Text>
        ) : workers.isError ? (
          <Retry message="Workers could not be loaded." onRetry={() => workers.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon="users" title="No workers yet" description="Add the first person on your crew above." />
        ) : (
          list.map((w) => (
            <WorkerCard
              key={`${projectId ?? 'none'}:${w.id}`}
              worker={w}
              assignment={assignmentByWorker.get(w.id)}
              balance={balanceByWorker ? balanceByWorker.get(w.id) ?? 0 : null}
              projectId={projectId}
              timezone={timezone}
              canAdd={canAdd}
              canSetRate={canSetRate}
              assignmentsReady={assignments.isSuccess}
            />
          ))
        )}
        {can['money.view'] && balances.isError ? <Retry message="Balances could not be loaded." onRetry={() => balances.refetch()} /> : null}
        {assignments.isError ? <Retry message="Project assignments could not be loaded." onRetry={() => assignments.refetch()} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  right: { alignItems: 'flex-end' },
  h2: { fontSize: 20, fontWeight: '700' },
  h3: { fontSize: 17, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', flexShrink: 1 },
  sub: { borderTopWidth: 1, paddingTop: 12, gap: 12 },
  chip: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
});
