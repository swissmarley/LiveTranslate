import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { ToastHost } from '@/components/toast-host';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useApiKeys } from '@/store/api-keys';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

const storesHydrated = () =>
  useSettings.persist.hasHydrated() && useSessions.persist.hasHydrated() && useApiKeys.getState().loaded;

/** Waits for saved settings, history and API keys so the first frame is already right. */
function useHydrated() {
  const [hydrated, setHydrated] = useState(storesHydrated);
  useEffect(() => {
    const update = () => setHydrated(storesHydrated());
    const unsubscribe = [
      useSettings.persist.onFinishHydration(update),
      useSessions.persist.onFinishHydration(update),
      useApiKeys.subscribe(update),
    ];
    update();
    return () => unsubscribe.forEach((fn) => fn());
  }, []);
  return hydrated;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = useTheme();
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  if (!hydrated) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.text },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Conversation' }} />
        <Stack.Screen name="listen" options={{ title: 'Listen' }} />
        <Stack.Screen name="history/index" options={{ title: 'History' }} />
        <Stack.Screen name="history/[id]" options={{ title: 'Conversation' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="voices" options={{ title: 'Voice' }} />
        <Stack.Screen name="languages" options={{ presentation: 'modal', title: 'Language' }} />
        <Stack.Screen
          name="show"
          options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }}
        />
      </Stack>
      <ToastHost />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
