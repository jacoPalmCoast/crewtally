import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'test-operation') }));
jest.mock('@workspace/api-client-react', () => ({ healthCheck: jest.fn(async () => ({ status: 'ok', db: 'ok', migrations: 3 })) }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }) }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: 'caller' }) }));
const mockWorkspace = {
  workspaceId: 'home', workspace: { id: 'home', name: 'My home', kind: 'HOME', role: 'ORGANIZER' },
  role: 'ORGANIZER', kind: 'HOME', can: { 'members.manage': true }, afterLeaving: jest.fn(),
};
jest.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => mockWorkspace }));
jest.mock('@/lib/mobileApi', () => ({
  getMembers: jest.fn(), getInvitations: jest.fn(), createInvitation: jest.fn(),
  revokeInvitation: jest.fn(), removeMember: jest.fn(),
}));

import * as api from '@/lib/mobileApi';
import PartnerScreen from '@/app/partner';
import MoreScreen from '@/app/(tabs)/more';

const mocked = api as jest.Mocked<typeof api>;
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity },
    mutations: { retry: false, gcTime: Infinity },
  } });
  mocked.getMembers.mockResolvedValue({ members: [] });
  mocked.getInvitations.mockResolvedValue({ invitations: [] });
  mockWorkspace.role = 'ORGANIZER';
  mockWorkspace.can['members.manage'] = true;
  mockWorkspace.afterLeaving.mockResolvedValue(undefined);
});
afterEach(async () => {
  await client.cancelQueries();
  cleanup();
  client.clear();
});

it('Resend creates a replacement when the revoke step returns 404', async () => {
  mocked.getInvitations.mockResolvedValue({ invitations: [{
    id: 'old-invitation', invitee_name: 'Reference label', email: 'fixture@example.com',
    role: 'PARTNER', status: 'PENDING', expires_at: '2099-01-01T00:00:00Z',
  }] });
  mocked.revokeInvitation.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
  mocked.createInvitation.mockResolvedValue({
    id: 'new-invitation', token: null, code: null, link: null, already_created: true,
  });
  render(<PartnerScreen />, { wrapper });
  await waitFor(() => screen.getByTestId('partner-resend'));
  fireEvent.press(screen.getByTestId('partner-resend'));
  await waitFor(() => expect(mocked.createInvitation).toHaveBeenCalledWith(
    { role: 'PARTNER', email: 'fixture@example.com', name: 'Reference label' }, 'test-operation',
  ));
  expect(mocked.revokeInvitation).toHaveBeenCalledWith('old-invitation', 'test-operation');
  await waitFor(() => screen.getByText('Invitation already created'));
  await waitFor(() => expect(screen.getByTestId('partner-resend').props.accessibilityState.disabled).toBe(false));
  expect(screen.queryByTestId('partner-error')).toBeNull();
});

it('Leave treats 404 as already left, cleans workspace state and opens the switcher', async () => {
  mockWorkspace.role = 'PARTNER';
  mockWorkspace.can['members.manage'] = false;
  mocked.removeMember.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
  render(<MoreScreen />, { wrapper });
  fireEvent.press(screen.getByTestId('more-leave'));
  fireEvent.press(screen.getByTestId('leave-confirm'));
  await waitFor(() => expect(mockWorkspace.afterLeaving).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/switcher'));
  expect(mocked.removeMember).toHaveBeenCalledWith('caller', 'test-operation');
  expect(screen.queryByText('Could not leave. Check your connection and try again.')).toBeNull();
});