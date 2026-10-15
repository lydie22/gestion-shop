import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
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
import { enqueueSmsEvent } from '@/services/smsSyncQueue';
import { readSecureBlob, writeSecureBlob } from '@/services/secureQueueStorage';

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
  const metadata = await SecureStore.getItemAsync(`${key}.meta`);
  if (metadata) {
    try {
      const { count } = JSON.parse(metadata) as { count: number };
      if (Number.isInteger(count) && count >= 0) {
        const chunks = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${key}.${index}`)));
        return chunks.every((chunk) => chunk !== null) ? chunks.join('') : null;
      }
    } catch {
      return null;
    }
  }
  // Compatibilité avec les valeurs créées avant le stockage fragmenté.
  return SecureStore.getItemAsync(key);
}

async function writeProtectedSms(storageKey: string, eventId: string, rawText: string): Promise<void> {
  const key = protectedSmsKey(storageKey, eventId);
  const chunks = rawText.match(new RegExp(`.{1,${SECURE_SMS_CHUNK_SIZE}}`, 'gs')) ?? [''];
  await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.${index}`, chunk)));
  await SecureStore.setItemAsync(`${key}.meta`, JSON.stringify({ count: chunks.length }));
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
  source: 'demo' | 'manual';
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
  source: 'demo' | 'manual-entry';
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
  version: 1;
  seededAt: string;
  referenceBalances: Record<Operator, number>;
  referenceMetadata: Record<Operator, { capturedAt: string; source: string; confidence: 'example' | 'manual' }>;
  referenceCashCents: number;
  referenceCashMetadata: { capturedAt: string; source: string; confidence: 'example' | 'manual' };
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

