import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { formatCents } from '@workspace/crewtally-shared/money';

export interface MoneyProps {
  cents: number;
  alignRight?: boolean;
  style?: TextStyle;
  testID?: string;
}

function spokenAmount(cents: number): string {
  const amount = BigInt(cents);
  const absolute = amount < 0n ? -amount : amount;
  const dollars = absolute / 100n;
  const fraction = Number(absolute % 100n);
  const prefix = amount < 0n ? 'minus ' : '';
  const dollarLabel = dollars === 1n ? 'dollar' : 'dollars';
  if (fraction === 0) return `${prefix}${dollars.toLocaleString('en-US')} ${dollarLabel}`;
  const centLabel = fraction === 1 ? 'cent' : 'cents';
  return `${prefix}${dollars.toLocaleString('en-US')} ${dollarLabel} and ${fraction} ${centLabel}`;
}

export function Money({ cents, alignRight = false, style, testID }: MoneyProps) {
  if (!Number.isSafeInteger(cents)) throw new RangeError('Money must be a safe integer number of cents.');
  const colors = useColors();
  return (
    <Text
      accessibilityLabel={spokenAmount(cents)}
      allowFontScaling
      testID={testID}
      style={[
        styles.amount,
        { color: colors.foreground },
        alignRight && styles.right,
        style,
      ]}
    >
      {formatCents(cents)}
    </Text>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  right: {
    textAlign: 'right',
  },
});