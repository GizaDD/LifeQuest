import React from 'react';
import { Stack } from 'expo-router';
import { AppProvider } from '../contexts/AppContext';

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="missions/create" 
          options={{ 
            presentation: 'modal',
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="missions/[id]" 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="missions/edit/[id]" 
          options={{ 
            presentation: 'modal',
            headerShown: false 
          }} 
        />
      </Stack>
    </AppProvider>
  );
}
