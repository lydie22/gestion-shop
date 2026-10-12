import {
  Anomaly,
  anomalySeverityLabel,
  MatchStatus,
  Transaction,
  transactionStatusLabel,
  transactionTypeLabel,
} from '@/context/ShopFlowContext';

export function formatMoney(cents: number, currency = 'USD') {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDate(value: string, withTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined,
  }).format(date);
}

export function transactionTypeName(transaction: Transaction) {
  return transactionTypeLabel[transaction.type];
}

export function transactionStatusTone(status: Transaction['status']) {
  if (status === 'confirmed') return 'success' as const;
  if (status === 'failed' || status === 'cancelled') return 'danger' as const;
  if (status === 'reversed') return 'info' as const;
  return 'warning' as const;
}

export function matchStatusName(status: MatchStatus) {
  const labels: Record<MatchStatus, string> = {
    matched: 'Rapprochée',
    review: 'À vérifier',
    unmatched: 'Non rapprochée',
    duplicate: 'Doublon possible',
    critical: 'Anomalie critique',
  };
  return labels[status];
}

export function anomalyTone(severity: Anomaly['severity']) {
  if (severity === 'critical' || severity === 'high') return 'danger' as const;
  if (severity === 'moderate') return 'warning' as const;
  if (severity === 'info') return 'info' as const;
  return 'neutral' as const;
}

export function anomalySeverityName(severity: Anomaly['severity']) {
  return anomalySeverityLabel[severity];
}

export function statusName(status: Transaction['status']) {
  return transactionStatusLabel[status];
}

export function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
