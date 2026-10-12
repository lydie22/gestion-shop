import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_KEY = 'shopflow.device.key.v1';

export async function getLocalDeviceKey(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_KEY);
  if (stored) return stored;
  const generated = `shopflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  await AsyncStorage.setItem(DEVICE_KEY, generated);
  return generated;
}
