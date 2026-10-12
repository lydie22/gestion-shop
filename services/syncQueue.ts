import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'shopflow.pending.transactions.v1';

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

export async function readPendingTransactions(): Promise<PendingTransaction[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingTransaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function enqueueTransaction(transaction: Omit<PendingTransaction, 'queued_at'>): Promise<void> {
  const current = await readPendingTransactions();
  if (current.some((item) => item.idempotency_key === transaction.idempotency_key)) return;
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...current, { ...transaction, queued_at: new Date().toISOString() }]));
}

export async function removePendingTransaction(idempotencyKey: string): Promise<void> {
  const current = await readPendingTransactions();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(current.filter((item) => item.idempotency_key !== idempotencyKey)));
}

