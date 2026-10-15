import { shopflowApi } from '@/services/shopflowApi';
import { enqueueSecureQueue, migrateLegacyPlainQueue, readSecureQueue, removeSecureQueueItem } from '@/services/secureQueueStorage';

const QUEUE_KEY_PREFIX = 'shopflow.pending.cash.v2';
const LEGACY_QUEUE_KEY_PREFIX = 'shopflow.pending.cash.v1';

export interface PendingCashMovement {
  category: string;
  amount_cents: number;
  note: string;
  status: 'pending' | 'confirmed';
  idempotency_key: string;
  queued_at: string;
}

export async function readPendingCashMovements(shopId: string): Promise<PendingCashMovement[]> {
  await migrateLegacyPlainQueue<PendingCashMovement>(QUEUE_KEY_PREFIX, shopId, `${LEGACY_QUEUE_KEY_PREFIX}.${shopId}`);
  return readSecureQueue<PendingCashMovement>(QUEUE_KEY_PREFIX, shopId);
}

export async function enqueueCashMovement(shopId: string, movement: Omit<PendingCashMovement, 'queued_at'>): Promise<void> {
  await enqueueSecureQueue(QUEUE_KEY_PREFIX, shopId, { ...movement, queued_at: new Date().toISOString() });
}

export async function removePendingCashMovement(shopId: string, idempotencyKey: string): Promise<void> {
  await removeSecureQueueItem(QUEUE_KEY_PREFIX, shopId, idempotencyKey);
}

/** Envoie les mouvements de caisse conservés hors ligne et retourne le nombre restant. */
export async function flushPendingCashMovements(shopId: string, accessToken: string): Promise<number> {
  const pending = await readPendingCashMovements(shopId);
  for (const item of pending) {
    const { queued_at: _queuedAt, ...payload } = item;
    try {
      await shopflowApi.createCashMovement(payload, accessToken);
      await removePendingCashMovement(shopId, item.idempotency_key);
    } catch {
      // La file reste persistée pour la prochaine reprise réseau.
    }
  }
  return (await readPendingCashMovements(shopId)).length;
}
