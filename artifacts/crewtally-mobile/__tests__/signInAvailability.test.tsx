import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => null) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { sdkVersion: '57.0.0', extra: { appEnv: 'development' } },
    expoVersion: '57.0.1',
    expoRuntimeVersion: '57.0.0',
  },
}));
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
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { version as appleAuthenticationVersion } from 'expo-apple-authentication/package.json';
import SignInScreen from '@/app/sign-in';

const check = jest.mocked(AppleAuthentication.isAvailableAsync);
const originalPlatform = Platform.OS;
const originalDev = __DEV__;
const nativeLookup = requireOptionalNativeModule as jest.Mock;
let warning: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true, writable: true });
  Constants.expoConfig!.extra!.appEnv = 'development';
  nativeLookup.mockReset().mockReturnValue(null);
  check.mockReset().mockResolvedValue(true);
  warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  Platform.OS = originalPlatform;
  Object.defineProperty(globalThis, '__DEV__', { value: originalDev, configurable: true, writable: true });
  jest.restoreAllMocks();
});

it('iOS + available shows the native Apple button', async () => {
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-sign-in')).toBeTruthy());
  expect(check).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('apple-unavailable')).toBeNull();
  expect(screen.queryByTestId('apple-availability-error')).toBeNull();
  expect(screen.queryByTestId('apple-runtime-diagnostics')).toBeNull();
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

it('development fallback displays only requested platform, native-module and version metadata', async () => {
  check.mockResolvedValue(false);
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-runtime-diagnostics')).toBeTruthy());
  const text = screen.getByTestId('apple-runtime-diagnostics').props.children;
  expect(text).toContain('Platform.OS=ios');
  expect(text).toContain(`Platform.Version=${Platform.Version}`);
  expect(text).toContain('ExpoAppleAuthentication=false');
  expect(text).toContain('SDK=57.0.0');
  expect(text).toContain('ExpoGo=57.0.1');
  expect(text).toContain('Runtime=57.0.0');
  expect(text).toContain(`expo-apple-authentication=${appleAuthenticationVersion}`);
  expect(nativeLookup).toHaveBeenCalledWith('ExpoAppleAuthentication');
});

it('development fallback reports a present native module as true', async () => {
  check.mockResolvedValue(false);
  nativeLookup.mockReturnValue({});
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-runtime-diagnostics')).toBeTruthy());
  expect(screen.getByTestId('apple-runtime-diagnostics').props.children).toContain('ExpoAppleAuthentication=true');
});

it('APP_ENV production hides diagnostics even in a development bundle and performs no native lookup', async () => {
  Constants.expoConfig!.extra!.appEnv = 'production';
  check.mockResolvedValue(false);
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-unavailable')).toBeTruthy());
  expect(screen.queryByTestId('apple-runtime-diagnostics')).toBeNull();
  expect(nativeLookup).not.toHaveBeenCalled();
});

it('a production bundle hides diagnostics regardless of the manifest environment label', async () => {
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true, writable: true });
  check.mockResolvedValue(false);
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-unavailable')).toBeTruthy());
  expect(screen.queryByTestId('apple-runtime-diagnostics')).toBeNull();
  expect(nativeLookup).not.toHaveBeenCalled();
});

it('a diagnostic lookup failure is explicit and does not render or log native error details', async () => {
  nativeLookup.mockImplementation(() => { throw new Error('private native detail'); });
  check.mockResolvedValue(false);
  render(<SignInScreen />);
  await waitFor(() => expect(screen.getByTestId('apple-runtime-diagnostics')).toBeTruthy());
  const text = screen.getByTestId('apple-runtime-diagnostics').props.children;
  expect(text).toContain('ExpoAppleAuthentication=lookup-error');
  expect(text).not.toContain('private native detail');
  expect(warning).not.toHaveBeenCalled();
});