import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  AppleAuthenticationButton: jest.fn((props) => {
    const { View } = jest.requireActual('react-native');
    return <View {...props} />;
  }),
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    status: 'signedOut', notice: null, message: null, busy: false,
    signIn: jest.fn(), retryRestore: jest.fn(),
  }),
}));

import * as AppleAuthentication from 'expo-apple-authentication';
import SignInScreen from '@/app/sign-in';

const check = jest.mocked(AppleAuthentication.isAvailableAsync);
const originalPlatform = Platform.OS;
let warning: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  check.mockReset().mockResolvedValue(true);
  warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  Platform.OS = originalPlatform;
  jest.restoreAllMocks();
});

it('iOS + available shows the native Apple button', async () => {
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-sign-in')).toBeTruthy());
  expect(check).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('apple-unavailable')).toBeNull();
  expect(screen.queryByTestId('apple-availability-error')).toBeNull();
});

it('iOS + unavailable shows the fallback only after a false result', async () => {
  check.mockResolvedValue(false);
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-unavailable')).toBeTruthy());
  expect(screen.getByText('Sign in with Apple is unavailable on this device.')).toBeTruthy();
  expect(screen.queryByTestId('apple-sign-in')).toBeNull();
  expect(screen.queryByTestId('apple-availability-error')).toBeNull();
  expect(warning).not.toHaveBeenCalled();
});

it('web shows the fallback without checking native Apple availability', async () => {
  Platform.OS = 'web';
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-unavailable')).toBeTruthy());
  expect(check).not.toHaveBeenCalled();
  expect(screen.queryByTestId('apple-sign-in')).toBeNull();
});

it('a rejected availability check is visible, not silently turned into fallback, and logs only its name', async () => {
  const error = Object.assign(new Error('private native detail — must never be logged'), {
    name: 'NativeAvailabilityError',
  });
  check.mockRejectedValue(error);
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-availability-error')).toBeTruthy());
  expect(screen.getByText('Could not check Apple sign-in. Please try again.')).toBeTruthy();
  expect(screen.queryByTestId('apple-unavailable')).toBeNull();
  expect(warning.mock.calls).toEqual([['NativeAvailabilityError']]);
  expect(screen.getByTestId('apple-availability-retry')).toBeTruthy();
});

it('retrying a failed check shows the native button when availability becomes true', async () => {
  check.mockRejectedValueOnce(new Error('not logged')).mockResolvedValueOnce(true);
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-availability-retry')).toBeTruthy());
  fireEvent.press(screen.getByTestId('apple-availability-retry'));
  await waitFor(() => expect(screen.getByTestId('apple-sign-in')).toBeTruthy());
  expect(check).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId('apple-availability-error')).toBeNull();
  expect(screen.queryByTestId('apple-unavailable')).toBeNull();
});

it('a synchronous check error is visible and logs no message or stack', async () => {
  check.mockImplementation(() => { throw new TypeError('private detail'); });
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-availability-error')).toBeTruthy());
  expect(screen.queryByTestId('apple-unavailable')).toBeNull();
  expect(warning.mock.calls).toEqual([['TypeError']]);
});