import React from 'react';
import { useRouter } from 'expo-router';
import { Page } from '@/components/Page';
import { WorkspaceList } from '@/components/WorkspaceList';

export default function SwitcherScreen() {
  const router = useRouter();
  return (
    <Page>
      <WorkspaceList onSwitched={() => router.replace('/(tabs)' as never)} />
    </Page>
  );
}
