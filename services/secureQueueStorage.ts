import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1500;
// Keep one explicit bound for write, read and cleanup. A previous mismatch
// could write a large blob successfully and then silently lose it on reload.
const MAX_SECURE_BLOB_CHUNKS = 512;

interface QueueIndexItem {
  idempotency_key: string;
  queued_at: string;
}

const queueLocks = new Map<string, Promise<void>>();

async function withQueueLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queueLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  queueLocks.set(key, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (queueLocks.get(key) === current) queueLocks.delete(key);
  }
}

function indexKey(prefix: string, shopId: string) {
  return `${prefix}.index.${shopId}`;
}

function itemKey(prefix: string, shopId: string, idempotencyKey: string) {
  const safe = encodeURIComponent(idempotencyKey).replace(/%/g, '_');
  return `${prefix}.item.${shopId}.${safe}`;
}

async function readIndex(prefix: string, shopId: string): Promise<QueueIndexItem[]> {
  const raw = await AsyncStorage.getItem(indexKey(prefix, shopId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as QueueIndexItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeSecureBlob(key: string, value: string): Promise<void> {
  const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) ?? [''];
  if (chunks.length > MAX_SECURE_BLOB_CHUNKS) {
    throw new Error('Les données locales sécurisées dépassent la capacité maximale autorisée.');
  }
  await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.${index}`, chunk)));
  await SecureStore.setItemAsync(`${key}.meta`, JSON.stringify({ count: chunks.length }));
}

export async function readSecureBlob(key: string): Promise<string | null> {
  const metadata = await SecureStore.getItemAsync(`${key}.meta`);
  if (!metadata) return null;
  try {
    const { count } = JSON.parse(metadata) as { count: number };
    if (!Number.isInteger(count) || count < 1 || count > MAX_SECURE_BLOB_CHUNKS) return null;
    const chunks = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${key}.${index}`)));
    return chunks.every((chunk) => chunk !== null) ? chunks.join('') : null;
  } catch {
    return null;
  }
}

export async function deleteSecureBlob(key: string): Promise<void> {
  const metadata = await SecureStore.getItemAsync(`${key}.meta`);
  let count = 0;
  try {
    count = metadata ? (JSON.parse(metadata) as { count?: number }).count ?? 0 : 0;
  } catch {
    count = 0;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(`${key}.meta`),
    ...Array.from({ length: Math.max(0, Math.min(count, MAX_SECURE_BLOB_CHUNKS)) }, (_, index) => SecureStore.deleteItemAsync(`${key}.${index}`)),
  ]);
}

export async function readSecureQueue<T>(prefix: string, shopId: string): Promise<T[]> {
  const index = await readIndex(prefix, shopId);
  const entries: Array<T | null> = await Promise.all(index.map(async (item): Promise<T | null> => {
    const raw = await readSecureBlob(itemKey(prefix, shopId, item.idempotency_key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }));
  return entries.filter((entry): entry is T => entry !== null);
}

/** Migrates one legacy plaintext queue and removes it only after secure writes succeed. */
export async function migrateLegacyPlainQueue<T extends { idempotency_key: string; queued_at?: string }>(prefix: string, shopId: string, legacyKey: string): Promise<void> {
  const raw = await AsyncStorage.getItem(legacyKey);
  if (!raw) return;
  let parsed: T[];
  try {
    const candidate = JSON.parse(raw) as T[];
    if (!Array.isArray(candidate)) return;
    parsed = candidate;
  } catch {
    return;
  }
  for (const item of parsed) {
    await enqueueSecureQueue(prefix, shopId, { ...item, queued_at: item.queued_at ?? new Date().toISOString() });
  }
  await AsyncStorage.removeItem(legacyKey);
}

export async function enqueueSecureQueue<T extends { idempotency_key: string; queued_at: string }>(prefix: string, shopId: string, item: T): Promise<void> {
  await withQueueLock(`${prefix}.${shopId}`, async () => {
    const index = await readIndex(prefix, shopId);
    if (index.some((entry) => entry.idempotency_key === item.idempotency_key)) return;
    const key = itemKey(prefix, shopId, item.idempotency_key);
    await writeSecureBlob(key, JSON.stringify(item));
    await AsyncStorage.setItem(indexKey(prefix, shopId), JSON.stringify([...index, { idempotency_key: item.idempotency_key, queued_at: item.queued_at }]));
  });
}

export async function removeSecureQueueItem(prefix: string, shopId: string, idempotencyKey: string): Promise<void> {
  await withQueueLock(`${prefix}.${shopId}`, async () => {
    const index = await readIndex(prefix, shopId);
    await deleteSecureBlob(itemKey(prefix, shopId, idempotencyKey));
    await AsyncStorage.setItem(indexKey(prefix, shopId), JSON.stringify(index.filter((entry) => entry.idempotency_key !== idempotencyKey)));
  });
}
