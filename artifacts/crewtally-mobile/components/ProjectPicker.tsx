import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { createProject } from '@workspace/api-client-react';
import type { ProjectInput, Project } from '@workspace/api-zod';
import { useProject } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useColors } from '@/hooks/useColors';
import { useDomainAccess, useDomainMutation, useDomainScope, domainError } from '@/lib/domain';
import type { JsonDto } from '@/lib/api';
import { getActiveWorkspaceId } from '@/lib/authEvents';
import { Card } from './Card';
import { Field } from './Field';
import { Notice } from './Notice';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';

export function ProjectPicker() {
  const { project, projects, selectProject, loading, error, storageError, retry } = useProject();
  const { workspace, workspaceId, can } = useWorkspace();
  const allowed = useDomainAccess();
  const colors = useColors();
  const scope = useDomainScope();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(workspace?.default_timezone ?? 'UTC');
  const create = useDomainMutation<Omit<ProjectInput, 'operation_id'>, JsonDto<Project>>(createProject);
  let validZone = false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); validZone = true; } catch { /* invalid input */ }
  if (!allowed) return null;
  return <View style={{ gap: 12, marginBottom: 16 }}>
    <SecondaryButton testID="project-picker" label={loading ? 'Loading projects…' : `Project: ${project?.name ?? 'Choose or create a project'}`}
      onPress={() => setExpanded(!expanded)} />
    {error ? <><Notice>Could not load projects.</Notice><SecondaryButton label="Retry projects" onPress={retry} /></> : null}
    {storageError ? <Notice>{storageError}</Notice> : null}
    {expanded || (!loading && !error && projects.length === 0) ? <Card>
      {projects.map(p => <SecondaryButton key={p.id} testID={`project-select-${p.id}`}
        disabled={create.isPending}
        label={`${p.id === project?.id ? 'Selected: ' : ''}${p.name}`}
        onPress={() => { void selectProject(p.id); setExpanded(false); }} />)}
      {can['projects.manage'] ? <>
        <Text allowFontScaling accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontWeight: '600' }}>New project</Text>
        <Field label="Project name" testID="project-name" value={name} onChangeText={setName} maxLength={80} editable={!create.isPending} />
        <Field label="Project timezone" testID="project-timezone" hint="For example, America/New_York. Today follows this timezone."
          value={timezone} onChangeText={setTimezone} maxLength={100} autoCapitalize="none" autoCorrect={false} />
        <PrimaryButton testID="project-create" label={create.isPending ? 'Creating…' : 'Create project'}
          disabled={create.isPending || !name.trim() || !validZone} onPress={() => {
            void create.mutateAsync({ name: name.trim(), timezone }).then(async created => {
              if (getActiveWorkspaceId() !== workspaceId) return;
              qc.setQueryData<JsonDto<Project>[]>([...scope, 'projects'], old =>
                [...(old ?? []).filter(p => p.id !== created.id), created]);
              await selectProject(created.id);
              setName(''); setExpanded(false);
            }).catch(() => undefined);
          }} />
        {create.isError ? <Notice>{domainError(create.error)}</Notice> : null}
      </> : <Text allowFontScaling style={{ color: colors.mutedForeground }}>Ask the organizer or manager to create a project.</Text>}
    </Card> : null}
  </View>;
}
