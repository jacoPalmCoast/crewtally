import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { PRIVACY_URL, SUPPORT_URL } from '@/lib/links';

export default function AccountScreen() {
  const colors = useColors();
  const { signOut, message } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const doSignOut = async () => {
    setWorking(true);
    setFailed(false);
    const result = await signOut();
    setWorking(false);
    if (result === 'failed') setFailed(true);
  };

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const link = (label: string, url: string, testID: string) => (
    <Pressable accessibilityRole="link" testID={testID} onPress={() => void Linking.openURL(url)} style={styles.row}>
      <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <Feather accessible={false} name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, Platform.OS === 'web' && { paddingBottom: 34 }]}
    >
      <View style={[styles.card, card]}>
        <View style={styles.row}>
          <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>Sign-in</Text>
          <Text allowFontScaling testID="account-signin" style={[styles.value, { color: colors.mutedForeground }]}>
            Signed in with Apple
          </Text>
        </View>
      </View>

      <Text allowFontScaling style={[styles.section, { color: colors.mutedForeground }]}>ABOUT</Text>
      <View style={[styles.card, card]}>
        {link('Privacy policy', PRIVACY_URL, 'account-privacy')}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {link('Support', SUPPORT_URL, 'account-support')}
      </View>

      <View style={[styles.card, card]}>
        {confirming ? (
          <View style={styles.confirm}>
            <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>Sign out of CrewTally on this iPhone?</Text>
            <Pressable accessibilityRole="button" testID="signout-confirm" disabled={working} onPress={() => void doSignOut()}
              style={[styles.btn, { backgroundColor: colors.destructive, opacity: working ? 0.6 : 1 }]}>
              <Text allowFontScaling style={[styles.btnText, { color: colors.destructiveForeground }]}>
                {working ? 'Signing out…' : 'Sign out'}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" testID="signout-cancel" disabled={working}
              onPress={() => { setConfirming(false); setFailed(false); }}
              style={[styles.btn, { backgroundColor: colors.secondary }]}>
              <Text allowFontScaling style={[styles.btnText, { color: colors.secondaryForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" testID="signout" onPress={() => setConfirming(true)} style={styles.row}>
            <Text allowFontScaling style={[styles.label, { color: colors.primary, fontWeight: '600' }]}>Sign out</Text>
          </Pressable>
        )}
      </View>
      {failed ? (
        <Text accessibilityLiveRegion="polite" allowFontScaling testID="signout-error" style={[styles.error, { color: colors.destructive }]}>
          {message ?? 'Could not sign out. You are still signed in. Try again.'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, flexGrow: 1 },
  card: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 16 },
  value: { fontSize: 16, textAlign: 'right' },
  section: { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, marginTop: 8 },
  divider: { height: StyleSheet.hairlineWidth },
  confirm: { padding: 16, gap: 12 },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  error: { fontSize: 15, lineHeight: 22 },
});
