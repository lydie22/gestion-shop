import React, { useEffect, useRef } from 'react';
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
import * as SplashScreen from 'expo-splash-screen';
import { ShopFlowProvider } from '@/context/ShopFlowContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { session, isHydrating } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const lastRedirect = useRef<string | null>(null);

  useEffect(() => {
    if (isHydrating) return;

    const onAuthRoute = pathname === '/auth' || pathname.startsWith('/auth/');
    const target = !session && !onAuthRoute ? '/auth' : session && onAuthRoute ? '/(tabs)' : null;

    if (!target) {
      lastRedirect.current = null;
      return;
    }

    // Navigation must happen after the navigator is mounted. Calling Redirect
    // while rendering the root Stack can make Expo Router update itself forever.
    if (lastRedirect.current === target) return;
    lastRedirect.current = target;
    router.replace(target);
  }, [isHydrating, pathname, router, session]);

  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Retour' }}>
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
                <ShopFlowProvider>
                  <RootLayoutNav />
                </ShopFlowProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
