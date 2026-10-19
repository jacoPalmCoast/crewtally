import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useColors } from '@/hooks/useColors';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, ...input }: FieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        allowFontScaling
        placeholderTextColor={colors.mutedForeground}
        {...input}
        onFocus={(event) => { setFocused(true); input.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); input.onBlur?.(event); }}
        style={[styles.input, {
          backgroundColor: colors.card, borderColor: focused ? colors.primary : colors.input,
          borderWidth: focused ? 2 : 1, color: colors.foreground,
        }]}
      />
      {hint ? <Text allowFontScaling style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  hint: { fontSize: 14, lineHeight: 20 },
});
