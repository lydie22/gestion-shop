/** Client HTTP du backend ShopFlow. Le stockage local reste disponible hors ligne. */

const API_URL = (process.env.EXPO_PUBLIC_SHOPFLOW_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const isLocalHttp = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(API_URL);
if (process.env.NODE_ENV === 'production' && API_URL.startsWith('http://') && !isLocalHttp) {
  throw new Error('EXPO_PUBLIC_SHOPFLOW_API_URL doit utiliser HTTPS en production.');
}

export type BackendRole = 'owner' | 'supervisor' | 'agent';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user_id: string;
  full_name: string;
  shop_id: string;
  role: BackendRole;
}

export interface AccessibleShop {
  id: string;
  tenant_id: string;
  name: string;
  currency: string;
  timezone: string;
  role: BackendRole;
  current: boolean;
}

export interface SmsSyncItem {
  operator: string;
  raw_text: string;
  device_id?: string;
  account_id?: string;
  sender?: string;
  received_at?: string;
  idempotency_key: string;
}

export interface SmsSyncResult {
  id: string;
  account_id?: string;
  reconciliation_status: string;
  parsed_type: string;
  message_status: 'confirmed' | 'failed' | 'reversed' | 'unknown';
  parsed_amount_cents?: number;
  fee_cents?: number;
  commission_cents?: number;
  parsed_balance_cents?: number;
  reference?: string;
}

export interface CommissionSummary {
  calculations: Array<{ id: string; transaction_id: string; expected_cents: number; status: string }>;
  receipts: Array<{ id: string; transaction_id?: string; amount_cents: number; status: string }>;
}

export interface ReconciliationSummary {
  id: string;
  sms_message_id: string;
  transaction_id?: string;
  status: string;
  expected_amount_cents?: number;
  observed_amount_cents?: number;
  difference_cents?: number;
  reason: string;
}

export interface BackendSmsMessage {
  id: string;
  shop_id: string;
  account_id?: string;
  sender?: string;
  operator: string;
  parsed_type: string;
  message_status: 'confirmed' | 'failed' | 'reversed' | 'unknown';
  parsed_amount_cents?: number;
  fee_cents?: number;
  commission_cents?: number;
  parsed_balance_cents?: number;
  reference?: string;
  parser_version: string;
  confidence: 'high' | 'low';
  reconciliation_status: string;
  received_at: string;
}

export interface BackendAnomaly {
  id: string;
  shop_id: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  reference?: string;
  amount_cents: number;
  history: Array<{ at: string; text: string }>;
  created_at: string;
  resolved_at?: string;
}

export interface SubscriptionSummary {
  id: string;
  shop_id: string;
  plan: 'pilot' | 'standard' | 'pro';
  status: 'trialing' | 'active' | 'paused' | 'cancelled';
  trial_ends_at?: string;
  current_period_end?: string;
}

export interface BackendAccount {
  id: string;
  shop_id: string;
  operator: string;
  label: string;
  currency: string;
  active: boolean;
}

export interface BackendAgent {
  id: string;
  name: string;
  user_id?: string;
  active: boolean;
}

export interface BackendTransaction {
  id: string;
  account_id: string;
  agent_id?: string;
  reference: string;
  operation_type: string;
  amount_cents: number;
  fee_cents: number;
  commission_expected_cents: number;
  status: string;
  reconciliation_status: string;
  source: string;
  note?: string;
  created_at: string;
}

export interface DailyReport {
  day: string;
  transactions: { total: number; confirmed: number; pending: number; failed: number; amount_cents: number };
  cash: { movement_count: number; confirmed_delta_cents: number; pending_count: number };
  sms: { total: number; matched: number; review: number; duplicates: number };
  anomalies: { created: number; open: number };
  by_operator: Array<{ operator: string; transaction_count: number; confirmed_count: number; amount_cents: number }>;
  by_agent: Array<{ agent_id?: string; agent_name: string; transaction_count: number; confirmed_count: number; amount_cents: number }>;
}

export class ShopFlowApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ShopFlowApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new ShopFlowApiError(0, `Le serveur est inaccessible. Vérifie la connexion et l’URL API (${API_URL}).`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = response.status === 401
      ? 'Compte ShopFlow introuvable ou mot de passe incorrect. Les comptes créés directement dans Supabase Auth ne sont pas encore des comptes ShopFlow : utilise « Créer une nouvelle boutique » ou fais créer le membre depuis « Agents & rôles ». '
      : response.status === 503
        ? 'Le backend est démarré mais sa base de données n’est pas prête.'
        : typeof body.detail === 'string' ? body.detail : `La requête backend a échoué (${response.status}).`;
    throw new ShopFlowApiError(response.status, detail);
  }
  return body as T;
}

