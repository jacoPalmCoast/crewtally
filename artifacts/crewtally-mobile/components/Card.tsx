import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 } });
