import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useColors } from '@/hooks/useColors';

function LiquidTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
        <NativeTabs.Trigger.Label>Accueil</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }} />
        <NativeTabs.Trigger.Label>Opérations</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="controls">
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.shield', selected: 'checkmark.shield.fill' }} />
        <NativeTabs.Trigger.Label>Contrôles</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cash">
        <NativeTabs.Trigger.Icon sf={{ default: 'banknote', selected: 'banknote.fill' }} />
        <NativeTabs.Trigger.Label>Caisse</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Icon sf={{ default: 'ellipsis', selected: 'ellipsis' }} />
        <NativeTabs.Trigger.Label>Plus</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabs() {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const icons: Record<string, React.ComponentProps<typeof Feather>['name']> = {
    index: 'grid',
    activity: 'list',
    controls: 'shield',
    cash: 'credit-card',
    more: 'more-horizontal',
  };

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: 'Inter_500Medium',
          marginTop: 2,
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingBottom: 0,
        },
        tabBarStyle: {
          position: 'absolute',
          height: isWeb ? 84 : 72,
          paddingTop: 6,
          paddingBottom: isWeb ? 18 : 8,
          paddingHorizontal: 0,
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopColor: colors.border,
          borderTopWidth: isIOS ? 0 : StyleSheet.hairlineWidth,
          elevation: 0,
          justifyContent: 'center',
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
        tabBarIcon: ({ color, focused }) =>
          isIOS ? (
            <SymbolView name={icons[route.name] === 'grid' ? 'square.grid.2x2' : icons[route.name] === 'list' ? 'list.bullet.rectangle' : icons[route.name] === 'shield' ? 'checkmark.shield' : icons[route.name] === 'credit-card' ? 'banknote' : 'ellipsis'} tintColor={color} size={21} />
          ) : (
            <Feather name={icons[route.name]} size={20} color={color} />
          ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="activity" options={{ title: 'Opérations' }} />
      <Tabs.Screen name="controls" options={{ title: 'Contrôles' }} />
      <Tabs.Screen name="cash" options={{ title: 'Caisse' }} />
      <Tabs.Screen name="more" options={{ title: 'Plus' }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return isLiquidGlassAvailable() ? <LiquidTabs /> : <ClassicTabs />;
}
