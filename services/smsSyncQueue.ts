import { getLocalDeviceKey } from '@/services/deviceIdentity';
import { shopflowApi } from '@/services/shopflowApi';
import { enqueueSecureQueue, migrateLegacyPlainQueue, readSecureQueue, removeSecureQueueItem } from '@/services/secureQueueStorage';

const QUEUE_KEY_PREFIX = 'shopflow.pending.sms.v2';
const LEGACY_QUEUE_KEY_PREFIX = 'shopflow.pending.sms.v1';

export interface PendingSmsEvent {
  operator: string;
  raw_text: string;
  sender?: string;
  received_at?: string;
  idempotency_key: string;
  queued_at: string;
}

export async function readPendingSmsEvents(shopId: string): Promise<PendingSmsEvent[]> {
  await migrateLegacyPlainQueue<PendingSmsEvent>(QUEUE_KEY_PREFIX, shopId, `${LEGACY_QUEUE_KEY_PREFIX}.${shopId}`);
  return readSecureQueue<PendingSmsEvent>(QUEUE_KEY_PREFIX, shopId);
}

export async function enqueueSmsEvent(shopId: string, event: Omit<PendingSmsEvent, 'queued_at'>): Promise<void> {
  await enqueueSecureQueue(QUEUE_KEY_PREFIX, shopId, { ...event, queued_at: new Date().toISOString() });
}

export async function removePendingSmsEvent(shopId: string, idempotencyKey: string): Promise<void> {
  await removeSecureQueueItem(QUEUE_KEY_PREFIX, shopId, idempotencyKey);
}

/** Rejoue les SMS hors ligne ; le serveur déduplique par clé d'idempotence. */
export async function flushPendingSmsEvents(shopId: string, accessToken: string): Promise<number> {
  const pending = await readPendingSmsEvents(shopId);
  if (pending.length === 0) return 0;
  const deviceKey = await getLocalDeviceKey();
  for (const item of pending) {
    const { queued_at: _queuedAt, ...payload } = item;
    try {
      await shopflowApi.syncSmsBatch([{ ...payload, device_id: deviceKey }], accessToken);
      await removePendingSmsEvent(shopId, item.idempotency_key);
    } catch {
      // L'événement reste durablement en file pour la prochaine reconnexion.
    }
  }
  return (await readPendingSmsEvents(shopId)).length;
}
