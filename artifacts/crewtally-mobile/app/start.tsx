import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { setJoinAfterSignIn } from '@/lib/intent';
import { PRIVACY_URL } from '@/lib/links';

/** SignIn: Get started / Join my team. (The sample slot arrives in Phase 2.) */
export default function StartScreen() {
  const colors = useColors();
  const router = useRouter();
  const { status, message, notice, retryRestore } = useAuth();

  let actions: React.ReactNode;
  if (status === 'restoring') {
    actions = (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.primary} />
        <Text allowFontScaling style={[styles.caption, { color: colors.mutedForeground }]}>Restoring your session…</Text>
      </View>
    );
  } else if (status === 'retry') {
    actions = (
      <>
        {message ? <Text accessibilityLiveRegion="polite" allowFontScaling style={[styles.caption, { color: colors.destructive }]}>{message}</Text> : null}
        <PrimaryButton label="Try again" onPress={retryRestore} testID="restore-retry" />
      </>
    );
  } else {
    actions = (
      <>
        <PrimaryButton label="Get started" testID="start-get-started" onPress={() => { setJoinAfterSignIn(false); router.push('/sign-in' as never); }} />
        <SecondaryButton label="Join my team" testID="start-join" onPress={() => { setJoinAfterSignIn(true); router.push('/sign-in' as never); }} />
        {/* Phase 2: "Try the Home sample" goes here. */}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <View style={[styles.mark, { backgroundColor: colors.primary }]}>
            <Feather accessible={false} name="calendar" size={32} color={colors.primaryForeground} />
          </View>
          <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.foreground }]}>CrewTally</Text>
          <Text allowFontScaling style={[styles.purpose, { color: colors.mutedForeground }]}>
            Keep an honest record of the work your crew does and the payments you make.
          </Text>
        </View>
        <View style={styles.bottom}>
          {notice ? <Text accessibilityLiveRegion="polite" allowFontScaling style={[styles.notice, { color: colors.warning, backgroundColor: colors.warningSurface }]}>{notice}</Text> : null}
          {actions}
          <Text allowFontScaling style={[styles.caption, { color: colors.mutedForeground }]} testID="never-moves-money">
            CrewTally never moves money. It keeps a record of payments you make yourself.
          </Text>
          <Text
            accessibilityRole="link"
            allowFontScaling
            testID="start-privacy"
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
            style={[styles.caption, { color: colors.primary, textDecorationLine: 'underline', paddingVertical: 12 }]}
          >
            Privacy policy
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
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  purpose: { fontSize: 18, lineHeight: 27 },
  bottom: { gap: 14 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  caption: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  notice: { fontSize: 16, fontWeight: '600', padding: 12, borderRadius: 12, textAlign: 'center' },
});
