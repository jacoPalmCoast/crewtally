import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useColors } from '@/hooks/useColors';
import type { DeveloperSignInLabel, SignInResult } from '@/contexts/AuthContext';

interface Props {
  busy: boolean;
  onSignIn: (code: string, label: DeveloperSignInLabel) => Promise<SignInResult>;
}

const DevSignInSheet = __DEV__
  ? function DevSignInSheetComponent({ busy, onSignIn }: Props) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState<DeveloperSignInLabel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setVisible(false);
    setCode('');
    setLabel(null);
    setError(null);
  };

  const submit = async () => {
    if (!code.trim() || !label || busy) return;
    const submittedCode = code;
    setCode('');
    setError(null);
    const result = await onSignIn(submittedCode, label);
    if (result === 'ok') {
      close();
    } else {
      setError('Developer sign-in did not finish. Check the code and try again.');
    }
  };

  const choice = (value: DeveloperSignInLabel, title: string) => {
    const selected = label === value;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={title}
        key={value}
        onPress={() => setLabel(value)}
        testID={`dev-signin-${value}`}
        style={[
          styles.choice,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.muted : colors.background,
          },
        ]}
      >
        <Text allowFontScaling style={[styles.choiceText, { color: colors.foreground }]}>
          {title}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setError(null);
          setVisible(true);
        }}
        testID="dev-signin-button"
        style={styles.linkButton}
      >
        <Text allowFontScaling style={[styles.link, { color: colors.mutedForeground }]}>
          Developer sign-in (test only)
        </Text>
      </Pressable>
      <Modal
        animationType="slide"
        onDismiss={close}
        onRequestClose={close}
        presentationStyle="pageSheet"
        testID="dev-signin-sheet"
        visible={visible}
      >
        <SafeAreaView
          accessibilityViewIsModal
          edges={['top', 'bottom', 'left', 'right']}
          style={[styles.safe, { backgroundColor: colors.background }]}
        >
          <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content}>
            <View style={styles.headingRow}>
              <Text accessibilityRole="header" allowFontScaling style={[styles.heading, { color: colors.foreground }]}>
                Developer sign-in
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close developer sign-in" onPress={close}>
                <Text allowFontScaling style={[styles.close, { color: colors.primary }]}>Close</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Developer sign-in code"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setCode}
              placeholder="Code"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              style={[
                styles.input,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              testID="dev-signin-code"
              value={code}
            />
            <View accessibilityRole="radiogroup" accessibilityLabel="Choose test owner" style={styles.choices}>
              {choice('owner-a', 'Owner A')}
              {choice('owner-b', 'Owner B')}
              {choice('member-c', 'Member C')}
              {choice('member-d', 'Member D')}
            </View>
            {error ? (
              <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]} testID="dev-signin-error">
                {error}
              </Text>
            ) : null}
            <PrimaryButton
              disabled={busy || !code.trim() || !label}
              label={busy ? 'Signing in…' : 'Sign in'}
              onPress={() => void submit()}
              testID="dev-signin-submit"
            />
            <Text allowFontScaling style={[styles.note, { color: colors.mutedForeground }]}>
              Test-only access for development builds.
            </Text>
          </KeyboardAwareScrollViewCompat>
        </SafeAreaView>
      </Modal>
    </>
  );
  }
  : null;

export default DevSignInSheet;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 18 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 24, fontWeight: '700' },
  close: { fontSize: 16, textDecorationLine: 'underline' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  choice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontSize: 16, fontWeight: '600' },
  error: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  linkButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' },
});
