import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { BackendAnomaly, BackendTransaction, shopflowApi } from '@/services/shopflowApi';
import { enqueueSmsEvent } from '@/services/smsSyncQueue';
import { readSecureBlob, writeSecureBlob } from '@/services/secureQueueStorage';
import { getPlatformValue, setPlatformValue } from '@/services/platformStorage';

const STORAGE_KEY = 'shopflow.local.v1';
const SECURE_DATA_KEY = 'shopflow.data.secure.v1';

function protectedSmsKey(storageKey: string, eventId: string) {
  const safeStorageKey = storageKey.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeEventId = eventId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `shopflow.sms.raw.v1.${safeStorageKey}.${safeEventId}`;
}

function shouldProtectLocalText() {
  return Platform.OS !== 'web';
}

const SECURE_SMS_CHUNK_SIZE = 1500;

async function readProtectedSms(storageKey: string, eventId: string): Promise<string | null> {
  const key = protectedSmsKey(storageKey, eventId);
  const metadata = await getPlatformValue(`${key}.meta`);
  if (metadata) {
    try {
      const { count } = JSON.parse(metadata) as { count: number };
      if (Number.isInteger(count) && count >= 0) {
        const chunks = await Promise.all(Array.from({ length: count }, (_, index) => getPlatformValue(`${key}.${index}`)));
        return chunks.every((chunk) => chunk !== null) ? chunks.join('') : null;
      }
    } catch {
      return null;
    }
  }
  // Compatibilité avec les valeurs créées avant le stockage fragmenté.
  return getPlatformValue(key);
}

async function writeProtectedSms(storageKey: string, eventId: string, rawText: string): Promise<void> {
  const key = protectedSmsKey(storageKey, eventId);
  const chunks = rawText.match(new RegExp(`.{1,${SECURE_SMS_CHUNK_SIZE}}`, 'gs')) ?? [''];
  await Promise.all(chunks.map((chunk, index) => setPlatformValue(`${key}.${index}`, chunk)));
  await setPlatformValue(`${key}.meta`, JSON.stringify({ count: chunks.length }));
}

export type Operator = 'Airtel Money' | 'Orange Money' | 'M-Pesa';
export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'transfer_in'
  | 'transfer_out'
  | 'fee'
  | 'adjustment';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'reversed';
export type MatchStatus =
  | 'matched'
  | 'review'
  | 'unmatched'
  | 'duplicate'
  | 'critical';
export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

export interface Transaction {
  id: string;
  reference: string;
  operator: Operator;
  type: TransactionType;
  amountCents: number;
  feeCents: number;
  commissionCents: number;
  electronicDeltaCents: number;
  cashDeltaCents: number;
  status: TransactionStatus;
  matchStatus: MatchStatus;
  agent: string;
  note: string;
  source: 'manual' | 'server';
  createdAt: string;
  relatedTransactionId?: string;
}

export interface CashMovement {
  id: string;
  category: 'expense' | 'owner_in' | 'owner_out' | 'other';
  amountCents: number;
  deltaCents: number;
  note: string;
  status: 'confirmed' | 'pending' | 'rejected';
  createdAt: string;
  agent: string;
  serverId?: string;
}

export interface CashSession {
  id: string;
  status: 'open' | 'closed';
  openedAt: string;
  openingCountCents: number;
  openingTheoreticalCents: number;
  openingVarianceCents?: number;
  openingExplanation?: string;
  closedAt?: string;
  closingCountCents?: number;
  closingTheoreticalCents?: number;
  varianceCents?: number;
  explanation?: string;
  agent: string;
}

export interface Anomaly {
  id: string;
  title: string;
  type: string;
  severity: Severity;
  status: 'open' | 'in_review' | 'resolved';
  description: string;
  amountCents: number;
  operator?: Operator;
  reference?: string;
  agent: string;
  createdAt: string;
  resolution?: string;
  history: { at: string; text: string }[];
  source?: 'manual' | 'server';
}