function seedData(): ShopData {
  const now = new Date().toISOString();
  const transactions: Transaction[] = [
    {
      id: 'demo-tx-01',
      reference: 'AT-84921',
      operator: 'Airtel Money',
      type: 'deposit',
      amountCents: 5000,
      feeCents: 0,
      commissionCents: 50,
      electronicDeltaCents: 5000,
      cashDeltaCents: 5000,
      status: 'confirmed',
      matchStatus: 'matched',
      agent: 'Mireille K.',
      note: 'Exemple de démonstration — entrée validée manuellement.',
      source: 'demo',
      createdAt: ago(145),
    },
    {
      id: 'demo-tx-02',
      reference: 'AT-84922',
      operator: 'Airtel Money',
      type: 'withdrawal',
      amountCents: 2000,
      feeCents: 100,
      commissionCents: 35,
      electronicDeltaCents: -2100,
      cashDeltaCents: -2000,
      status: 'confirmed',
      matchStatus: 'matched',
      agent: 'Mireille K.',
      note: 'Frais affichés séparément dans cet exemple.',
      source: 'demo',
      createdAt: ago(112),
    },
    {
      id: 'demo-tx-03',
      reference: 'OM-20418',
      operator: 'Orange Money',
      type: 'transfer_in',
      amountCents: 3200,
      feeCents: 0,
      commissionCents: 40,
      electronicDeltaCents: 3200,
      cashDeltaCents: 0,
      status: 'confirmed',
      matchStatus: 'matched',
      agent: 'Jonas M.',
      note: 'Exemple de transfert reçu.',
      source: 'demo',
      createdAt: ago(84),
    },
    {
      id: 'demo-tx-04',
      reference: 'OM-20419',
      operator: 'Orange Money',
      type: 'transfer_out',
      amountCents: 1800,
      feeCents: 0,
      commissionCents: 20,
      electronicDeltaCents: -1800,
      cashDeltaCents: 0,
      status: 'confirmed',
      matchStatus: 'matched',
      agent: 'Jonas M.',
      note: 'Exemple de transfert envoyé.',
      source: 'demo',
      createdAt: ago(59),
    },
    {
      id: 'demo-tx-05',
      reference: 'MP-66002',
      operator: 'M-Pesa',
      type: 'deposit',
      amountCents: 800,
      feeCents: 0,
      commissionCents: 12,
      electronicDeltaCents: 800,
      cashDeltaCents: 800,
      status: 'confirmed',
      matchStatus: 'matched',
      agent: 'Mireille K.',
      note: 'Exemple de dépôt.',
      source: 'demo',
      createdAt: ago(43),
    },
    {
      id: 'demo-tx-06',
      reference: 'MP-66003',
      operator: 'M-Pesa',
      type: 'withdrawal',
      amountCents: 1500,
      feeCents: 0,
      commissionCents: 22,
      electronicDeltaCents: -1500,
      cashDeltaCents: -1500,
      status: 'confirmed',
      matchStatus: 'matched',
      agent: 'Jonas M.',
      note: 'Exemple de retrait.',
      source: 'demo',
      createdAt: ago(26),
    },
    {
      id: 'demo-tx-07',
      reference: 'AT-84923',
      operator: 'Airtel Money',
      type: 'transfer_out',
      amountCents: 2500,
      feeCents: 0,
      commissionCents: 0,
      electronicDeltaCents: -2500,
      cashDeltaCents: 0,
      status: 'pending',
      matchStatus: 'unmatched',
      agent: 'Jonas M.',
      note: 'Exemple en attente de confirmation.',
      source: 'demo',
      createdAt: ago(12),
    },
  ];

  return {
    version: 1,
    seededAt: now,
    referenceBalances: {
      'Airtel Money': 30000,
      'Orange Money': 42200,
      'M-Pesa': 125000,
    },
    referenceMetadata: {
      'Airtel Money': { capturedAt: ago(170), source: 'Exemple fictif', confidence: 'example' },
      'Orange Money': { capturedAt: ago(170), source: 'Exemple fictif', confidence: 'example' },
      'M-Pesa': { capturedAt: ago(170), source: 'Exemple fictif', confidence: 'example' },
    },
    referenceCashCents: 17000,
    referenceCashMetadata: { capturedAt: ago(260), source: 'Comptage de démonstration', confidence: 'example' },
    transactions,
    cashMovements: [
      {
        id: 'demo-cash-01',
        category: 'expense',
        amountCents: 3000,
        deltaCents: -3000,
        note: 'Fournitures — exemple',
        status: 'confirmed',
        createdAt: ago(96),
        agent: 'Mireille K.',
      },
      {
        id: 'demo-cash-02',
        category: 'owner_in',
        amountCents: 3000,
        deltaCents: 3000,
        note: 'Apport du propriétaire — exemple',
        status: 'confirmed',
        createdAt: ago(94),
        agent: 'Aline N.',
      },
    ],
    cashSessions: [
      {
        id: 'demo-session-01',
        status: 'closed',
        openedAt: ago(260),
        openingCountCents: 20000,
        openingTheoreticalCents: 20000,
        closedAt: ago(22),
        closingCountCents: 19500,
        closingTheoreticalCents: 20000,
        varianceCents: -500,
        explanation: 'Exemple : différence à contrôler, non ajustée automatiquement.',
        agent: 'Mireille K.',
      },
    ],
    anomalies: [
      {
        id: 'demo-an-01',
        title: 'Écart entre solde théorique et annoncé',
        type: 'Écart de solde',
        severity: 'high',
        status: 'open',
        description:
          'Le dernier point annoncé dans cet exemple est de 319,00 USD. Le calcul des mouvements connus donne 329,00 USD. Aucune correction automatique n’a été appliquée.',
        amountCents: 1000,
        operator: 'Airtel Money',
        reference: 'AT-BAL-01',
        agent: 'À attribuer',
        createdAt: ago(40),
        history: [{ at: ago(40), text: 'Dossier de démonstration créé après comparaison de soldes.' }],
      },
      {
        id: 'demo-an-02',
        title: 'Opération sans confirmation',
        type: 'Transaction non rapprochée',
        severity: 'moderate',
        status: 'open',
        description:
          'Une transaction saisie localement ne possède pas encore de preuve ou de référence concordante.',
        amountCents: 2500,
        operator: 'Airtel Money',
        reference: 'AT-84923',
        agent: 'Jonas M.',
        createdAt: ago(12),
        history: [{ at: ago(12), text: 'Saisie locale en attente de vérification.' }],
      },
      {
        id: 'demo-an-03',
        title: 'Écart de clôture de caisse',
        type: 'Écart de caisse',
        severity: 'high',
        status: 'in_review',
        description:
          'Le comptage d’exemple est inférieur de 5,00 USD au montant théorique de la clôture.',
        amountCents: 500,
        agent: 'Mireille K.',
        createdAt: ago(22),
        history: [{ at: ago(22), text: 'Clôture enregistrée avec une différence de -5,00 USD.' }],
      },
      {
        id: 'demo-an-04',
        title: 'Format de message à vérifier',
        type: 'Message inconnu',
        severity: 'low',
        status: 'open',
        description:
          'Exemple de message dont le format ne permet pas d’extraire des données fiables.',
        amountCents: 0,
        agent: 'Appareil local',
        createdAt: ago(18),
        history: [{ at: ago(18), text: 'Message conservé en attente d’analyse humaine.' }],
      },
    ],
    smsEvents: [
      {
        id: 'demo-sms-01',
        rawText:
          'Transaction réussie. Montant : 50 USD Référence : AT-84921 Nouveau solde : 350 USD',
        receivedAt: ago(145),
        type: 'Confirmation — exemple fictif',
        operator: 'Airtel Money',
        amountCents: 5000,
        balanceCents: 35000,
        reference: 'AT-84921',
        confidence: 'high',
        reconciliation: 'Correspondance de démonstration par référence ; solde illustratif au moment du message : 350,00 USD.',
        source: 'demo',
      },
      {
        id: 'demo-sms-02',
        rawText: 'Solde disponible : 319 USD',
        receivedAt: ago(40),
        type: 'Point de solde — exemple fictif',
        operator: 'Airtel Money',
        balanceCents: 31900,
        confidence: 'low',
        reconciliation: 'Écart de 10,00 USD à examiner ; ce SMS ne crée pas de mouvement.',
        source: 'demo',
      },
    ],
    auditEvents: [
      {
        id: 'demo-audit-01',
        at: ago(145),
        actor: 'Mireille K.',
        action: 'Transaction de démonstration enregistrée',
        detail: 'AT-84921 · 50,00 USD · source locale illustrative',
      },
      {
        id: 'demo-audit-02',
        at: ago(22),
        actor: 'Mireille K.',
        action: 'Clôture de caisse de démonstration',
        detail: 'Compté : 195,00 USD · théorique : 200,00 USD · écart conservé',
      },
    ],
    agents: [
      { id: 'demo-agent-01', name: 'Aline N.', role: 'Propriétaire', register: 'Toutes les caisses', session: 'active' },
      { id: 'demo-agent-02', name: 'Mireille K.', role: 'Superviseur', register: 'Caisse principale', session: 'active' },
      { id: 'demo-agent-03', name: 'Jonas M.', role: 'Agent', register: 'Caisse principale', session: 'closed' },
    ],
    settings: {
      shopName: 'Boutique Horizon',
      currency: 'USD',
      discrepancyThresholdCents: 500,
      deviceName: 'Téléphone de boutique',
    },
    testChecks: {},
  };
}

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
  const anchorAt = Date.parse(data.referenceMetadata[operator]?.capturedAt ?? data.seededAt);
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
  const anchorAt = Date.parse(data.referenceCashMetadata?.capturedAt ?? data.seededAt);
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
  addTransaction: (input: NewTransaction) => void;
  cancelTransaction: (id: string, note: string) => void;
  reverseTransaction: (id: string, note: string) => void;
  addCashMovement: (movement: Omit<CashMovement, 'id' | 'createdAt' | 'agent'>) => void;
  reviewCashMovement: (id: string, status: 'confirmed' | 'rejected', note: string) => void;
  openCashSession: (openingCountCents: number, explanation: string) => void;
  closeCashSession: (closingCountCents: number, explanation: string) => void;
  setAnomalyStatus: (id: string, status: 'in_review' | 'resolved', note: string) => void;
  addSmsText: (text: string, operator: Operator, metadata?: { sender?: string; receivedAt?: string }) => void;
  addAgent: (name: string, role: Agent['role']) => void;
  updateSettings: (patch: Partial<ShopSettings>) => void;
  updateReferenceBalances: (referenceBalances: Record<Operator, number>, referenceCashCents: number, source: string) => void;
  toggleTestCheck: (id: string) => void;
  resetDemo: () => void;
}

