import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

export interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function PrimaryButton({ label, onPress, disabled = false, style, testID }: ButtonProps) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? colors.muted : colors.primary },
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        allowFontScaling
        style={[
          styles.label,
          { color: disabled ? colors.mutedForeground : colors.primaryForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});