export const shopflowApi = {
  baseUrl: API_URL,
  login: (email: string, password: string) =>
    request<AuthSession>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (input: { email: string; password: string; full_name: string; shop_name: string; currency?: string }) =>
    request<AuthSession>('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  refresh: (refreshToken: string) =>
    request<AuthSession>('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }),
  logout: (refreshToken: string) =>
    request<{ revoked: boolean }>('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }),
  listMyShops: (accessToken: string) => request<AccessibleShop[]>('/api/v1/me/shops', {}, accessToken),
  switchShop: (shopId: string, accessToken: string) => request<AuthSession>('/api/v1/auth/switch-shop', { method: 'POST', body: JSON.stringify({ shop_id: shopId }) }, accessToken),
  registerDevice: (input: { device_key: string; label: string }, accessToken: string) =>
    request<{ id: string; device_key: string; status: string; duplicate: boolean }>('/api/v1/devices/register', { method: 'POST', body: JSON.stringify(input) }, accessToken),
  revokeDevice: (deviceId: string, accessToken: string) =>
    request<{ id: string; device_key: string; status: string }>(`/api/v1/devices/${deviceId}/revoke`, { method: 'POST' }, accessToken),
  syncSmsBatch: (items: SmsSyncItem[], accessToken: string) =>
    request<SmsSyncResult[]>('/api/v1/sync/batch', { method: 'POST', body: JSON.stringify(items) }, accessToken),
  listSmsMessages: (accessToken: string) => request<BackendSmsMessage[]>('/api/v1/sms/messages', {}, accessToken),
  getReconciliations: (accessToken: string) => request<ReconciliationSummary[]>('/api/v1/reconciliations', {}, accessToken),
  listAnomalies: (accessToken: string) => request<BackendAnomaly[]>('/api/v1/anomalies', {}, accessToken),
  reviewAnomaly: (id: string, note: string, accessToken: string) => request<BackendAnomaly>(`/api/v1/anomalies/${id}/review`, { method: 'POST', body: JSON.stringify({ note }) }, accessToken),
  resolveAnomaly: (id: string, resolution: string, accessToken: string) => request<BackendAnomaly>(`/api/v1/anomalies/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) }, accessToken),
  getAuditLogs: (accessToken: string) => request<Array<{ id: string; actor_id: string; action: string; entity_type: string; entity_id: string; reason?: string; metadata: Record<string, unknown>; created_at: string }>>('/api/v1/audit-logs', {}, accessToken),
  getSubscription: (accessToken: string) => request<SubscriptionSummary>('/api/v1/subscription', {}, accessToken),
  updateSubscription: (input: { plan: SubscriptionSummary['plan']; status: SubscriptionSummary['status']; current_period_end?: string }, accessToken: string) => request<SubscriptionSummary>('/api/v1/subscription', { method: 'PATCH', body: JSON.stringify(input) }, accessToken),
  listAccounts: (accessToken: string) => request<BackendAccount[]>('/api/v1/accounts', {}, accessToken),
  listTransactions: (accessToken: string) => request<BackendTransaction[]>('/api/v1/transactions?limit=500', {}, accessToken),
  createAccount: (input: { operator: string; label: string; currency?: string; opening_balance_cents: number }, accessToken: string) => request<BackendAccount>('/api/v1/accounts', { method: 'POST', body: JSON.stringify(input) }, accessToken),
  listAgents: (accessToken: string) => request<BackendAgent[]>('/api/v1/agents', {}, accessToken),
  createAgent: (input: { name: string; user_id?: string }, accessToken: string) => request<BackendAgent>('/api/v1/agents', { method: 'POST', body: JSON.stringify(input) }, accessToken),
  assignAccount: (accountId: string, input: { agent_id: string; assignment_role: 'operator' | 'shared_operator' | 'supervisor' }, accessToken: string) => request<{ id: string; account_id: string; agent_id: string; active: boolean }>(`/api/v1/accounts/${accountId}/assignments`, { method: 'POST', body: JSON.stringify(input) }, accessToken),
  createTransaction: (input: { account_id: string; agent_id?: string; reference: string; operation_type: string; amount_cents: number; fee_cents: number; commission_expected_cents: number; status: string; source: 'manual'; note?: string; idempotency_key: string }, accessToken: string) =>
    request<{ id: string; status: string; reconciliation_status: string }>('/api/v1/transactions', { method: 'POST', body: JSON.stringify(input) }, accessToken),
  getBalance: (accountId: string, accessToken: string) =>
    request<{ account_id: string; theoretical_balance_cents: number; currency: string; last_observed_balance_cents?: number; last_observed_at?: string; last_observed_source?: string; last_observed_verification_status?: string; last_observed_age_seconds?: number; confirmed_movement_count: number; last_movement_at?: string }>(`/api/v1/accounts/${accountId}/balance`, {}, accessToken),
  getCommissions: (accessToken: string) => request<CommissionSummary>('/api/v1/commissions', {}, accessToken),
  getCashBalance: (accessToken: string) => request<{ theoretical_balance_cents: number; currency: string }>('/api/v1/cash/balance', {}, accessToken),
  getCashMovements: (accessToken: string) => request<Array<{ id: string; category: string; amount_cents: number; delta_cents: number; note: string; status: string; created_by: string; created_at: string }>>('/api/v1/cash/movements', {}, accessToken),
  getCashSessions: (accessToken: string) => request<Array<{ id: string; opened_by: string; status: string; opening_count_cents: number; opening_theoretical_cents: number; opening_variance_cents: number; closing_count_cents?: number; closing_theoretical_cents?: number; variance_cents?: number; opening_note: string; closing_note?: string; opened_at: string; closed_at?: string }>>('/api/v1/cash/sessions', {}, accessToken),
  createCashMovement: (input: { category: string; amount_cents: number; note: string; status: 'pending' | 'confirmed'; idempotency_key: string }, accessToken: string) => request<{ id: string; delta_cents: number; status: string; duplicate: boolean }>('/api/v1/cash/movements', { method: 'POST', body: JSON.stringify(input) }, accessToken),
  reviewCashMovement: (movementId: string, status: 'confirmed' | 'rejected', reason: string, accessToken: string) => request<{ id: string; status: string; reason: string }>(`/api/v1/cash/movements/${movementId}/review`, { method: 'POST', body: JSON.stringify({ status, reason }) }, accessToken),
  openCashSession: (input: { counted_cents: number; note: string }, accessToken: string) => request<{ id: string; status: string; theoretical_cents: number; variance_cents: number }>('/api/v1/cash/sessions/open', { method: 'POST', body: JSON.stringify(input) }, accessToken),
  closeCashSession: (id: string, input: { counted_cents: number; note: string }, accessToken: string) => request<{ id: string; status: string; theoretical_cents: number; variance_cents: number }>(`/api/v1/cash/sessions/${id}/close`, { method: 'POST', body: JSON.stringify(input) }, accessToken),
  getLedger: (accessToken: string) => request<Array<{ id: string; reference: string; balanced: boolean; debit_cents: number; credit_cents: number }>>('/api/v1/ledger', {}, accessToken),
  getDailyReport: (day: string, accessToken: string) => request<DailyReport>(`/api/v1/reports/daily?day=${encodeURIComponent(day)}`, {}, accessToken),
  listMembers: (accessToken: string) => request<Array<{ user_id: string; email: string; full_name: string; role: BackendRole; active: boolean }>>('/api/v1/members', {}, accessToken),
  createMember: (input: { email: string; full_name: string; password: string; role: Exclude<BackendRole, 'owner'> }, accessToken: string) =>
    request<{ user_id: string; membership_id: string; role: BackendRole }>('/api/v1/members', { method: 'POST', body: JSON.stringify(input) }, accessToken),
  updateMemberRole: (userId: string, role: BackendRole, accessToken: string) =>
    request<{ user_id: string; role: BackendRole; active: boolean }>(`/api/v1/members/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }, accessToken),
  recordCommissionReceipt: (input: { transaction_id?: string; amount_cents: number; source_reference?: string; proof_note: string; idempotency_key: string }, accessToken: string) =>
    request<{ id: string; status: string; duplicate: boolean }>('/api/v1/commission-receipts', { method: 'POST', body: JSON.stringify(input) }, accessToken),
};

