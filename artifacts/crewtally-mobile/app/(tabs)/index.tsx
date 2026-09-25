import React from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function TodayScreen() {
  return (
    <Screen title="Today">
      <EmptyState
        icon="calendar"
        title="Nothing to record yet"
        description="Your project and worker activity will appear here."
      />
    </Screen>
  );
}
