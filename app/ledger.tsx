import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { formatDate, formatMoney, statusName, transactionTypeName } from '@/components/shopflow/format';
import { Badge, Card, ChoiceChip, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { getCashBalance, getWalletBalance, operators, Operator, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { BackendAccount, shopflowApi } from '@/services/shopflowApi';

type LedgerAccount = Operator | 'Caisse';
type LedgerRow = {
  id: string;
  at: string;
  title: string;
  reference: string;
  deltaCents: number;
  status: string;
  source: string;
  transactionId?: string;
  note?: string;
};

export default function LedgerScreen() {
  const { data } = useShopFlow();
  const colors = useColors();
  const { session } = useAuth();
  const [serverLedger, setServerLedger] = useState<Array<{ id: string; reference: string; balanced: boolean; debit_cents: number; credit_cents: number }>>([]);
  const [serverCash, setServerCash] = useState<number | null>(null);
  const [backendAccounts, setBackendAccounts] = useState<BackendAccount[]>([]);
  const [selectedBackendAccountId, setSelectedBackendAccountId] = useState<string | null>(null);
  const [serverAccountBalance, setServerAccountBalance] = useState<{ theoretical_balance_cents: number; last_observed_balance_cents?: number; last_observed_at?: string; last_observed_age_seconds?: number } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [account, setAccount] = useState<LedgerAccount>(operators[0]);

  useEffect(() => {
    if (!session) return;
    Promise.all([shopflowApi.getLedger(session.access_token), shopflowApi.getCashBalance(session.access_token), shopflowApi.listAccounts(session.access_token)])
      .then(([ledger, cashBalance, accounts]) => {
        setServerLedger(ledger);
        setServerCash(cashBalance.theoretical_balance_cents);
        setBackendAccounts(accounts);
        setSelectedBackendAccountId((current) => {
          const active = accounts.filter((item) => item.active && item.operator === account);
          return current && active.some((item) => item.id === current) ? current : active[0]?.id ?? null;
        });
        setServerError(null);
      })
      .catch((cause) => setServerError(cause instanceof Error ? cause.message : 'Journal serveur indisponible.'));
  }, [session]);
  useEffect(() => {
    if (account === 'Caisse') {
      setSelectedBackendAccountId(null);
      return;
    }
    const active = backendAccounts.filter((item) => item.active && item.operator === account);
    setSelectedBackendAccountId((current) => current && active.some((item) => item.id === current) ? current : active[0]?.id ?? null);
  }, [account, backendAccounts]);
  useEffect(() => {
    if (!session || account === 'Caisse') {
      setServerAccountBalance(null);
      return;
    }
    const accountId = backendAccounts.find((item) => item.id === selectedBackendAccountId && item.operator === account && item.active)?.id;
    if (!accountId) {
      setServerAccountBalance(null);
      return;
    }
    shopflowApi.getBalance(accountId, session.access_token)
      .then((balance) => setServerAccountBalance(balance))
      .catch(() => setServerAccountBalance(null));
  }, [account, backendAccounts, selectedBackendAccountId, session?.access_token]);
  const cash = account === 'Caisse';
  const anchorAt = cash ? data.referenceCashMetadata.capturedAt : data.referenceMetadata[account].capturedAt;
  const referenceCents = cash ? data.referenceCashCents : data.referenceBalances[account];
  const rows = useMemo(() => {
    const transactions: LedgerRow[] = data.transactions
      .filter((transaction) =>
        transaction.status === 'confirmed' || transaction.status === 'reversed',
      )
      .filter((transaction) =>
        cash ? transaction.cashDeltaCents !== 0 : transaction.operator === account && transaction.electronicDeltaCents !== 0,
      )
      .filter((transaction) => Date.parse(transaction.createdAt) >= Date.parse(anchorAt))
      .map((transaction) => ({
        id: transaction.id,
        at: transaction.createdAt,
        title: transactionTypeName(transaction),
        reference: transaction.reference,
        deltaCents: cash ? transaction.cashDeltaCents : transaction.electronicDeltaCents,
        status: statusName(transaction.status),
        source: transaction.source === 'demo' ? 'Exemple fictif' : 'Saisie locale',
        transactionId: transaction.id,
        note: transaction.note,
      }));
    const otherCash: LedgerRow[] = cash
      ? data.cashMovements
          .filter((movement) => movement.status === 'confirmed' && Date.parse(movement.createdAt) >= Date.parse(anchorAt))
          .filter((movement) => movement.deltaCents !== 0)
          .map((movement) => ({
            id: movement.id,
            at: movement.createdAt,
            title: movement.category === 'expense'
              ? 'Dépense de caisse'
              : movement.category === 'owner_in'
                ? 'Apport propriétaire'
                : movement.category === 'owner_out'
                  ? 'Retrait propriétaire'
                  : 'Autre mouvement',
            reference: '',
            deltaCents: movement.deltaCents,
            status: 'Comptabilisée localement',
            source: 'Saisie locale',
            note: movement.note,
          }))
      : [];
    return [...transactions, ...otherCash].sort((left, right) => left.at.localeCompare(right.at));
  }, [account, anchorAt, cash, data.cashMovements, data.transactions]);

  let running = referenceCents;
  const calculatedRows = rows.map((row) => {
    running += row.deltaCents;
    return { ...row, balanceAfterCents: running };
  });
  const theoretical = cash ? getCashBalance(data) : getWalletBalance(data, account as Operator);
  const pendingTransactions = data.transactions.filter(
    (transaction) => transaction.status === 'pending' && (cash ? transaction.cashDeltaCents !== 0 : transaction.operator === account),
  );
  const pendingCashMovements = cash ? data.cashMovements.filter((movement) => movement.status === 'pending') : [];
  const relevantSms = cash ? [] : data.smsEvents
    .filter((event) => event.operator === account && event.balanceCents !== undefined)
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  const beforeAnchorCount = cash
    ? data.cashMovements.filter((movement) => Date.parse(movement.createdAt) < Date.parse(anchorAt)).length
    : data.transactions.filter((transaction) => transaction.operator === account && Date.parse(transaction.createdAt) < Date.parse(anchorAt)).length;
  const referenceSource = cash ? data.referenceCashMetadata : data.referenceMetadata[account];

  return (
    <Screen title="Journal financier" subtitle="Reconstitution explicable depuis le dernier point de référence" back>
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="info" size={17} color={colors.secondaryForeground} />
          <Text style={{ flex: 1, color: colors.secondaryForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Chaque ligne comptabilisée montre sa variation et le solde après opération. Les montants annoncés par SMS restent des contrôles séparés, jamais des écritures automatiques.
          </Text>
        </Row>
      </Card>
      {session ? (
        <Card style={{ backgroundColor: colors.card, borderColor: colors.primary }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_700Bold' }}>Journal serveur connecté</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>
                {serverLedger.length} écriture{serverLedger.length === 1 ? '' : 's'} · toutes équilibrées : {serverLedger.every((entry) => entry.balanced) ? 'oui' : 'à vérifier'}
              </Text>
            </View>
            <Badge tone={serverError ? 'warning' : 'success'}>{serverError ? 'Hors ligne' : 'Synchronisé'}</Badge>
          </Row>
          {serverCash !== null ? <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Caisse backend : {formatMoney(serverCash, data.settings.currency)}</Text> : null}
          {serverAccountBalance?.last_observed_balance_cents !== undefined ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>
              {account} observé : {formatMoney(serverAccountBalance.last_observed_balance_cents, data.settings.currency)} · {serverAccountBalance.last_observed_age_seconds !== undefined ? `il y a ${Math.floor(serverAccountBalance.last_observed_age_seconds / 60)} min` : 'date inconnue'}
            </Text>
          ) : null}
          {serverError ? <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{serverError} Les données locales restent visibles.</Text> : null}
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {operators.map((operator) => (
          <ChoiceChip key={operator} label={operator} selected={account === operator} onPress={() => setAccount(operator)} />
        ))}
        <ChoiceChip label="Caisse physique" selected={cash} onPress={() => setAccount('Caisse')} />
      </View>
      {session && !cash ? (
        <Card style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Compte opérationnel sélectionné</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {backendAccounts.filter((item) => item.active && item.operator === account).map((item) => (
              <ChoiceChip key={item.id} label={item.label} selected={selectedBackendAccountId === item.id} onPress={() => setSelectedBackendAccountId(item.id)} />
            ))}
          </View>
          {backendAccounts.filter((item) => item.active && item.operator === account).length === 0 ? (
            <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16, marginTop: 8, fontFamily: 'Inter_400Regular' }}>Aucun compte actif n’est configuré pour cet opérateur.</Text>
          ) : null}
        </Card>
      ) : null}
      <Card style={{ backgroundColor: colors.hero, borderColor: colors.hero }}>
        <Text style={{ color: colors.heroMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>SOLDE THÉORIQUE LOCAL</Text>
        <Text style={{ color: colors.heroBalance, fontSize: 30, fontFamily: 'Inter_700Bold' }}>{formatMoney(theoretical, data.settings.currency)}</Text>
        <Text style={{ color: colors.heroMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          Référence {formatMoney(referenceCents, data.settings.currency)} · {formatDate(anchorAt)} · {referenceSource.source}
        </Text>
        <Badge tone={referenceSource.confidence === 'example' ? 'warning' : 'info'}>
          {referenceSource.confidence === 'example' ? 'Référence fictive' : 'Référence manuelle · couverture non vérifiée'}
        </Badge>
      </Card>

      <Card>
        <SectionTitle title="Calcul" />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Point de référence</Text>
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{formatMoney(referenceCents, data.settings.currency)}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Opérations incluses depuis ce point</Text>
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{calculatedRows.length}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Historique antérieur à la référence</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{beforeAnchorCount} entrées comprises dans la référence</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Mouvements incertains exclus</Text>
          <Badge tone={pendingTransactions.length + pendingCashMovements.length ? 'warning' : 'success'}>
            {pendingTransactions.length + pendingCashMovements.length}
          </Badge>
        </Row>
        {running !== theoretical ? (
          <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' }}>
            Le journal local et le solde affiché diffèrent de {formatMoney(running - theoretical, data.settings.currency)}. Vérifie la couverture et la fraîcheur des données.
          </Text>
        ) : null}
      </Card>

      <SectionTitle title={`Mouvements depuis le point de référence (${calculatedRows.length})`} />
      {calculatedRows.slice().reverse().map((row) => (
        <Card key={row.id} onPress={row.transactionId ? () => router.push(`/transactions/${row.transactionId}`) : undefined}>
          <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{row.title}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                {formatDate(row.at)} · {row.reference || row.id}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{row.source} · {row.status}</Text>
              {row.note ? <Text style={{ color: colors.inkSoft, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{row.note}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              <Text style={{ color: row.deltaCents < 0 ? colors.destructive : colors.success, fontSize: 13, fontFamily: 'Inter_700Bold' }}>
                {row.deltaCents > 0 ? '+' : '−'}{formatMoney(Math.abs(row.deltaCents), data.settings.currency)}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 10, fontFamily: 'Inter_500Medium' }}>Après : {formatMoney(row.balanceAfterCents, data.settings.currency)}</Text>
            </View>
          </Row>
        </Card>
      ))}
      {calculatedRows.length === 0 ? (
        <Card><Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>Aucun mouvement confirmé après ce point de référence.</Text></Card>
      ) : null}

      <SectionTitle title={`Messages de solde · non comptabilisés (${relevantSms.length})`} />
      {relevantSms.slice(0, 8).map((event) => (
        <Card key={event.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                {formatMoney(event.balanceCents ?? 0, data.settings.currency)} annoncé
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>
                {formatDate(event.receivedAt)} · {event.source === 'demo' ? 'Exemple fictif' : 'Texte importé manuellement'}
              </Text>
            </View>
            <Badge tone="warning">Point de contrôle</Badge>
          </Row>
          <Text style={{ color: colors.inkSoft, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{event.reconciliation}</Text>
        </Card>
      ))}
    </Screen>
  );
}
