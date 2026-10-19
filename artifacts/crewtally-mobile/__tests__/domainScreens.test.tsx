import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Assignment, Worker, Project, RateAgreement, WorkEntry, Payment, WorkspaceAccess } from '@workspace/api-zod';
import type { JsonDto } from '@/lib/api';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
let mockNextOperation = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `operation-${++mockNextOperation}` }));
const saved: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true, default: {
    getItem: jest.fn(async (key: string) => saved[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => { saved[key] = value; }),
  },
}));
const WS = '11111111-2222-4333-8444-555555555555';
const P = '22222222-2222-4333-8444-555555555555';
const mockAuth = { userId: 'u1', status: 'signedIn' };
const mockWorkspace: { phase: string; workspaceId: string; workspace: JsonDto<WorkspaceAccess>; can: Record<string, boolean> } = {
  phase: 'ready', workspaceId: WS,
  workspace: {
    id: WS, name: 'Test home', kind: 'HOME', role: 'ORGANIZER', financial_access: true,
    currency: 'USD', default_timezone: 'UTC', worker_id: null, can: {},
  },
  can: {},
};
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => mockWorkspace }));
jest.mock('@workspace/api-client-react', () => ({
  ...jest.requireActual('@workspace/api-client-react'),
  listProjects: jest.fn(), createProject: jest.fn(),
  listWorkers: jest.fn(), createWorker: jest.fn(), updateWorker: jest.fn(),
  listBalances: jest.fn(), listAssignments: jest.fn(), createAssignment: jest.fn(),
  listRates: jest.fn(), applyRateChange: jest.fn(),
  listWorkEntries: jest.fn(), recordWork: jest.fn(), markRestNoWork: jest.fn(),
  listPayments: jest.fn(), recordPayment: jest.fn(), clearPayment: jest.fn(), reversePayment: jest.fn(),
}));
import * as Api from '@workspace/api-client-react';
import { setActiveWorkspaceId } from '@/lib/authEvents';
import { todayIn } from '@/lib/domain';
import { ProjectProvider } from '@/contexts/ProjectContext';
import WorkersScreen from '@/app/(tabs)/workers';
import TodayScreen from '@/app/(tabs)/index';
import PaymentsScreen from '@/app/(tabs)/payments';

