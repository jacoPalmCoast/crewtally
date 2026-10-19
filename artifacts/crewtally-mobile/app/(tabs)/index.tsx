import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { listWorkEntries, recordWork, markRestNoWork } from '@workspace/api-client-react';
import type { Assignment, WorkInput, WorkEntry, NoWorkInput, RecordWork200, MarkRestNoWork200 } from '@workspace/api-zod';
import { earnedMinor, portionToTenThousandths } from '@workspace/crewtally-shared/pay';
import { useProject } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import {
  useAssignments, useRates, useDomainAccess, useDomainScope, useDomainMutation,
  todayIn, parseCents, domainError,
} from '@/lib/domain';
import type { JsonDto } from '@/lib/api';
import { Screen } from '@/components/Screen';
import { ProjectPicker } from '@/components/ProjectPicker';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { Money } from '@/components/Money';
import { StatusLabel } from '@/components/StatusLabel';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';

export default function TodayScreen() {
  const { project, projectId, loading, error } = useProject();
  const allowed = useDomainAccess();
  const colors = useColors();
  const [day, setDay] = useState(() => todayIn(project?.timezone ?? 'UTC'));
  useEffect(() => {
    const update = () => setDay(todayIn(project?.timezone ?? 'UTC'));
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [project?.timezone]);
  return <Screen title="Today" workspaceHeader headerContent={<ProjectPicker />}>
    {!allowed ? <Notice>Domain records are not available for this workspace role.</Notice>
      : loading ? <Text style={{ color: colors.foreground }}>Loading projects…</Text>
      : error ? null
      : !projectId ? <EmptyState icon="calendar" title="Choose a project" description="Create or choose a project above, then assign your crew in Workers." />
      : <TodayCrew key={`${projectId}:${day}`} day={day} />}
  </Screen>;
}

function TodayCrew({ day }: { day: string }) {
  const { projectId } = useProject();
  const { can } = useWorkspace();
  const assignments = useAssignments();
  const colors = useColors();
  const [confirm, setConfirm] = useState(false);
  const noWork = useDomainMutation<Omit<NoWorkInput, 'operation_id'>, MarkRestNoWork200>(markRestNoWork);
  const crew = assignments.data?.filter(a => a.start_date <= day && (!a.end_date || a.end_date >= day)) ?? [];
  if (assignments.isPending) return <Text style={{ color: colors.foreground }}>Loading crew…</Text>;
  if (assignments.isError) return <View style={{ gap: 12 }}><Notice>Could not load the crew.</Notice>
    <SecondaryButton label="Retry crew" onPress={() => { void assignments.refetch(); }} /></View>;
  return <View style={{ gap: 16 }}>
    <Text allowFontScaling style={{ color: colors.mutedForeground }}>{day} · project timezone</Text>
    {crew.length === 0 ? <EmptyState icon="users" title="No crew assigned today" description="Assign workers to this project in the Workers tab." /> : <>
      {crew.map(a => <CrewEntry key={a.id} assignment={a} day={day} />)}
      {can['work.record'] ? <Card>
        <Text allowFontScaling style={{ color: colors.foreground }}>No work for the whole crew?</Text>
        <Text allowFontScaling style={{ color: colors.mutedForeground, lineHeight: 21 }}>
          This marks only unrecorded crew as no-work today. Existing work records are kept.
        </Text>
        {confirm ? <>
          <PrimaryButton label={noWork.isPending ? 'Recording…' : 'Confirm no-work for unrecorded crew'}
            testID="today-no-work-confirm" disabled={noWork.isPending}
            onPress={() => { void noWork.mutateAsync({ project_id: projectId!, date: day })
              .then(() => setConfirm(false)).catch(() => undefined); }} />
          <SecondaryButton label="Cancel" disabled={noWork.isPending} onPress={() => setConfirm(false)} />
        </> : <SecondaryButton label="No work today — unrecorded crew" testID="today-no-work"
          onPress={() => { noWork.reset(); setConfirm(true); }} />}
        {noWork.isSuccess ? <Notice tone="info">{`No-work recorded for ${noWork.data.marked} crew members.`}</Notice> : null}
        {noWork.isError ? <Notice>{domainError(noWork.error)}</Notice> : null}
      </Card> : null}
    </>}
    <Text allowFontScaling style={{ color: colors.mutedForeground, lineHeight: 21 }}>
      CrewTally records work and payments. It never moves money.
    </Text>
  </View>;
}

function CrewEntry({ assignment, day }: { assignment: JsonDto<Assignment>; day: string }) {
  const scope = useDomainScope();
  const { can } = useWorkspace();
  const colors = useColors();
  const rates = useRates(assignment.id);
  const entries = useQuery<JsonDto<WorkEntry>[]>({
    queryKey: [...scope, 'entries', assignment.id, day],
    queryFn: ({ signal }) => listWorkEntries({ assignment_id: assignment.id, from: day, to: day }, { signal }),
    staleTime: 0, refetchInterval: 30000,
  });
  const write = useDomainMutation<Omit<WorkInput, 'operation_id'>, RecordWork200>(recordWork);
  const [portion, setPortion] = useState('0.5');
  const [minutes, setMinutes] = useState('480');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'full' | 'partial' | 'none'>('full');
  const agreement = rates.data?.filter(r => r.effective_from <= day)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  const entry = entries.data?.find(e => e.work_date === day);
  const minuteValue = parseCents(minutes, 1440);
  let validPortion = false;
  try { portionToTenThousandths(portion); validPortion = true; } catch { /* invalid input */ }
  const inputMode = mode === 'none' ? 'NO_WORK' : agreement?.pay_basis === 'HOUR' ? 'HOUR_MINUTES' : 'DAY_PORTION';
  const inputPortion = inputMode === 'DAY_PORTION' ? (mode === 'full' ? '1' : portion) : undefined;
  const valid = mode === 'none' || !!agreement && (agreement.pay_basis === 'HOUR' ? minuteValue !== null : mode === 'full' || validPortion);
  let preview: number | null = null;
  if (valid && agreement) {
    preview = earnedMinor({
      basis: agreement.pay_basis, rateMinor: agreement.rate_minor, mode: inputMode,
      portion: inputPortion, minutes: inputMode === 'HOUR_MINUTES' ? minuteValue : undefined,
      standardDayMinutes: agreement.standard_day_minutes,
    });
  }
  const busy = write.isPending || entries.isFetching || rates.isFetching;
  const save = () => {
    if (!valid || (entry && !reason.trim())) return;
    void write.mutateAsync({
      assignment_id: assignment.id, date: day, mode: inputMode,
      expected_version: entry?.version ?? 0,
      ...(inputPortion ? { portion: inputPortion } : {}),
      ...(inputMode === 'HOUR_MINUTES' ? { minutes: minuteValue! } : {}),
      ...(entry ? { reason: reason.trim() } : {}),
    }).then(() => setReason('')).catch(() => undefined);
  };
  return <Card>
    <Text allowFontScaling accessibilityRole="header" style={{ color: colors.foreground, fontSize: 20, fontWeight: '600' }}>
      {assignment.display_name ?? 'Worker'}
    </Text>
    {entries.isPending || rates.isPending ? <Text style={{ color: colors.mutedForeground }}>Loading today’s record…</Text>
      : entries.isError || rates.isError ? <>
        <Notice>Could not load the work record or rate.</Notice>
        <SecondaryButton label="Retry work details" onPress={() => { void entries.refetch(); void rates.refetch(); }} />
      </> : <>
        {entry ? <>
          <Text allowFontScaling style={{ color: colors.foreground }}>
            {entry.input_mode === 'NO_WORK' ? 'No-work recorded' : entry.input_mode === 'VOID' ? 'Voided' : 'Work recorded'}
          </Text>
          <Text allowFontScaling style={{ color: colors.mutedForeground }}>Recorded earnings · server calculated</Text>
          <Money testID={`earned-${assignment.id}`} cents={entry.earned_minor} />
        </> : <StatusLabel status="unrecorded" />}
        {!agreement ? <Notice>Set a rate in Workers before recording paid work. You can still record no-work.</Notice> : null}
        {can['work.record'] ? <>
          <SecondaryButton label={mode === 'full' ? 'Selected: Full day' : 'Full day'} testID={`full-day-${assignment.id}`}
            disabled={write.isPending || !agreement} onPress={() => setMode('full')} />
          <SecondaryButton label={mode === 'partial' ? 'Selected: Partial day' : 'Partial day'} testID={`partial-day-${assignment.id}`}
            disabled={write.isPending || !agreement} onPress={() => setMode('partial')} />
          <SecondaryButton label={mode === 'none' ? 'Selected: No work' : 'No work'} testID={`no-work-${assignment.id}`}
            disabled={write.isPending} onPress={() => setMode('none')} />
          {mode !== 'none' && agreement?.pay_basis === 'HOUR' ? <Field
            label={mode === 'full' ? 'Full-day minutes' : 'Minutes worked'} hint="Whole minutes, 1–1440. A full day starts at 480 minutes; adjust to the actual day."
            value={minutes} onChangeText={setMinutes} keyboardType="number-pad" maxLength={4} testID={`minutes-${assignment.id}`} /> : null}
          {mode === 'partial' && agreement?.pay_basis === 'DAY' ? <Field label="Day portion" hint="Decimal text from 0.0001 to 1, for example 0.5."
            value={portion} onChangeText={setPortion} keyboardType="decimal-pad" maxLength={6} testID={`portion-${assignment.id}`} /> : null}
          {preview !== null ? <View style={{ gap: 6 }}>
            <Text allowFontScaling style={{ color: colors.mutedForeground }}>Earnings preview only — the server recomputes when saved.</Text>
            <Money testID={`preview-${assignment.id}`} cents={preview} />
          </View> : null}
          {entry ? <Field label="Reason for replacing today’s record" value={reason} onChangeText={setReason}
            maxLength={500} testID={`work-reason-${assignment.id}`} /> : null}
          <PrimaryButton testID={`work-save-${assignment.id}`} label={write.isPending ? 'Recording…' : entry ? 'Replace work record' : mode === 'none' ? 'Record no-work' : 'Record work'}
            disabled={busy || !valid || !!entry && !reason.trim()} onPress={save} />
          {write.isSuccess ? <Notice tone="info">Work record saved. Earnings were computed by the server.</Notice> : null}
          {write.isError ? <><Notice>{domainError(write.error)}</Notice>
            <SecondaryButton label="Refresh work record" onPress={() => { void entries.refetch(); void rates.refetch(); }} /></> : null}
        </> : null}
      </>}
  </Card>;
}
