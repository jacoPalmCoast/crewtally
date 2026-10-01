import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, usePathname, useRouter } from 'expo-router';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { configureApiClient } from '@/lib/authEvents';
import * as SplashScreen from 'expo-splash-screen';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

configureApiClient();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { status, pendingRoute, rememberRoute, consumePendingRoute } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    rememberRoute(pathname);
  }, [pathname, rememberRoute]);

  useEffect(() => {
    if (signedIn && pendingRoute) {
      const route = consumePendingRoute();
      if (route) router.replace(route as never);
    }
  }, [signedIn, pendingRoute, consumePendingRoute, router]);

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ title: 'Account', headerBackTitle: 'More' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