const TODAY = todayIn('UTC');
const asMock = (fn: unknown) => fn as jest.Mock;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
let projects: JsonDto<Project>[];
let workers: JsonDto<Worker>[];
let assignments: JsonDto<Assignment>[];
let rates: Record<string, JsonDto<RateAgreement>[]>;
let entries: Record<string, JsonDto<WorkEntry>[]>;
let balances: Record<string, number>;
let payments: JsonDto<Payment>[];
let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={qc}><ProjectProvider>{children}</ProjectProvider></QueryClientProvider>;
const worker = (id: string, name: string): JsonDto<Worker> => ({
  id, display_name: name, phone: null, email: null, status: 'ACTIVE', document_language: 'en', version: 0,
});
const assignment = (id: string, workerId: string, name: string): JsonDto<Assignment> => ({
  id, project_id: P, worker_id: workerId, display_name: name, start_date: '2000-01-01', end_date: null, version: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockNextOperation = 0;
  Object.keys(saved).forEach(key => delete saved[key]);
  mockAuth.userId = 'u1';
  mockWorkspace.workspaceId = WS;
  mockWorkspace.workspace.kind = 'HOME'; mockWorkspace.workspace.role = 'ORGANIZER';
  mockWorkspace.can = {
    'workspace.read': true, 'projects.manage': true, 'people.add': true,
    'rates.set': true, 'work.record': true, 'money.view': true, 'money.record': true,
  };
  qc = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity },
  } });
  setActiveWorkspaceId(WS);
  projects = [{ id: P, name: 'Garden', timezone: 'UTC', address: null, status: 'ACTIVE', work_days: [1, 2, 3, 4, 5], version: 0 }];
  workers = [worker('w1', 'Alex'), worker('w2', 'Blair')];
  assignments = [assignment('a1', 'w1', 'Alex'), assignment('a2', 'w2', 'Blair')];
  rates = Object.fromEntries(assignments.map(a => [a.id, [{
    id: `r-${a.id}`, effective_from: '2000-01-01', pay_basis: 'DAY', rate_minor: 20000, standard_day_minutes: null,
  }]]));
  entries = {}; balances = {}; payments = [];
  asMock(Api.listProjects).mockImplementation(async () => clone(projects));
  asMock(Api.createProject).mockImplementation(async input => {
    const p: JsonDto<Project> = { id: 'p-new', name: input.name, timezone: input.timezone,
      address: null, status: 'ACTIVE', work_days: [1, 2, 3, 4, 5], version: 0 };
    projects.push(p); return clone(p);
  });
  asMock(Api.listWorkers).mockImplementation(async () => clone(workers));
  asMock(Api.createWorker).mockImplementation(async input => {
    const w = { ...worker('w3', input.display_name), phone: input.phone ?? null };
    workers.push(w); return clone(w);
  });
  asMock(Api.updateWorker).mockImplementation(async (id, input) => {
    const w = workers.find(w => w.id === id)!;
    Object.assign(w, input); return clone(w);
  });
  asMock(Api.listAssignments).mockImplementation(async id => clone(assignments.filter(a => a.project_id === id)));
  asMock(Api.createAssignment).mockImplementation(async (projectId, input) => {
    const w = workers.find(w => w.id === input.worker_id)!;
    const a = { ...assignment('a3', w.id, w.display_name), project_id: projectId, start_date: input.start_date };
    assignments.push(a); return clone(a);
  });
  asMock(Api.listRates).mockImplementation(async id => clone(rates[id] ?? []));
  asMock(Api.applyRateChange).mockImplementation(async (id, input) => {
    rates[id] = [...(rates[id] ?? []), { id: 'new-rate', effective_from: input.effective_from,
      pay_basis: input.pay_basis, rate_minor: input.rate_minor, standard_day_minutes: input.standard_day_minutes ?? null }];
    return { rate_id: 'new-rate', corrected_days: 0, total_delta_minor: 0 };
  });
  asMock(Api.listWorkEntries).mockImplementation(async input => clone(entries[input.assignment_id] ?? []));
  asMock(Api.recordWork).mockImplementation(async input => {
    // Authoritative server responses are mocked, not inferred by the screen.
    const value = input.mode === 'NO_WORK' ? 0 : 20000;
    const previous = entries[input.assignment_id]?.[0]?.earned_minor ?? 0;
    entries[input.assignment_id] = [{ work_date: input.date, version: input.expected_version + 1,
      input_mode: input.mode, portion: input.portion ?? null, minutes: input.minutes ?? null, earned_minor: value }];
    balances[input.assignment_id] = (balances[input.assignment_id] ?? 0) + value - previous;
    return { entry_id: 'entry', version: input.expected_version + 1, revision: 1, earned_minor: value, delta_minor: value - previous };
  });
  asMock(Api.markRestNoWork).mockImplementation(async input => {
    let marked = 0;
    for (const a of assignments.filter(a => a.project_id === input.project_id)) {
      if (entries[a.id]?.length) continue;
      entries[a.id] = [{ work_date: input.date, version: 1, input_mode: 'NO_WORK', portion: null, minutes: null, earned_minor: 0 }];
      marked++;
    }
    return { marked };
  });
  asMock(Api.listBalances).mockImplementation(async () => assignments.map(a => ({
    assignment_id: a.id, worker_id: a.worker_id, project_id: a.project_id, balance_minor: balances[a.id] ?? 0,
  })));
  asMock(Api.listPayments).mockImplementation(async () => clone(payments));
  asMock(Api.recordPayment).mockImplementation(async input => {
    payments.push({ id: 'pay1', payment_date: input.date, receipt_no: 1, method: input.method,
      method_note: input.method_note ?? null, reference: null, note: null, recipient_label: input.recipient,
      amount_minor: input.amount_minor, clearance: input.method === 'CHECK' ? 'ISSUED' : null,
      replaces_payment_id: null, version: 0,
      allocations: input.allocations.map((a: PaymentInputAllocation, i: number) => ({ ...a, id: `alloc-${i}` })),
    });
    input.allocations.forEach((a: PaymentInputAllocation) => { balances[a.assignment_id] = (balances[a.assignment_id] ?? 0) - a.amount_minor; });
    return { payment_id: 'pay1', receipt_no: 1, version: 0 };
  });
  asMock(Api.clearPayment).mockImplementation(async id => {
    const p = payments.find(p => p.id === id)!;
    p.clearance = 'CLEARED'; p.version++;
    return { payment_version: p.version, clearance: 'CLEARED' };
  });
  asMock(Api.reversePayment).mockImplementation(async id => {
    const p = payments.find(p => p.id === id)!;
    p.allocations.forEach(a => { balances[a.assignment_id] = (balances[a.assignment_id] ?? 0) + a.amount_minor; });
    p.version++;
    return { reversal_id: 'rev', payment_version: p.version, reversed_minor: p.amount_minor, unreversed_minor: 0 };
  });
});
// A derivation of the shared contract for fixture callbacks, not a duplicate DTO.
type PaymentInputAllocation = import('@workspace/api-zod').PaymentInput['allocations'][number];
afterEach(() => { cleanup(); qc.clear(); setActiveWorkspaceId(null); });