export interface SmsEvent {
  id: string;
  rawText: string;
  receivedAt: string;
  sender?: string;
  type: string;
  messageStatus?: 'confirmed' | 'failed' | 'reversed' | 'unknown';
  operator?: Operator;
  amountCents?: number;
  feeCents?: number;
  commissionCents?: number;
  balanceCents?: number;
  reference?: string;
  confidence: 'high' | 'low';
  reconciliation: string;
  source: 'manual-entry' | 'server';
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface Agent {
  id: string;
  name: string;
  role: 'Propriétaire' | 'Superviseur' | 'Agent';
  register: string;
  session: 'active' | 'closed';
}

export interface ShopSettings {
  shopName: string;
  currency: string;
  discrepancyThresholdCents: number;
  deviceName: string;
}

export interface ShopData {
  version: 2;
  initializedAt: string;
  referenceBalances: Record<Operator, number>;
  referenceMetadata: Record<Operator, { capturedAt: string; source: string; confidence: 'manual' | 'server' }>;
  referenceCashCents: number;
  referenceCashMetadata: { capturedAt: string; source: string; confidence: 'manual' | 'server' };
  transactions: Transaction[];
  cashMovements: CashMovement[];
  cashSessions: CashSession[];
  anomalies: Anomaly[];
  smsEvents: SmsEvent[];
  auditEvents: AuditEvent[];
  agents: Agent[];
  settings: ShopSettings;
  testChecks: Record<string, boolean>;
}

const operators: Operator[] = ['Airtel Money', 'Orange Money', 'M-Pesa'];
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const emptyData = (): ShopData => {
  const now = new Date().toISOString();
  const referenceMetadata = Object.fromEntries(
    operators.map((operator) => [operator, { capturedAt: '', source: 'Aucune référence enregistrée', confidence: 'manual' as const }]),
  ) as ShopData['referenceMetadata'];
  return {
    version: 2,
    initializedAt: now,
    referenceBalances: { 'Airtel Money': 0, 'Orange Money': 0, 'M-Pesa': 0 },
    referenceMetadata,
    referenceCashCents: 0,
    referenceCashMetadata: { capturedAt: '', source: 'Aucun comptage enregistré', confidence: 'manual' },
    transactions: [],
    cashMovements: [],
    cashSessions: [],
    anomalies: [],
    smsEvents: [],
    auditEvents: [],
    agents: [],
    settings: { shopName: 'Boutique', currency: 'USD', discrepancyThresholdCents: 500, deviceName: 'Appareil non enregistré' },
    testChecks: {},
  };
};
export const transactionTypeLabel: Record<TransactionType, string> = {
  deposit: 'Dépôt',
  withdrawal: 'Retrait',
  transfer_in: 'Transfert reçu',
  transfer_out: 'Transfert envoyé',
  fee: 'Frais',
  adjustment: 'Mouvement divers',
};

export const transactionStatusLabel: Record<TransactionStatus, string> = {
  pending: 'À confirmer',
  confirmed: 'Confirmée manuellement',
  failed: 'Échec déclaré',
  cancelled: 'Annulée localement',
  reversed: 'Inversée avec une écriture liée',
};

export const anomalySeverityLabel: Record<Severity, string> = {
  info: 'Information',
  low: 'Faible',
  moderate: 'Modérée',
  high: 'Élevée',
  critical: 'Critique',
};

export function getWalletBalance(data: ShopData, operator: Operator) {
  const anchorAt = Date.parse(data.referenceMetadata[operator]?.capturedAt ?? data.initializedAt);
  return (
    data.referenceBalances[operator] +
    data.transactions
      .filter(
        (transaction) =>
          transaction.operator === operator &&
          Date.parse(transaction.createdAt) >= anchorAt &&
          (transaction.status === 'confirmed' || transaction.status === 'reversed'),
      )
      .reduce((total, transaction) => total + transaction.electronicDeltaCents, 0)
  );
}

export function getCashBalance(data: ShopData) {
  const anchorAt = Date.parse(data.referenceCashMetadata?.capturedAt ?? data.initializedAt);
  const transactionMovements = data.transactions
    .filter(
      (transaction) =>
        Date.parse(transaction.createdAt) >= anchorAt &&
        (transaction.status === 'confirmed' || transaction.status === 'reversed'),
    )
    .reduce((total, transaction) => total + transaction.cashDeltaCents, 0);
  const otherMovements = data.cashMovements
    .filter((movement) => Date.parse(movement.createdAt) >= anchorAt && movement.status === 'confirmed')
    .reduce((total, movement) => total + movement.deltaCents, 0);
  return data.referenceCashCents + transactionMovements + otherMovements;
}

interface NewTransaction {
  reference: string;
  operator: Operator;
  type: TransactionType;
  amountCents: number;
  feeCents: number;
  commissionCents: number;
  status: TransactionStatus;
  agent: string;
  note: string;
}

interface ShopFlowContextValue {
  data: ShopData;
  isReady: boolean;
  storageIssue: boolean;
  refreshServerData: () => void;
  addTransaction: (input: NewTransaction) => void;
  cancelTransaction: (id: string, note: string) => void;
  reverseTransaction: (id: string, note: string) => void;
  addCashMovement: (movement: Omit<CashMovement, 'id' | 'createdAt' | 'agent'>) => void;
  reviewCashMovement: (id: string, status: 'confirmed' | 'rejected', note: string) => void;
  openCashSession: (openingCountCents: number, explanation: string) => void;
  closeCashSession: (closingCountCents: number, explanation: string) => void;
  setAnomalyStatus: (id: string, status: 'in_review' | 'resolved', note: string) => void;
  addSmsText: (text: string, operator: Operator, metadata?: { sender?: string; receivedAt?: string }) => void;
  updateSettings: (patch: Partial<ShopSettings>) => void;
  updateReferenceBalances: (referenceBalances: Record<Operator, number>, referenceCashCents: number, source: string) => void;
  toggleTestCheck: (id: string) => void;
}

const ShopFlowContext = createContext<ShopFlowContextValue | null>(null);

export function ShopFlowProvider({ children }: { children: ReactNode }) {
  const { session, accessibleShops } = useAuth();
  const actorLabel = session?.full_name?.trim() || 'Utilisateur hors ligne';
  const storageKey = session ? `${STORAGE_KEY}.${session.shop_id}` : `${STORAGE_KEY}.local`;
  const [data, setData] = useState<ShopData>(() => emptyData());
  const [isReady, setIsReady] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [storageIssue, setStorageIssue] = useState(false);
  const [serverRefreshNonce, setServerRefreshNonce] = useState(0);
  const skipNextSave = useRef(false);
  // Serialize persistence writes so a slower write for an older state cannot
  // finish after a newer state and overwrite it locally.
  const persistenceChain = useRef<Promise<void>>(Promise.resolve());
  const refreshServerData = useCallback(() => setServerRefreshNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setIsReady(false);
    setLoadedStorageKey(null);
    setData(emptyData());
    const loadPersistedData = async () => {
      const secureKey = `${SECURE_DATA_KEY}.${storageKey}`;
      const saved = shouldProtectLocalText()
        ? ((await readSecureBlob(secureKey)) ?? (await AsyncStorage.getItem(storageKey)))
        : await AsyncStorage.getItem(storageKey);
      if (!active) return;
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as ShopData;
          if (parsed.version === 2 && parsed.transactions && parsed.settings) {
            const defaults = emptyData();
            const restored: ShopData = {
              ...defaults,
              ...parsed,
              initializedAt: parsed.initializedAt ?? (parsed as ShopData & { seededAt?: string }).seededAt ?? defaults.initializedAt,
              referenceMetadata: parsed.referenceMetadata ?? defaults.referenceMetadata,
              referenceCashMetadata: parsed.referenceCashMetadata ?? defaults.referenceCashMetadata,
              testChecks: parsed.testChecks ?? {},
            };
            if (shouldProtectLocalText()) {
              restored.smsEvents = await Promise.all(restored.smsEvents.map(async (event) => {
                const protectedText = await readProtectedSms(storageKey, event.id);
                return protectedText ? { ...event, rawText: protectedText } : event;
              }));
            }
            setData(restored);
            if (shouldProtectLocalText() && !(await readSecureBlob(secureKey))) {
              await writeSecureBlob(secureKey, JSON.stringify(restored));
              await AsyncStorage.removeItem(storageKey);
            }
          }
        } catch {
          skipNextSave.current = true;
          setStorageIssue(true);
          setData(emptyData());
        }
      }
      setLoadedStorageKey(storageKey);
      setIsReady(true);
    };
    loadPersistedData()
      .catch(() => {
        if (active) {
          skipNextSave.current = true;
          setStorageIssue(true);
          setLoadedStorageKey(storageKey);
          setIsReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!session?.access_token || !isReady || loadedStorageKey !== storageKey) return;
    let active = true;

    const syncServerSnapshot = async () => {
      const results = await Promise.allSettled([
        shopflowApi.listAccounts(session.access_token),
        shopflowApi.listTransactions(session.access_token),
        shopflowApi.listAgents(session.access_token),
        shopflowApi.listAnomalies(session.access_token),
        shopflowApi.getCashMovements(session.access_token),
        shopflowApi.getCashSessions(session.access_token),
        shopflowApi.getAuditLogs(session.access_token),
      ]);
      if (!active) return;

      const accounts = results[0].status === 'fulfilled' ? results[0].value : [];
      const transactions = results[1].status === 'fulfilled' ? results[1].value : [];
      const agents = results[2].status === 'fulfilled' ? results[2].value : [];
      const anomalies = results[3].status === 'fulfilled' ? results[3].value : [];
      const cashMovements = results[4].status === 'fulfilled' ? results[4].value : [];
      const cashSessions = results[5].status === 'fulfilled' ? results[5].value : [];
      const auditLogs = results[6].status === 'fulfilled' ? results[6].value : [];
      const accountOperators = new Map(accounts.map((account) => [account.id, account.operator as Operator]));
      const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
      const selectedShop = accessibleShops.find((shop) => shop.id === session.shop_id);

      const serverTransactions: Transaction[] = transactions.map((row: BackendTransaction) => {
        const operator = accountOperators.get(row.account_id) ?? ('Compte inconnu' as Operator);
        const electronicDelta = ['deposit', 'transfer_out', 'fee'].includes(row.operation_type)
          ? -row.amount_cents - row.fee_cents
          : row.amount_cents - row.fee_cents;
        const cashDelta = row.operation_type === 'deposit' ? row.amount_cents : row.operation_type === 'withdrawal' ? -row.amount_cents : 0;
        return {
          id: row.id,
          reference: row.reference,
          operator,
          type: (row.operation_type as TransactionType) || 'adjustment',
          amountCents: row.amount_cents,
          feeCents: row.fee_cents,
          commissionCents: row.commission_expected_cents,
          electronicDeltaCents: electronicDelta,
          cashDeltaCents: cashDelta,
          status: (row.status as TransactionStatus) || 'pending',
          matchStatus: (row.reconciliation_status as MatchStatus) || 'unmatched',
          agent: row.agent_id ? (agentNames.get(row.agent_id) ?? 'Agent') : 'Non attribué',
          note: row.note ?? '',
          source: 'server',
          createdAt: row.created_at,
        };
      });

      const serverAnomalies: Anomaly[] = anomalies.map((row: BackendAnomaly) => ({
        id: row.id,
        title: row.title,
        type: row.category,
        severity: (row.severity as Severity) || 'moderate',
        status: row.status === 'resolved' ? 'resolved' : row.status === 'in_review' ? 'in_review' : 'open',
        description: row.description,
        amountCents: row.amount_cents,
        reference: row.reference,
        agent: 'À attribuer',
        createdAt: row.created_at,
        resolution: row.resolved_at,
        history: row.history ?? [],
        source: 'server',
      }));

      const serverAgents: Agent[] = agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: 'Agent',
        register: 'À affecter',
        session: agent.active ? 'active' : 'closed',
      }));

