import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export type Status =
  | 'owed'
  | 'settled'
  | 'advance'
  | 'pending'
  | 'needsReview'
  | 'unrecorded'
  | 'checkNotCleared';

const statusDetails: Record<Status, { label: string; icon: keyof typeof Feather.glyphMap; tone: 'primary' | 'muted' | 'warning' }> = {
  owed: { label: 'Owed', icon: 'arrow-up-right', tone: 'primary' },
  settled: { label: 'Settled', icon: 'check-circle', tone: 'primary' },
  advance: { label: 'Advance', icon: 'arrow-down-left', tone: 'muted' },
  pending: { label: 'Pending', icon: 'clock', tone: 'muted' },
  needsReview: { label: 'Needs review', icon: 'alert-circle', tone: 'warning' },
  unrecorded: { label: 'Unrecorded', icon: 'circle', tone: 'muted' },
  checkNotCleared: { label: 'Check not cleared', icon: 'file-text', tone: 'warning' },
};

export interface StatusLabelProps {
  status: Status;
  testID?: string;
}

export function StatusLabel({ status, testID }: StatusLabelProps) {
  const colors = useColors();
  const detail = statusDetails[status];
  const color = detail.tone === 'warning'
    ? colors.warning
    : detail.tone === 'muted'
      ? colors.mutedForeground
      : colors.primary;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={detail.label}
      testID={testID}
      style={styles.container}
    >
      <View testID={`status-icon-${status}`} accessible={false}>
        <Feather
          accessible={false}
          name={detail.icon}
          size={16}
          color={color}
          style={styles.icon}
        />
      </View>
      <Text
        allowFontScaling
        testID={`status-text-${status}`}
        style={[styles.label, { color }]}
      >
        {detail.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});