it('adds a worker, assigns the project, and sets their daily rate in integer cents', async () => {
  render(<WorkersScreen />, { wrapper });
  await screen.findByTestId('worker-name');
  fireEvent.changeText(screen.getByTestId('worker-name'), 'Casey');
  fireEvent.press(screen.getByTestId('worker-create'));
  await screen.findByText('Casey');
  fireEvent.press(screen.getByTestId('worker-assign-w3'));
  await screen.findByTestId('rate-cents-w3');
  fireEvent.changeText(screen.getByTestId('rate-cents-w3'), '15000');
  fireEvent.press(screen.getByTestId('rate-save-w3'));
  await screen.findByText('Rate saved.');
  expect(Api.createWorker).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Casey', operation_id: expect.any(String) }));
  expect(Api.createAssignment).toHaveBeenCalledWith(P, expect.objectContaining({ worker_id: 'w3', operation_id: expect.any(String) }));
  expect(Api.applyRateChange).toHaveBeenCalledWith('a3', expect.objectContaining({ pay_basis: 'DAY', rate_minor: 15000, operation_id: expect.any(String) }));
});

it('edits a worker and replaces a rate starting on a different date', async () => {
  render(<WorkersScreen />, { wrapper });
  fireEvent.press(await screen.findByTestId('worker-edit-w1'));
  // The edit form and add form have the same label; pick the worker-specific save area via the visible current value.
  fireEvent.changeText(screen.getByDisplayValue('Alex'), 'Alexandra');
  fireEvent.press(screen.getByTestId('worker-save-w1'));
  await screen.findByText('Alexandra');
  expect(Api.updateWorker).toHaveBeenCalledWith('w1', expect.objectContaining({ display_name: 'Alexandra', operation_id: expect.any(String) }));
  fireEvent.changeText(screen.getByTestId('rate-cents-w1'), '18000');
  fireEvent.press(screen.getByTestId('rate-basis-HOUR-w1'));
  fireEvent.press(screen.getByTestId('rate-save-w1'));
  await screen.findByText('Rate saved.');
  expect(Api.applyRateChange).toHaveBeenCalledWith('a1', expect.objectContaining({
    effective_from: TODAY, pay_basis: 'HOUR', rate_minor: 18000, standard_day_minutes: null,
  }));
});

it('requires explicit confirmation and a reason before repricing recorded work', async () => {
  asMock(Api.applyRateChange).mockRejectedValueOnce({ status: 409, code: 'CONFIRMATION_REQUIRED' });
  render(<WorkersScreen />, { wrapper });
  await screen.findByTestId('rate-cents-w1');
  fireEvent.changeText(screen.getByTestId('rate-cents-w1'), '25000');
  fireEvent.press(screen.getByTestId('rate-save-w1'));
  await screen.findByLabelText('Reason (required)');
  fireEvent.press(screen.getByRole('checkbox'));
  expect(screen.getByTestId('rate-save-w1')).toBeDisabled();
  expect(Api.applyRateChange).toHaveBeenCalledTimes(1);
  fireEvent.changeText(screen.getByLabelText('Reason (required)'), 'Correct agreed rate');
  fireEvent.press(screen.getByTestId('rate-save-w1'));
  await screen.findByText('Rate saved.');
  expect(Api.applyRateChange).toHaveBeenLastCalledWith('a1', expect.objectContaining({
    confirm: true, reason: 'Correct agreed rate', rate_minor: 25000,
  }));
});

