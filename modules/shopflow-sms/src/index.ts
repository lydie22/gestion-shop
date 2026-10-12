import { requireOptionalNativeModule } from 'expo-modules-core';

interface NativeShopflowSms {
  configure: (senders: string[]) => void;
  drain: () => Array<{ sender?: string; body: string; received_at: number }>;
  clear: () => void;
}

const native = requireOptionalNativeModule<NativeShopflowSms>('ShopflowSms');

export const isNativeSmsAvailable = Boolean(native);

export function configureNativeSms(senders: string[]): boolean {
  if (!native) return false;
  const normalized = senders.map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) return false;
  native.configure(normalized);
  return true;
}

export function drainNativeSms() {
  return native?.drain() ?? [];
}

export function clearNativeSmsQueue() {
  native?.clear();
}
