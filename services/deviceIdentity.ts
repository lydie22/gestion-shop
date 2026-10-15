import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const DEVICE_KEY = 'shopflow.device.key.v2';
const LEGACY_DEVICE_KEY = 'shopflow.device.key.v1';

export async function getLocalDeviceKey(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_KEY);
  if (stored) return stored;
  const legacy = await AsyncStorage.getItem(LEGACY_DEVICE_KEY);
  if (legacy) {
    await SecureStore.setItemAsync(DEVICE_KEY, legacy);
    await AsyncStorage.removeItem(LEGACY_DEVICE_KEY);
    return legacy;
  }
  const generated = `shopflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  await SecureStore.setItemAsync(DEVICE_KEY, generated);
  return generated;
}
