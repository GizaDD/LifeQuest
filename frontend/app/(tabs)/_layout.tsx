import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { AppProvider } from '../../contexts/AppContext';

export default function TabLayout() {
  return (
    <AppProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#FFD700',
          tabBarInactiveTintColor: '#666',
          tabBarStyle: {
            backgroundColor: '#1a1a1a',
            borderTopColor: '#333',
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Главная',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>🏠</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="missions"
          options={{
            title: 'Миссии',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>🎯</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="skills"
          options={{
            title: 'Навыки',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>📈</Text>
            ),
          }}
        />
      </Tabs>
    </AppProvider>
  );
}