const ShopFlowContext = createContext<ShopFlowContextValue | null>(null);

export function ShopFlowProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const storageKey = session ? `${STORAGE_KEY}.${session.shop_id}` : `${STORAGE_KEY}.local`;
  const [data, setData] = useState<ShopData>(() => seedData());
  const [isReady, setIsReady] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [storageIssue, setStorageIssue] = useState(false);
  const skipNextSave = useRef(false);
  // Serialize persistence writes so a slower write for an older state cannot
  // finish after a newer state and overwrite it locally.
  const persistenceChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    setIsReady(false);
    setLoadedStorageKey(null);
    setData(seedData());
    const loadPersistedData = async () => {
      const secureKey = `${SECURE_DATA_KEY}.${storageKey}`;
      const saved = shouldProtectLocalText()
        ? ((await readSecureBlob(secureKey)) ?? (await AsyncStorage.getItem(storageKey)))
        : await AsyncStorage.getItem(storageKey);
      if (!active) return;
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as ShopData;
          if (parsed.version === 1 && parsed.transactions && parsed.settings) {
            const defaults = seedData();
            const restored: ShopData = {
              ...defaults,
              ...parsed,
              referenceMetadata: parsed.referenceMetadata ?? defaults.referenceMetadata,
              referenceCashMetadata: parsed.referenceCashMetadata ?? defaults.referenceCashMetadata,
              testChecks: parsed.testChecks ?? {},
            };
            if (shouldProtectLocalText()) {
              restored.smsEvents = await Promise.all(restored.smsEvents.map(async (event) => {
                if (event.source === 'demo') return event;
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
          setData(seedData());
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
    if (isReady && loadedStorageKey === storageKey) {
      if (skipNextSave.current) {
        skipNextSave.current = false;
        return;
      }
      const snapshot = data;
      const persist = async () => {
        let persisted = snapshot;
        if (shouldProtectLocalText()) {
          await Promise.all(snapshot.smsEvents.filter((event) => event.source !== 'demo').map((event) => writeProtectedSms(storageKey, event.id, event.rawText)));
          persisted = {
            ...snapshot,
            smsEvents: snapshot.smsEvents.map((event) => event.source === 'demo' ? event : { ...event, rawText: '[contenu protégé localement]' }),
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
  // file réseau dès qu'une session serveur existe. Les exemples fictifs restent
  // strictement locaux et ne sont jamais envoyés.
  useEffect(() => {
    if (!session || !isReady || loadedStorageKey !== storageKey) return;
    const pending = data.smsEvents.filter((event) => event.source !== 'demo');
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
        actor: 'Utilisateur local',
        action,
        detail,
      },
      ...current.auditEvents,
    ],
    [],
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
        agent: input.agent.trim() || 'Utilisateur local',
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
    [recordAudit],
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
          agent: 'Utilisateur local',
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
          agent: 'Utilisateur local',
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
    [recordAudit],
  );

  const addCashMovement = useCallback(
    (movement: Omit<CashMovement, 'id' | 'createdAt' | 'agent'>) => {
      const record: CashMovement = {
        ...movement,
        id: makeId('cash'),
        createdAt: new Date().toISOString(),
        agent: 'Utilisateur local',
      };
      setData((current) => ({
        ...current,
        cashMovements: [record, ...current.cashMovements],
        auditEvents: recordAudit(current, 'Mouvement de caisse saisi', `${record.note} · ${record.status}`),
      }));
    },
    [recordAudit],
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
          agent: 'Utilisateur local',
        };
        const openingAnomaly: Anomaly | null = variance === 0 ? null : {
          id: makeId('anomaly'),
          title: 'Écart de caisse à l’ouverture',
          type: 'Écart de caisse',
          severity: Math.abs(variance) >= current.settings.discrepancyThresholdCents ? 'high' : 'moderate',
          status: 'open',
          description: `Comptage d’ouverture : ${openingCountCents} centimes. Théorique : ${theoretical} centimes. Écart conservé sans ajustement automatique.`,
          amountCents: Math.abs(variance),
          agent: 'Utilisateur local',
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
    [recordAudit],
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
                agent: 'Utilisateur local',
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
    [recordAudit],
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

  const addAgent = useCallback(
    (name: string, role: Agent['role']) => {
      const agent: Agent = {
        id: makeId('agent'),
        name: name.trim(),
        role,
        register: 'À affecter',
        session: 'closed',
      };
      setData((current) => ({
        ...current,
        agents: [...current.agents, agent],
        auditEvents: recordAudit(current, 'Profil local ajouté', `${agent.name} · ${agent.role}`),
      }));
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

  const resetDemo = useCallback(() => {
    const fresh = seedData();
    setData(fresh);
  }, []);

  const value = useMemo(
    () => ({
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
      addAgent,
      updateSettings,
      updateReferenceBalances,
      toggleTestCheck,
      resetDemo,
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
      addAgent,
      updateSettings,
      updateReferenceBalances,
      toggleTestCheck,
      resetDemo,
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
