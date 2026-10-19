import React, { type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export interface ScreenProps {
  title: string;
  children: ReactNode;
  contentStyle?: ViewStyle;
  /** Show the current workspace and role above the title (workspace routes). */
  workspaceHeader?: boolean;
  headerContent?: ReactNode;
}

export function Screen({ title, children, contentStyle, workspaceHeader, headerContent }: ScreenProps) {
  const colors = useColors();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <KeyboardAwareScrollViewCompat
        bottomOffset={24}
        contentContainerStyle={[styles.content, Platform.OS === 'web' && { paddingTop: 67, paddingBottom: 34 }, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {workspaceHeader ? <WorkspaceHeader /> : null}
        <View style={styles.heading}>
          <Text
            accessibilityRole="header"
            allowFontScaling
            style={[styles.title, { color: colors.foreground }]}
          >
            {title}
          </Text>
        </View>
        {headerContent}
        {children}
      </KeyboardAwareScrollViewCompat>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  heading: {
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
});