      const serverCashMovements: CashMovement[] = cashMovements.map((row) => ({
        id: row.id,
        category: (row.category as CashMovement['category']) || 'other',
        amountCents: row.amount_cents,
        deltaCents: row.delta_cents,
        note: row.note,
        status: (row.status as CashMovement['status']) || 'pending',
        createdAt: row.created_at,
        agent: agentNames.get(row.created_by) ?? 'Utilisateur serveur',
        serverId: row.id,
      }));

      const serverCashSessions: CashSession[] = cashSessions.map((row) => ({
        id: row.id,
        status: row.status === 'open' ? 'open' : 'closed',
        openedAt: row.opened_at,
        openingCountCents: row.opening_count_cents,
        openingTheoreticalCents: row.opening_theoretical_cents,
        openingVarianceCents: row.opening_variance_cents,
        closingCountCents: row.closing_count_cents,
        closingTheoreticalCents: row.closing_theoretical_cents,
        varianceCents: row.variance_cents,
        openingExplanation: row.opening_note,
        explanation: row.closing_note,
        closedAt: row.closed_at,
        agent: agentNames.get(row.opened_by) ?? 'Utilisateur serveur',
      }));

      const serverAudit: AuditEvent[] = auditLogs.map((row) => ({
        id: row.id,
        at: row.created_at,
        actor: row.actor_id,
        action: row.action,
        detail: [row.entity_type, row.entity_id, row.reason].filter(Boolean).join(' · '),
      }));