it('creates a project from the header and persists it as the active selection', async () => {
  render(<WorkersScreen />, { wrapper });
  await waitFor(() => expect(screen.getByTestId('project-picker')).toHaveTextContent('Project: Garden'));
  fireEvent.press(screen.getByTestId('project-picker'));
  fireEvent.changeText(screen.getByTestId('project-name'), 'Kitchen');
  fireEvent.press(screen.getByTestId('project-create'));
  await waitFor(() => expect(screen.getByTestId('project-picker')).toHaveTextContent('Project: Kitchen'));
  expect(Api.createProject).toHaveBeenCalledWith({ name: 'Kitchen', timezone: 'UTC', operation_id: expect.any(String) });
  expect(saved[`crewtally.project.v1.u1.${WS}`]).toBe('p-new');
});

it('keeps a partial-day portion as decimal text and uses integer-only preview rounding', async () => {
  render(<TodayScreen />, { wrapper });
  fireEvent.press(await screen.findByTestId('partial-day-a1'));
  fireEvent.changeText(screen.getByTestId('portion-a1'), '0.3333');
  expect(screen.getByTestId('preview-a1')).toHaveTextContent('$66.66');
  fireEvent.press(screen.getByTestId('work-save-a1'));
  await screen.findByTestId('earned-a1');
  expect(Api.recordWork).toHaveBeenCalledWith(expect.objectContaining({ mode: 'DAY_PORTION', portion: '0.3333' }));
  // The server's response is shown even when it differs from a local preview.
  expect(screen.getByTestId('earned-a1')).toHaveTextContent('$200.00');
});

it('logs hourly full-day minutes using the selected rate only for the preview', async () => {
  rates.a1 = [{ ...rates.a1[0], pay_basis: 'HOUR', rate_minor: 1500 }];
  render(<TodayScreen />, { wrapper });
  await screen.findByTestId('minutes-a1');
  expect(screen.getByTestId('preview-a1')).toHaveTextContent('$120.00');
  fireEvent.press(screen.getByTestId('work-save-a1'));
  await screen.findByTestId('earned-a1');
  expect(Api.recordWork).toHaveBeenCalledWith(expect.objectContaining({ mode: 'HOUR_MINUTES', minutes: 480 }));
});

it('records a full day and individual no-work without presenting the preview as a balance', async () => {
  render(<TodayScreen />, { wrapper });
  await screen.findByTestId('work-save-a1');
  expect(screen.getAllByText('Earnings preview only — the server recomputes when saved.')).toHaveLength(2);
  fireEvent.press(screen.getByTestId('work-save-a1'));
  await screen.findByTestId('earned-a1');
  expect(Api.recordWork).toHaveBeenCalledWith(expect.objectContaining({ assignment_id: 'a1', mode: 'DAY_PORTION', portion: '1', expected_version: 0 }));
  fireEvent.press(screen.getByTestId('no-work-a2'));
  fireEvent.press(screen.getByTestId('work-save-a2'));
  await screen.findByText('No-work recorded');
  expect(Api.recordWork).toHaveBeenLastCalledWith(expect.objectContaining({ assignment_id: 'a2', mode: 'NO_WORK', operation_id: expect.any(String) }));
  expect(screen.getByTestId('earned-a1')).toHaveTextContent('$200.00');
  expect(screen.getByTestId('earned-a2')).toHaveTextContent('$0.00');
});

it('marks unrecorded crew as no-work through the bulk operation after explicit confirmation', async () => {
  render(<TodayScreen />, { wrapper });
  fireEvent.press(await screen.findByTestId('today-no-work'));
  fireEvent.press(screen.getByTestId('today-no-work-confirm'));
  await screen.findByText('No-work recorded for 2 crew members.');
  expect(Api.markRestNoWork).toHaveBeenCalledWith({ project_id: P, date: TODAY, operation_id: expect.any(String) });
});

