import React from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function WorkersScreen() {
  return (
    <Screen title="Workers" workspaceHeader>
      <EmptyState
        icon="users"
        title="No workers yet"
        description="Workers will appear here when you add them to a project."
      />
    </Screen>
  );
}