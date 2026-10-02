import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/** Text plus icon, never color alone. */
export function Notice({ tone = 'error', children, testID }: { tone?: 'error' | 'info'; children: string; testID?: string }) {
  const colors = useColors();
  const color = tone === 'error' ? colors.destructive : colors.foreground;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite" testID={testID}>
      <Feather accessible={false} name={tone === 'error' ? 'alert-circle' : 'info'} size={18} color={color} />
      <Text allowFontScaling style={[styles.text, { color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  text: { flex: 1, fontSize: 15, lineHeight: 22 },
});
