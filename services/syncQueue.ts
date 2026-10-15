import { shopflowApi } from '@/services/shopflowApi';
import { enqueueSecureQueue, migrateLegacyPlainQueue, readSecureQueue, removeSecureQueueItem } from '@/services/secureQueueStorage';

const QUEUE_KEY_PREFIX = 'shopflow.pending.transactions.v2';
const LEGACY_QUEUE_KEY_PREFIX = 'shopflow.pending.transactions.v1';

export interface PendingTransaction {
  account_id: string;
  reference: string;
  operation_type: string;
  amount_cents: number;
  fee_cents: number;
  commission_expected_cents: number;
  status: string;
  source: 'manual';
  note?: string;
  idempotency_key: string;
  queued_at: string;
}

export async function readPendingTransactions(shopId: string): Promise<PendingTransaction[]> {
  await migrateLegacyPlainQueue<PendingTransaction>(QUEUE_KEY_PREFIX, shopId, `${LEGACY_QUEUE_KEY_PREFIX}.${shopId}`);
  return readSecureQueue<PendingTransaction>(QUEUE_KEY_PREFIX, shopId);
}

export async function enqueueTransaction(shopId: string, transaction: Omit<PendingTransaction, 'queued_at'>): Promise<void> {
  await enqueueSecureQueue(QUEUE_KEY_PREFIX, shopId, { ...transaction, queued_at: new Date().toISOString() });
}

export async function removePendingTransaction(shopId: string, idempotencyKey: string): Promise<void> {
  await removeSecureQueueItem(QUEUE_KEY_PREFIX, shopId, idempotencyKey);
}

/** Envoie les opérations conservées hors ligne et retourne le nombre restant. */
export async function flushPendingTransactions(shopId: string, accessToken: string): Promise<number> {
  const pending = await readPendingTransactions(shopId);
  for (const item of pending) {
    const { queued_at: _queuedAt, ...payload } = item;
    try {
      await shopflowApi.createTransaction(payload, accessToken);
      await removePendingTransaction(shopId, item.idempotency_key);
    } catch {
      // Le serveur reste la source de vérité ; l'idempotence permet de reprendre plus tard.
    }
  }
  return (await readPendingTransactions(shopId)).length;
}

