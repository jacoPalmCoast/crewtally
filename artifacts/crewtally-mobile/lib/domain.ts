import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listWorkers, listBalances, listAssignments, listRates } from '@workspace/api-client-react';
import type { Worker, Assignment, RateAgreement, ListBalances200Item } from '@workspace/api-zod';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useProject } from '@/contexts/ProjectContext';
import { getActiveWorkspaceId } from './authEvents';
import { useOperationKeeper } from './operation';
import type { JsonDto } from './api';
import { domainAvailable } from './domainUtils';
export { parseCents, todayIn, validDate, domainError } from './domainUtils';

export function useDomainAccess(): boolean {
  const { workspace, phase } = useWorkspace();
  return phase === 'ready' && domainAvailable(workspace);
}
export function useDomainScope() {
  const { workspaceId } = useWorkspace();
  const { userId } = useAuth();
  return ['ws', workspaceId, 'domain', userId] as const;
}
export function useWorkers() {
  const scope = useDomainScope(), enabled = useDomainAccess();
  return useQuery<JsonDto<Worker>[]>({
    queryKey: [...scope, 'workers'], queryFn: ({ signal }) => listWorkers({ signal }),
    enabled, staleTime: 15000, refetchInterval: 60000,
  });
}
export function useBalances() {
  const scope = useDomainScope(), enabled = useDomainAccess();
  const { can } = useWorkspace();
  return useQuery<JsonDto<ListBalances200Item>[]>({
    queryKey: [...scope, 'balances'], queryFn: ({ signal }) => listBalances(undefined, { signal }),
    enabled: enabled && can['money.view'] === true, staleTime: 0, refetchInterval: 30000,
  });
}
export function useAssignments() {
  const scope = useDomainScope(), enabled = useDomainAccess();
  const { projectId } = useProject();
  return useQuery<JsonDto<Assignment>[]>({
    queryKey: [...scope, 'assignments', projectId],
    queryFn: ({ signal }) => listAssignments(projectId!, { signal }),
    enabled: enabled && !!projectId, staleTime: 15000, refetchInterval: 60000,
  });
}
export function useRates(assignmentId: string | null) {
  const scope = useDomainScope(), enabled = useDomainAccess();
  return useQuery<JsonDto<RateAgreement>[]>({
    queryKey: [...scope, 'rates', assignmentId],
    queryFn: ({ signal }) => listRates(assignmentId!, { signal }),
    enabled: enabled && !!assignmentId, staleTime: 15000, refetchInterval: 60000,
  });
}

/** A React Query mutation, not a second transport. IDs survive uncertain failures. */
export function useDomainMutation<T extends object, R>(
  write: (body: T & { operation_id: string }) => Promise<R>,
  identity = '',
) {
  const scope = useDomainScope();
  const qc = useQueryClient();
  const op = useOperationKeeper();
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const writeRef = useRef(write);
  writeRef.current = write;
  return useMutation({
    retry: false, // User-initiated retries keep the same operation id and exact body.
    mutationFn: async (input: T) => {
      if (getActiveWorkspaceId() !== scope[1] ||
          JSON.stringify(currentScope.current) !== JSON.stringify(scope)) {
        throw Object.assign(new Error('Workspace changed'), { code: 'SCOPE_CHANGED' });
      }
      const operation_id = op.idFor(JSON.stringify([scope, identity, input]));
      return writeRef.current({ ...input, operation_id });
    },
    onSuccess: async () => {
      op.done();
      // Never repopulate a previous tenant's cache after a workspace switch.
      if (JSON.stringify(currentScope.current) === JSON.stringify(scope) &&
          getActiveWorkspaceId() === scope[1]) {
        await qc.invalidateQueries({ queryKey: scope });
      }
    },
  });
}
