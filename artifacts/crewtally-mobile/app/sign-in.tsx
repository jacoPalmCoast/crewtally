import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { PRIVACY_URL, SUPPORT_URL } from '@/lib/links';


const POINTS = [
  'Daily or hourly pay, per worker',
  'Records payments you make — it never moves money',
  'Receipts show each worker only their own pay',
];

export default function SignInScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const { status, notice, message, busy, signIn, retryRestore } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const native = Platform.OS === 'ios';

  useEffect(() => {
    let live = true;
    if (!native) {
      setAvailable(false);
      return;
    }
    AppleAuthentication.isAvailableAsync()
      .then((ok) => live && setAvailable(ok))
      .catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, [native]);

  const webInset = Platform.OS === 'web' ? { paddingTop: 67, paddingBottom: 34 } : null;

  let action: React.ReactNode;
  if (status === 'restoring') {
    action = (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.primary} />
        <Text allowFontScaling style={[styles.caption, { color: colors.mutedForeground }]}>Restoring your session…</Text>
      </View>
    );
  } else if (status === 'retry') {
    action = <PrimaryButton label="Try again" onPress={retryRestore} testID="restore-retry" />;
  } else if (available === false) {
    action = (
      <Text allowFontScaling style={[styles.caption, { color: colors.mutedForeground }]} testID="apple-unavailable">
        Sign in with Apple requires an iPhone or Expo Go. Open CrewTally on your iPhone to sign in.
      </Text>
    );
  } else if (available) {
    action = (
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          scheme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={colors.radius}
        style={[styles.apple, busy && { opacity: 0.5 }]}
        onPress={() => {
          if (!busy) void signIn();
        }}
      />
    );
  } else {
    action = <ActivityIndicator color={colors.primary} />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, webInset]} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <View style={[styles.mark, { backgroundColor: colors.primary }]}>
            <Feather accessible={false} name="calendar" size={32} color={colors.primaryForeground} />
          </View>
          <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>CrewTally</Text>
          <Text allowFontScaling style={[styles.purpose, { color: colors.mutedForeground }]}>
            Record who worked each day, what you paid, and what's still owed. Share an honest record with each worker.
          </Text>
          <View style={styles.points}>
            {POINTS.map((p) => (
              <View key={p} style={styles.point}>
                <Feather accessible={false} name="check" size={20} color={colors.primary} />
                <Text allowFontScaling style={[styles.pointText, { color: colors.foreground }]}>{p}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottom}>
          {notice ? (
            <Text accessibilityLiveRegion="polite" allowFontScaling testID="signin-notice"
              style={[styles.banner, { color: colors.warning, backgroundColor: colors.warningSurface }]}>
              {notice}
            </Text>
          ) : null}
          {message ? (
            <Text accessibilityLiveRegion="polite" allowFontScaling testID="signin-error"
              style={[styles.error, { color: colors.destructive }]}>
              {message}
            </Text>
          ) : null}
          {action}
          <Text allowFontScaling style={[styles.caption, { color: colors.mutedForeground }]}>
            We don't see your Apple email or name.
          </Text>
          <Text allowFontScaling style={[styles.caption, { color: colors.mutedForeground }]}>
            <Text accessibilityRole="link" style={{ color: colors.primary, textDecorationLine: 'underline' }}
              onPress={() => void Linking.openURL(PRIVACY_URL)}>Privacy policy</Text>
            {' · '}
            <Text accessibilityRole="link" style={{ color: colors.primary, textDecorationLine: 'underline' }}
              onPress={() => void Linking.openURL(SUPPORT_URL)}>Support</Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24, justifyContent: 'space-between', gap: 32 },
  top: { gap: 16 },
  mark: { width: 68, height: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },
  purpose: { fontSize: 18, lineHeight: 27 },
  points: { gap: 14, marginTop: 12 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointText: { flex: 1, fontSize: 16, lineHeight: 24 },
  bottom: { gap: 14, alignItems: 'stretch' },
  apple: { height: 52, width: '100%' },
  center: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  caption: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  banner: { fontSize: 16, fontWeight: '600', padding: 12, borderRadius: 12, textAlign: 'center' },
  error: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
