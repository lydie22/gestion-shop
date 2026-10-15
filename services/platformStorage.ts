import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Native uses the OS keychain/keystore. Web has no native SecureStore
 * implementation, so it uses AsyncStorage (browser storage) as a functional
 * fallback. Sensitive production web sessions should eventually move to
 * HttpOnly cookies; this adapter prevents the native module from crashing the
 * web build while keeping one API for all platforms.
 */
export async function getPlatformValue(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

export async function setPlatformValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deletePlatformValue(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
