import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { version as appleAuthenticationVersion } from 'expo-apple-authentication/package.json';
import { useColors } from '@/hooks/useColors';

export function AppleRuntimeDiagnostics() {
  const colors = useColors();
  if (!__DEV__ || Constants.expoConfig?.extra?.appEnv === 'production') return null;

  let nativeModule: boolean | 'lookup-error';
  try {
    nativeModule = requireOptionalNativeModule('ExpoAppleAuthentication') != null;
  } catch {
    nativeModule = 'lookup-error';
  }

  // Allow-listed runtime metadata only: never render the manifest, environment,
  // device name, account identifiers, tokens, or native error details.
  const diagnostic = [
    `Platform.OS=${Platform.OS}`,
    `Platform.Version=${Platform.Version}`,
    `ExpoAppleAuthentication=${nativeModule}`,
    `SDK=${Constants.expoConfig?.sdkVersion ?? 'unknown'}`,
    `ExpoGo=${Constants.expoVersion ?? 'unknown'}`,
    `Runtime=${Constants.expoRuntimeVersion ?? 'unknown'}`,
    `expo-apple-authentication=${appleAuthenticationVersion}`,
  ].join(' · ');

  return (
    <Text allowFontScaling testID="apple-runtime-diagnostics"
      style={[styles.caption, { color: colors.mutedForeground }]}>
      {diagnostic}
    </Text>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});