it('records work, splits a payment across two workers, and refetches authoritative balances', async () => {
  const view = render(<TodayScreen />, { wrapper });
  fireEvent.press(await screen.findByTestId('work-save-a1'));
  await screen.findByTestId('earned-a1');
  fireEvent.press(screen.getByTestId('work-save-a2'));
  await screen.findByTestId('earned-a2');
  view.rerender(<PaymentsScreen />);
  fireEvent.press(await screen.findByTestId('payment-open'));
  await screen.findByTestId('allocation-a1');
  fireEvent.changeText(screen.getByTestId('payment-recipient'), 'Crew');
  fireEvent.changeText(screen.getByTestId('payment-cents'), '10000');
  fireEvent.changeText(screen.getByTestId('allocation-a1'), '4000');
  fireEvent.changeText(screen.getByTestId('allocation-a2'), '6000');
  fireEvent.press(screen.getByTestId('payment-save'));
  await screen.findByText('Payment record saved. No money was moved by CrewTally.');
  expect(Api.recordPayment).toHaveBeenCalledWith(expect.objectContaining({
    method: 'CASH', amount_minor: 10000, operation_id: expect.any(String),
    allocations: [{ assignment_id: 'a1', amount_minor: 4000 }, { assignment_id: 'a2', amount_minor: 6000 }],
  }));
  view.rerender(<WorkersScreen />);
  await waitFor(() => expect(screen.getByTestId('balance-w1')).toHaveTextContent('$160.00'));
  expect(screen.getByTestId('balance-w2')).toHaveTextContent('$140.00');
});

it('rejects decimal cents and mismatched allocation totals before submitting', async () => {
  render(<PaymentsScreen />, { wrapper });
  fireEvent.press(await screen.findByTestId('payment-open'));
  await screen.findByTestId('allocation-a1');
  fireEvent.changeText(screen.getByTestId('payment-recipient'), 'Alex');
  fireEvent.changeText(screen.getByTestId('payment-cents'), '10.50');
  fireEvent.changeText(screen.getByTestId('allocation-a1'), '1050');
  expect(screen.getByTestId('payment-save')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('payment-cents'), '1000');
  expect(screen.getByTestId('payment-save')).toBeDisabled();
  expect(Api.recordPayment).not.toHaveBeenCalled();
});

it('records check clearance and an explicit reversal, preserving version checks', async () => {
  payments = [{ id: 'pay1', payment_date: TODAY, receipt_no: 1, method: 'CHECK', method_note: null,
    reference: null, note: null, recipient_label: 'Crew', amount_minor: 10000, clearance: 'ISSUED',
    replaces_payment_id: null, version: 0,
    allocations: [{ id: 'alloc1', assignment_id: 'a1', amount_minor: 10000 }],
  }];
  render(<PaymentsScreen />, { wrapper });
  fireEvent.press(await screen.findByTestId('payment-clear-pay1'));
  await screen.findByText('Check cleared');
  expect(Api.clearPayment).toHaveBeenCalledWith('pay1', { expected_version: 0, operation_id: expect.any(String) });
  fireEvent.press(screen.getByTestId('payment-reverse-pay1'));
  fireEvent.changeText(screen.getByTestId('reverse-reason-pay1'), 'Duplicate record');
  fireEvent.press(screen.getByTestId('payment-reverse-confirm-pay1'));
  await screen.findByText('Reversal recorded. Remaining unreversed cents: 0. No money was moved.');
  expect(Api.reversePayment).toHaveBeenCalledWith('pay1', expect.objectContaining({ kind: 'FULL', reason: 'Duplicate record', expected_version: 1, operation_id: expect.any(String) }));
});

it('reuses operation_id for an uncertain payment failure and retry', async () => {
  asMock(Api.recordPayment).mockRejectedValueOnce(new TypeError('offline'));
  render(<PaymentsScreen />, { wrapper });
  fireEvent.press(await screen.findByTestId('payment-open'));
  await screen.findByTestId('allocation-a1');
  fireEvent.changeText(screen.getByTestId('payment-recipient'), 'Crew');
  fireEvent.changeText(screen.getByTestId('payment-cents'), '1000');
  fireEvent.changeText(screen.getByTestId('allocation-a1'), '1000');
  fireEvent.press(screen.getByTestId('payment-save'));
  await screen.findByText('Could not connect to CrewTally. Check your connection and try again.');
  fireEvent.press(screen.getByTestId('payment-save'));
  await screen.findByText('Payment record saved. No money was moved by CrewTally.');
  expect(asMock(Api.recordPayment).mock.calls[0][0]).toEqual(asMock(Api.recordPayment).mock.calls[1][0]);
});

it('keeps Business LEAD domain data unavailable despite workspace-wide can flags', async () => {
  mockWorkspace.workspace.kind = 'BUSINESS';
  mockWorkspace.workspace.role = 'LEAD';
  render(<WorkersScreen />, { wrapper });
  await screen.findByText('Access unavailable');
  expect(Api.listWorkers).not.toHaveBeenCalled();
  expect(Api.listProjects).not.toHaveBeenCalled();
  expect(Api.listBalances).not.toHaveBeenCalled();
});