      setData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          shopName: selectedShop?.name ?? current.settings.shopName,
          currency: selectedShop?.currency ?? current.settings.currency,
        },
        transactions: results[1].status === 'fulfilled' ? serverTransactions : current.transactions,
        anomalies: results[3].status === 'fulfilled' ? serverAnomalies : current.anomalies,
        agents: results[2].status === 'fulfilled' ? serverAgents : current.agents,
        cashMovements: results[4].status === 'fulfilled' ? serverCashMovements : current.cashMovements,
        cashSessions: results[5].status === 'fulfilled' ? serverCashSessions : current.cashSessions,
        auditEvents: results[6].status === 'fulfilled' ? serverAudit : current.auditEvents,
      }));
    };

    void syncServerSnapshot();
    return () => { active = false; };
  }, [accessibleShops, isReady, loadedStorageKey, serverRefreshNonce, session?.access_token, session?.shop_id, storageKey]);

  useEffect(() => {
    if (isReady && loadedStorageKey === storageKey) {
      if (skipNextSave.current) {
        skipNextSave.current = false;
        return;
      }
      const snapshot = data;
      const persist = async () => {
        let persisted = snapshot;
        if (shouldProtectLocalText()) {
          await Promise.all(snapshot.smsEvents.map((event) => writeProtectedSms(storageKey, event.id, event.rawText)));
          persisted = {
            ...snapshot,
            smsEvents: snapshot.smsEvents.map((event) => ({ ...event, rawText: '[contenu protégé localement]' })),
          };
        }
        if (shouldProtectLocalText()) {
          await writeSecureBlob(`${SECURE_DATA_KEY}.${storageKey}`, JSON.stringify(persisted));
        } else {
          await AsyncStorage.setItem(storageKey, JSON.stringify(persisted));
        }
      };
      persistenceChain.current = persistenceChain.current
        .catch(() => undefined)
        .then(persist)
        .then(() => setStorageIssue(false), () => setStorageIssue(true));
    }
  }, [data, isReady, loadedStorageKey, storageKey]);

  // Les événements SMS locaux survivent au redémarrage et sont versés dans la
  // file réseau dès qu'une session serveur existe.
  useEffect(() => {
    if (!session || !isReady || loadedStorageKey !== storageKey) return;
    const pending = data.smsEvents;
    void Promise.all(pending.map((event) => enqueueSmsEvent(session.shop_id, {
      operator: event.operator ?? 'Opérateur inconnu',
      raw_text: event.rawText,
      sender: event.sender,
      received_at: event.receivedAt,
      idempotency_key: `local-sms-${event.id}`,
    })));
  }, [data.smsEvents, isReady, loadedStorageKey, session, storageKey]);

  const recordAudit = useCallback(
    (current: ShopData, action: string, detail: string): AuditEvent[] => [
      {
        id: makeId('audit'),
        at: new Date().toISOString(),
        actor: actorLabel,
        action,
        detail,
      },
      ...current.auditEvents,
    ],
    [actorLabel],
  );

  const addTransaction = useCallback(
    (input: NewTransaction) => {
      const amount = Math.abs(input.amountCents);
      const fee = Math.abs(input.feeCents);
      const electronicDirection =
        input.type === 'deposit' || input.type === 'transfer_in'
          ? 1
          : input.type === 'withdrawal' || input.type === 'transfer_out' || input.type === 'fee'
            ? -1
            : 0;
      const cashDirection = input.type === 'deposit' ? 1 : input.type === 'withdrawal' ? -1 : 0;
      const transaction: Transaction = {
        id: makeId('tx'),
        reference: input.reference.trim(),
        operator: input.operator,
        type: input.type,
        amountCents: amount,
        feeCents: fee,
        commissionCents: Math.abs(input.commissionCents),
        electronicDeltaCents: electronicDirection * amount - (input.type === 'withdrawal' ? fee : 0),
        cashDeltaCents: cashDirection * amount,
        status: input.status,
        matchStatus: input.status === 'confirmed' ? 'matched' : 'unmatched',
        agent: input.agent.trim() || actorLabel,
        note: input.note.trim(),
        source: 'manual',
        createdAt: new Date().toISOString(),
      };
      setData((current) => ({
        ...current,
        transactions: [transaction, ...current.transactions],
        anomalies:
          transaction.status === 'pending'
            ? [
                {
                  id: makeId('anomaly'),
                  title: 'Transaction sans confirmation concordante',
                  type: 'Transaction non rapprochée',
                  severity: 'moderate',
                  status: 'open',
                  description:
                    'Une opération a été saisie localement mais aucune confirmation indépendante n’a été enregistrée. Elle reste hors des soldes calculés.',
                  amountCents: transaction.amountCents,
                  operator: transaction.operator,
                  reference: transaction.reference || undefined,
                  agent: transaction.agent,
                  createdAt: transaction.createdAt,
                  history: [{ at: transaction.createdAt, text: 'Ajoutée automatiquement au centre de contrôles après une saisie en attente.' }],
                },
                ...current.anomalies,
              ]
            : current.anomalies,
        auditEvents: recordAudit(
          current,
          'Opération saisie localement',
          `${transaction.reference || 'Sans référence'} · ${transactionTypeLabel[transaction.type]} · ${transactionStatusLabel[transaction.status]}`,
        ),
      }));
    },
    [actorLabel, recordAudit],
  );

  const cancelTransaction = useCallback(
    (id: string, note: string) => {
      setData((current) => {
        const transaction = current.transactions.find((item) => item.id === id);
        if (!transaction || transaction.status !== 'pending') return current;
        return {
          ...current,
          transactions: current.transactions.map((item) =>
            item.id === id ? { ...item, status: 'cancelled', note: [item.note, note.trim()].filter(Boolean).join(' · ') } : item,
          ),
          anomalies: current.anomalies.map((anomaly) =>
            anomaly.reference === transaction.reference &&
            anomaly.type === 'Transaction non rapprochée' &&
            anomaly.status !== 'resolved'
              ? {
                  ...anomaly,
                  status: 'resolved',
                  resolution: `Saisie annulée localement : ${note.trim()}`,
                  history: [{ at: new Date().toISOString(), text: `Saisie annulée : ${note.trim()}` }, ...anomaly.history],
                }
              : anomaly,
          ),
          auditEvents: recordAudit(current, 'Saisie en attente annulée', `${transaction.reference} · ${note.trim()}`),
        };
      });
    },
    [recordAudit],
  );

  const reverseTransaction = useCallback(
    (id: string, note: string) => {
      setData((current) => {
        const original = current.transactions.find((item) => item.id === id);
        const alreadyReversed = current.transactions.some((item) => item.relatedTransactionId === id);
        if (!original || original.status !== 'confirmed' || alreadyReversed || note.trim().length < 4) return current;
        const at = new Date().toISOString();
        const reversal: Transaction = {
          id: makeId('tx-reversal'),
          reference: original.reference ? `REV-${original.reference}` : `REV-${id.slice(-6)}`,
          operator: original.operator,
          type: 'adjustment',
          amountCents: original.amountCents,
          feeCents: 0,
          commissionCents: 0,
          electronicDeltaCents: -original.electronicDeltaCents,
          cashDeltaCents: -original.cashDeltaCents,
          status: 'confirmed',
          matchStatus: 'review',
          agent: actorLabel,
          note: `Inversion de ${original.reference || id}. Motif : ${note.trim()}`,
          source: 'manual',
          createdAt: at,
          relatedTransactionId: original.id,
        };
        const alert: Anomaly = {
          id: makeId('anomaly'),
          title: 'Inversion locale à vérifier',
          type: 'Transaction inversée',
          severity: 'moderate',
          status: 'open',
          description: `Une écriture compensatoire a été liée à ${original.reference || original.id}. La décision est locale et doit être vérifiée avec une preuve indépendante.`,
          amountCents: original.amountCents,
          operator: original.operator,
          reference: reversal.reference,
          agent: actorLabel,
          createdAt: at,
          history: [{ at, text: `Inversion déclarée : ${note.trim()}` }],
        };
        return {
          ...current,
          transactions: [
            reversal,
            ...current.transactions.map((item) => (item.id === original.id ? { ...item, status: 'reversed' as const } : item)),
          ],
          anomalies: [alert, ...current.anomalies],
          auditEvents: recordAudit(current, 'Écriture compensatoire ajoutée', `${reversal.reference} · liée à ${original.reference || original.id} · ${note.trim()}`),
        };
      });
    },
    [actorLabel, recordAudit],
  );

  const addCashMovement = useCallback(
    (movement: Omit<CashMovement, 'id' | 'createdAt' | 'agent'>) => {
      const record: CashMovement = {
        ...movement,
        id: makeId('cash'),
        createdAt: new Date().toISOString(),
        agent: actorLabel,
      };
      setData((current) => ({
        ...current,
        cashMovements: [record, ...current.cashMovements],
        auditEvents: recordAudit(current, 'Mouvement de caisse saisi', `${record.note} · ${record.status}`),
      }));
    },
    [actorLabel, recordAudit],
  );

  const reviewCashMovement = useCallback(
    (id: string, status: 'confirmed' | 'rejected', note: string) => {
      if (note.trim().length < 4) return;
      setData((current) => {
        const movement = current.cashMovements.find((item) => item.id === id);
        if (!movement || movement.status !== 'pending') return current;
        const action = status === 'confirmed' ? 'Mouvement de caisse confirmé localement' : 'Mouvement de caisse rejeté localement';
        return {
          ...current,
          cashMovements: current.cashMovements.map((item) =>
            item.id === id
              ? { ...item, status, note: `${item.note} · ${status === 'confirmed' ? 'Validation' : 'Rejet'} : ${note.trim()}` }
              : item,
          ),
          auditEvents: recordAudit(current, action, `${movement.note} · ${note.trim()}`),
        };
      });
    },
    [recordAudit],
  );

  const openCashSession = useCallback(
    (openingCountCents: number, explanation: string) => {
      setData((current) => {
        if (current.cashSessions.some((session) => session.status === 'open')) return current;
        const theoretical = getCashBalance(current);
        const variance = openingCountCents - theoretical;
        const openedAt = new Date().toISOString();
        const session: CashSession = {
          id: makeId('session'),
          status: 'open',
          openedAt,
          openingCountCents,
          openingTheoreticalCents: theoretical,
          openingVarianceCents: variance,
          openingExplanation: explanation.trim(),
          agent: actorLabel,
        };
        const openingAnomaly: Anomaly | null = variance === 0 ? null : {
          id: makeId('anomaly'),
          title: 'Écart de caisse à l’ouverture',
          type: 'Écart de caisse',
          severity: Math.abs(variance) >= current.settings.discrepancyThresholdCents ? 'high' : 'moderate',
          status: 'open',
          description: `Comptage d’ouverture : ${openingCountCents} centimes. Théorique : ${theoretical} centimes. Écart conservé sans ajustement automatique.`,
          amountCents: Math.abs(variance),
          agent: actorLabel,
          createdAt: openedAt,
          history: [{ at: openedAt, text: `Session ouverte avec un écart de ${variance} centimes. Motif : ${explanation.trim() || 'Non fourni'}` }],
        };
        return {
          ...current,
          cashSessions: [session, ...current.cashSessions],
          anomalies: openingAnomaly ? [openingAnomaly, ...current.anomalies] : current.anomalies,
          auditEvents: recordAudit(current, 'Session de caisse ouverte', `Comptage : ${openingCountCents} · théorique : ${theoretical} · écart : ${variance} · ${explanation.trim()}`),
        };
      });
    },
    [actorLabel, recordAudit],
  );

  const closeCashSession = useCallback(
    (closingCountCents: number, explanation: string) => {
      setData((current) => {
        const openSession = current.cashSessions.find((session) => session.status === 'open');
        if (!openSession) return current;
        const theoretical = getCashBalance(current);
        const variance = closingCountCents - theoretical;
        const closed: CashSession = {
          ...openSession,
          status: 'closed',
          closedAt: new Date().toISOString(),
          closingCountCents,
          closingTheoreticalCents: theoretical,
          varianceCents: variance,
          explanation: explanation.trim(),
        };
        const newAnomaly: Anomaly | null =
          variance === 0
            ? null
            : {
                id: makeId('anomaly'),
                title: 'Écart de clôture de caisse',
                type: 'Écart de caisse',
                severity: Math.abs(variance) >= current.settings.discrepancyThresholdCents ? 'high' : 'moderate',
                status: 'open',
                description: `Comptage : ${closingCountCents} centimes. Théorique : ${theoretical} centimes. Écart conservé sans ajustement automatique.`,
                amountCents: Math.abs(variance),
                agent: actorLabel,
                createdAt: new Date().toISOString(),
                history: [{ at: new Date().toISOString(), text: 'Clôture enregistrée ; la différence reste visible.' }],
              };
        const withAudit = recordAudit(
          current,
          'Session de caisse clôturée',
          `Compté : ${closingCountCents} · théorique : ${theoretical} · écart : ${variance}`,
        );
        return {
          ...current,
          cashSessions: current.cashSessions.map((session) => (session.id === openSession.id ? closed : session)),
          anomalies: newAnomaly ? [newAnomaly, ...current.anomalies] : current.anomalies,
          auditEvents: withAudit,
        };
      });
    },
    [actorLabel, recordAudit],
  );

  const setAnomalyStatus = useCallback(
    (id: string, status: 'in_review' | 'resolved', note: string) => {
      setData((current) => ({
        ...current,
        anomalies: current.anomalies.map((anomaly) =>
          anomaly.id === id
            ? {
                ...anomaly,
                status,
                resolution: status === 'resolved' ? note.trim() : anomaly.resolution,
                history: [
                  { at: new Date().toISOString(), text: note.trim() || 'Dossier examiné.' },
                  ...anomaly.history,
                ],
              }
            : anomaly,
        ),
        auditEvents: recordAudit(
          current,
          status === 'resolved' ? 'Dossier d’anomalie résolu' : 'Dossier d’anomalie examiné',
          note.trim(),
        ),
      }));
    },
    [recordAudit],
  );

  const addSmsText = useCallback(
    (text: string, operator: Operator, metadata?: { sender?: string; receivedAt?: string }) => {
      const rawText = text.trim();
      if (!rawText) return;
      const amountMatch = rawText.match(/montant\s*[:=]\s*([\d\s.,]+)\s*(USD|EUR|CDF|KES)?/i);
      const balanceMatch = rawText.match(/(?:nouveau\s+)?solde(?:\s+disponible)?\s*[:=]\s*([\d\s.,]+)\s*(USD|EUR|CDF|KES)?/i);
      const feeMatch = rawText.match(/(?:frais|fee)\s*[:=]\s*([\d\s.,]+)\s*(USD|EUR|CDF|KES)?/i);
      const commissionMatch = rawText.match(/(?:commission|com)\s*[:=]\s*([\d\s.,]+)\s*(USD|EUR|CDF|KES)?/i);
      const referenceMatch = rawText.match(/référence\s*[:=]\s*([A-Z0-9-]+)/i);
      const toCents = (value?: string) => {
        if (!value) return undefined;
        const normalized = value.replace(/\s/g, '').replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
      };
      setData((current) => {
        const duplicate = current.smsEvents.some(
          (event) => event.rawText.trim().toLocaleLowerCase() === rawText.toLocaleLowerCase(),
        );
        if (duplicate) return current;
        const amountCents = toCents(amountMatch?.[1]);
        const balanceCents = toCents(balanceMatch?.[1]);
        const feeCents = toCents(feeMatch?.[1]);
        const commissionCents = toCents(commissionMatch?.[1]);
        const reference = referenceMatch?.[1];
        const messageStatus: SmsEvent['messageStatus'] = /(?:annul|invers|revers|cancel|chargeback)/i.test(rawText)
          ? 'reversed'
          : /(?:échec|echec|échou|echou|rejet|refus|failed|declin)/i.test(rawText)
            ? 'failed'
            : /(?:réussi|reussi|confirm|succès|succes|effectué|effectue|completed|successful)/i.test(rawText)
              ? 'confirmed'
              : 'unknown';
        const parsedType = balanceCents !== undefined
          ? 'Point de solde'
          : messageStatus === 'failed'
            ? 'Échec annoncé'
            : messageStatus === 'reversed'
              ? 'Inversion annoncée'
              : amountCents !== undefined
                ? 'Transaction possible'
                : 'Message inconnu';
        const transaction = reference
          ? current.transactions.find(
              (candidate) =>
                candidate.reference.toLocaleLowerCase() === reference.toLocaleLowerCase() &&
                candidate.operator === operator,
            )
          : undefined;
        const exactAmount = transaction && amountCents === transaction.amountCents;
        const event: SmsEvent = {
          id: makeId('sms'),
          rawText,
          receivedAt: metadata?.receivedAt ?? new Date().toISOString(),
          sender: metadata?.sender,
          type: parsedType,
          messageStatus,
          operator,
          amountCents,
          feeCents,
          commissionCents,
          balanceCents,
          reference,
          confidence: amountCents !== undefined || balanceCents !== undefined ? 'high' : 'low',
          reconciliation: messageStatus === 'failed' || messageStatus === 'reversed'
            ? transaction
              ? `Le message annonce ${messageStatus === 'failed' ? 'un échec' : 'une inversion'} pour une opération existante ; aucun mouvement automatique.`
              : 'État non réussi sans correspondance fiable ; aucun mouvement financier créé.'
            : transaction
            ? exactAmount
              ? 'Référence et montant correspondent à une saisie locale ; preuve opérateur non vérifiée.'
              : 'Référence trouvée, mais les montants doivent être comparés.'
            : balanceCents !== undefined
              ? 'Point de comparaison seulement — aucun mouvement financier créé.'
              : 'Aucune correspondance fiable ; examen humain nécessaire.',
          source: 'manual-entry',
        };
        return {
          ...current,
          smsEvents: [event, ...current.smsEvents],
          auditEvents: recordAudit(current, 'Texte de message importé manuellement', `${operator} · ${event.type}`),
        };
      });
    },
    [recordAudit],
  );

  const updateSettings = useCallback(
    (patch: Partial<ShopSettings>) => {
      setData((current) => ({
        ...current,
        settings: { ...current.settings, ...patch },
        auditEvents: recordAudit(current, 'Paramètres de boutique modifiés localement', Object.keys(patch).join(', ')),
      }));
    },
    [recordAudit],
  );

  const updateReferenceBalances = useCallback(
    (referenceBalances: Record<Operator, number>, referenceCashCents: number, source: string) => {
      const capturedAt = new Date().toISOString();
      setData((current) => ({
        ...current,
        referenceBalances,
        referenceMetadata: Object.fromEntries(
          operators.map((operator) => [
            operator,
            { capturedAt, source: source.trim() || 'Saisie manuelle locale', confidence: 'manual' as const },
          ]),
        ) as ShopData['referenceMetadata'],
        referenceCashCents,
        referenceCashMetadata: {
          capturedAt,
          source: source.trim() || 'Saisie manuelle locale',
          confidence: 'manual',
        },
        auditEvents: recordAudit(
          current,
          'Points de référence modifiés',
          `Origine : ${source.trim() || 'Saisie manuelle locale'} · valeurs conservées comme nouveaux points de départ.`,
        ),
      }));
    },
    [recordAudit],
  );

  const toggleTestCheck = useCallback(
    (id: string) => {
      setData((current) => ({
        ...current,
        testChecks: { ...current.testChecks, [id]: !current.testChecks[id] },
        auditEvents: recordAudit(current, 'Scénario de contrôle marqué', id),
      }));
    },
    [recordAudit],
  );

  const value = useMemo(
    () => ({
      data,
      isReady,
      storageIssue,
    refreshServerData,
      addTransaction,
      cancelTransaction,
      reverseTransaction,
      addCashMovement,
      reviewCashMovement,
      openCashSession,
      closeCashSession,
      setAnomalyStatus,
      addSmsText,
      updateSettings,
      updateReferenceBalances,
      toggleTestCheck,
    }),
    [
      data,
      isReady,
      storageIssue,
      addTransaction,
      cancelTransaction,
      reverseTransaction,
      addCashMovement,
      reviewCashMovement,
      openCashSession,
      closeCashSession,
      setAnomalyStatus,
      addSmsText,
      updateSettings,
      updateReferenceBalances,
      toggleTestCheck,
    ],
  );

  return <ShopFlowContext.Provider value={value}>{children}</ShopFlowContext.Provider>;
}

export function useShopFlow() {
  const context = useContext(ShopFlowContext);
  if (!context) throw new Error('useShopFlow doit être utilisé dans ShopFlowProvider.');
  return context;
}

export { operators };
