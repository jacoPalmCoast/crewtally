import React from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function PaymentsScreen() {
  return (
    <Screen title="Payments">
      <EmptyState
        icon="credit-card"
        title="No payments yet"
        description="Payments you record will appear here."
      />
    </Screen>
  );
}