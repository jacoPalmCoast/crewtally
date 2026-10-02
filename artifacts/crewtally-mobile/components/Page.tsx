import React, { type ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

/** Scroll container for stack screens that have a navigation header. */
export function Page({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, Platform.OS === 'web' && { paddingBottom: 34 }]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({ content: { padding: 20, gap: 16, flexGrow: 1 } });
