import React from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: keyof typeof Feather.glyphMap;
}

export function EmptyState({ title, description, icon = 'inbox' }: EmptyStateProps) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
        <Feather accessible={false} name={icon} size={24} color={colors.mutedForeground} />
      </View>
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={[styles.title, { color: colors.foreground }]}
      >
        {title}
      </Text>
      <Text
        allowFontScaling
        style={[styles.description, { color: colors.mutedForeground }]}
      >
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
  },
});