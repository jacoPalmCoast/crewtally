import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listProjects } from '@workspace/api-client-react';
import type { Project } from '@workspace/api-zod';
import { useAuth } from './AuthContext';
import { useWorkspace } from './WorkspaceContext';
import type { JsonDto } from '@/lib/api';
import { domainAvailable } from '@/lib/domainUtils';

interface ProjectValue {
  projectId: string | null;
  project: JsonDto<Project> | null;
  projects: JsonDto<Project>[];
  selectProject: (id: string) => Promise<void>;
  loading: boolean;
  error: unknown;
  storageError: string | null;
  retry: () => void;
}
const ProjectContext = createContext<ProjectValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const { workspaceId } = useWorkspace();
  // Remount all project-scoped forms when the tenant/person changes.
  return <ProjectSession key={`${userId}:${workspaceId}`} >{children}</ProjectSession>;
}

function ProjectSession({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { workspaceId, workspace, phase } = useWorkspace();
  const enabled = phase === 'ready' && !!userId && !!workspaceId && domainAvailable(workspace);
  const projects = useQuery<JsonDto<Project>[]>({
    queryKey: ['ws', workspaceId, 'domain', userId, 'projects'],
    queryFn: ({ signal }) => listProjects({ signal }), enabled,
    staleTime: 15000, refetchInterval: 60000,
  });
  const storageKey = `crewtally.project.v1.${userId}.${workspaceId}`;
  const [selected, setSelected] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const selectionVersion = useRef(0);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let current = true;
    const version = selectionVersion.current;
    void AsyncStorage.getItem(storageKey).then(saved => {
      if (current && version === selectionVersion.current) setSelected(saved);
    }).catch(() => {
      if (current) setStorageError('Could not restore the last project. Choose a project below.');
    }).finally(() => { if (current) setRestored(true); });
    return () => { current = false; };
  }, [storageKey]);

  const save = (id: string) => {
    // Serialize writes: a slow older selection must not overwrite a newer one.
    const pending = writes.current.then(() => AsyncStorage.setItem(storageKey, id));
    writes.current = pending.catch(() => undefined);
    return pending.then(() => setStorageError(null)).catch(() => {
      setStorageError('Project selected, but it could not be saved for next time.');
    });
  };
  const list = enabled ? projects.data ?? [] : [];
  const project = restored ? list.find(p => p.id === selected) ?? list[0] ?? null : null;
  useEffect(() => {
    if (project && project.id !== selected) {
      selectionVersion.current += 1;
      setSelected(project.id);
      void save(project.id);
    }
  }, [project?.id, selected]);

  const selectProject = async (id: string) => {
    const latest = qc.getQueryData<JsonDto<Project>[]>(['ws', workspaceId, 'domain', userId, 'projects']);
    if (!enabled || !latest?.some(p => p.id === id)) return;
    selectionVersion.current += 1;
    setSelected(id);
    await save(id);
  };
  return <ProjectContext.Provider value={{
    projectId: project?.id ?? null, project, projects: list, selectProject,
    loading: enabled && (!restored || projects.isPending), error: projects.error,
    storageError, retry: () => { void projects.refetch(); },
  }}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectValue {
  const value = useContext(ProjectContext);
  if (!value) throw new Error('useProject must be used within a ProjectProvider');
  return value;
}
