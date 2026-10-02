import AsyncStorage from '@react-native-async-storage/async-storage';

// Not secret: the id of the workspace last used, saved per user.
const key = (userId: string) => `crewtally.workspace.v1.${userId}`;

export async function loadSavedWorkspaceId(userId: string): Promise<string | null> {
  try { return (await AsyncStorage.getItem(key(userId))) ?? null; } catch { return null; }
}
export async function saveWorkspaceId(userId: string, id: string): Promise<void> {
  try { await AsyncStorage.setItem(key(userId), id); } catch { /* best effort */ }
}
export async function dropSavedWorkspaceId(userId: string): Promise<void> {
  try { await AsyncStorage.removeItem(key(userId)); } catch { /* best effort */ }
}
