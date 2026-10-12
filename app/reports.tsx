import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Badge, Button, Card, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { csvCell, formatDate, formatMoney, transactionTypeName } from '@/components/shopflow/format';
import { CashMovement, getCashBalance, getWalletBalance, operators, Transaction, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { CommissionSummary, shopflowApi } from '@/services/shopflowApi';

const localDayKey = (date: string) => {
  const parsed = new Date(date);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};
const todayKey = () => localDayKey(new Date().toISOString());
const isCounted = (transaction: Transaction) => transaction.status === 'confirmed' || transaction.status === 'reversed';

function openingBalanceForDay(baseCents: number, anchorAt: string, day: string, events: { createdAt: string; deltaCents: number }[]) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const dayStart = start.getTime();
  const dayEnd = end.getTime();
  const anchor = Date.parse(anchorAt);
  if (!Number.isFinite(dayStart) || !Number.isFinite(anchor) || dayEnd <= anchor) return null;

  if (dayStart >= anchor) {
    const beforePeriod = events
      .filter((event) => {
        const at = Date.parse(event.createdAt);
        return at >= anchor && at < dayStart;
      })
      .reduce((total, event) => total + event.deltaCents, 0);
    return baseCents + beforePeriod;
  }

  const knownBeforeAnchor = events
    .filter((event) => {
      const at = Date.parse(event.createdAt);
      return at >= dayStart && at < anchor;
    })
    .reduce((total, event) => total + event.deltaCents, 0);
  return baseCents - knownBeforeAnchor;
}

export default function ReportsScreen() {
  const { data } = useShopFlow();
  const { session } = useAuth();
  const colors = useColors();
  const [day, setDay] = useState(todayKey());
  const [serverCommissions, setServerCommissions] = useState<CommissionSummary | null>(null);
  const [serverCommissionError, setServerCommissionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!session) {
      setServerCommissions(null);
      setServerCommissionError(null);
      return () => { active = false; };
    }
    setServerCommissionError(null);
    shopflowApi.getCommissions(session.access_token)
      .then((summary) => {
        if (active) setServerCommissions(summary);
      })
      .catch((error: unknown) => {
        if (active) setServerCommissionError(error instanceof Error ? error.message : 'Impossible de charger le suivi serveur.');
      });
    return () => { active = false; };
  }, [session?.access_token]);

  const serverExpectedCents = serverCommissions?.calculations.reduce((sum, item) => sum + item.expected_cents, 0) ?? 0;
  const serverReceivedCents = serverCommissions?.receipts.reduce((sum, item) => sum + item.amount_cents, 0) ?? 0;
  const serverGapCents = serverExpectedCents - serverReceivedCents;
  const today = todayKey();
  const parsedDay = new Date(`${day}T00:00:00`);
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(parsedDay.getTime()) &&
    localDayKey(parsedDay.toISOString()) === day &&
    day <= today;
  const transactionsForDay = useMemo(
    () => validDay ? data.transactions.filter((transaction) => localDayKey(transaction.createdAt) === day) : [],
    [data.transactions, day, validDay],
  );
  const cashMovementsForDay = useMemo(
    () => validDay ? data.cashMovements.filter((movement) => localDayKey(movement.createdAt) === day) : [],
    [data.cashMovements, day, validDay],
  );
  const closedSessionsForDay = useMemo(
    () => validDay ? data.cashSessions.filter((session) => session.status === 'closed' && session.closedAt && localDayKey(session.closedAt) === day) : [],
    [data.cashSessions, day, validDay],
  );
  const smsForDay = useMemo(
    () => validDay ? data.smsEvents.filter((event) => localDayKey(event.receivedAt) === day) : [],
    [data.smsEvents, day, validDay],
  );
  const anomaliesForDay = useMemo(
    () => validDay ? data.anomalies.filter((anomaly) => localDayKey(anomaly.createdAt) === day) : [],
    [data.anomalies, day, validDay],
  );
  const confirmed = transactionsForDay.filter((transaction) => transaction.status === 'confirmed');
  const pending = transactionsForDay.filter((transaction) => transaction.status === 'pending');
  const openAnomalies = data.anomalies.filter((anomaly) => anomaly.status !== 'resolved');
  const commissionsEstimated = transactionsForDay.reduce((sum, transaction) => sum + transaction.commissionCents, 0);
  const commissionsConfirmed = confirmed.reduce((sum, transaction) => sum + transaction.commissionCents, 0);
  const agentNames = Array.from(new Set([
    ...data.agents.map((agent) => agent.name),
    ...transactionsForDay.map((transaction) => transaction.agent),
    ...cashMovementsForDay.map((movement) => movement.agent),
  ]));

  function openingForOperator(operator: (typeof operators)[number]) {
    const events = data.transactions
      .filter((transaction) => transaction.operator === operator && isCounted(transaction))
      .map((transaction) => ({ createdAt: transaction.createdAt, deltaCents: transaction.electronicDeltaCents }));
    return openingBalanceForDay(data.referenceBalances[operator], data.referenceMetadata[operator].capturedAt, day, events);
  }

  function openingForCash() {
    const events = [
      ...data.transactions
        .filter(isCounted)
        .map((transaction) => ({ createdAt: transaction.createdAt, deltaCents: transaction.cashDeltaCents })),
      ...data.cashMovements
        .filter((movement) => movement.status === 'confirmed')
        .map((movement) => ({ createdAt: movement.createdAt, deltaCents: movement.deltaCents })),
    ];
    return openingBalanceForDay(data.referenceCashCents, data.referenceCashMetadata.capturedAt, day, events);
  }

  async function exportCsv() {
    if (!validDay) {
      Alert.alert('Date invalide', 'Utilise le format AAAA-MM-JJ.');
      return;
    }
    const header = ['Categorie', 'Date', 'Type', 'Operateur ou caisse', 'Reference', 'Montant', 'Devise', 'Frais', 'Commission saisie', 'Variation electronique', 'Variation caisse', 'Statut', 'Rapprochement', 'Agent', 'Detail'];
    const transactionRows = transactionsForDay.map((transaction) => [
      'Transaction',
      transaction.createdAt,
      transactionTypeName(transaction),
      transaction.operator,
      transaction.reference,
      (transaction.amountCents / 100).toFixed(2),
      data.settings.currency,
      (transaction.feeCents / 100).toFixed(2),
      (transaction.commissionCents / 100).toFixed(2),
      (transaction.electronicDeltaCents / 100).toFixed(2),
      (transaction.cashDeltaCents / 100).toFixed(2),
      transaction.status,
      transaction.matchStatus,
      transaction.agent,
      transaction.note,
    ]);
    const cashRows = cashMovementsForDay.map((movement: CashMovement) => [
      'Mouvement de caisse',
      movement.createdAt,
      movement.category,
      'Caisse',
      '',
      (movement.amountCents / 100).toFixed(2),
      data.settings.currency,
      '',
      '',
      '',
      (movement.deltaCents / 100).toFixed(2),
      movement.status,
      '',
      movement.agent,
      movement.note,
    ]);
    const sessionRows = closedSessionsForDay.map((session) => [
      'Cloture de caisse',
      session.closedAt ?? session.openedAt,
      'Comptage',
      'Caisse',
      session.id,
      ((session.closingCountCents ?? 0) / 100).toFixed(2),
      data.settings.currency,
      '',
      '',
      '',
      ((session.varianceCents ?? 0) / 100).toFixed(2),
      session.status,
      '',
      session.agent,
      session.explanation ?? '',
    ]);
    const anomalyRows = anomaliesForDay.map((anomaly) => [
      'Anomalie',
      anomaly.createdAt,
      anomaly.type,
      anomaly.operator ?? '',
      anomaly.reference ?? anomaly.id,
      (anomaly.amountCents / 100).toFixed(2),
      data.settings.currency,
      '',
      '',
      '',
      '',
      anomaly.status,
      '',
      anomaly.agent,
      anomaly.title,
    ]);
    const smsRows = smsForDay.map((event) => [
      'Message local',
      event.receivedAt,
      event.type,
      event.operator ?? '',
      event.reference ?? '',
      event.amountCents === undefined ? '' : (event.amountCents / 100).toFixed(2),
      data.settings.currency,
      '',
      '',
      event.balanceCents === undefined ? '' : (event.balanceCents / 100).toFixed(2),
      '',
      event.confidence,
      '',
      '',
      'Texte brut non exporté pour limiter les données personnelles.',
    ]);
    const accountSummaryRows = operators.map((operator) => {
      const start = openingForOperator(operator);
      const movements = transactionsForDay.filter((item) => item.operator === operator && isCounted(item));
      const delta = movements.reduce((sum, item) => sum + item.electronicDeltaCents, 0);
      return [
        'Synthese journaliere',
        day,
        start === null ? 'Ouverture indisponible' : 'Theorique local',
        operator,
        '',
        start === null ? '' : (start / 100).toFixed(2),
        data.settings.currency,
        '',
        '',
        (delta / 100).toFixed(2),
        '',
        '',
        '',
        '',
        start === null ? '' : `Solde theorique de fin de journee : ${((start + delta) / 100).toFixed(2)}`,
      ];
    });
    const cashDelta = [
      ...transactionsForDay.filter(isCounted).map((item) => item.cashDeltaCents),
      ...cashMovementsForDay.filter((item) => item.status === 'confirmed').map((item) => item.deltaCents),
    ].reduce((sum, delta) => sum + delta, 0);
    const cashStart = openingForCash();
    const cashSummaryRow = [
      'Synthese journaliere',
      day,
      'Theorique local',
      'Caisse',
      '',
      cashStart === null ? '' : (cashStart / 100).toFixed(2),
      data.settings.currency,
      '',
      '',
      '',
      (cashDelta / 100).toFixed(2),
      '',
      '',
      '',
      cashStart === null ? '' : `Solde theorique de fin de journee : ${((cashStart + cashDelta) / 100).toFixed(2)}`,
    ];
    const csv = '\uFEFF' + [header, ...accountSummaryRows, cashSummaryRow, ...transactionRows, ...cashRows, ...sessionRows, ...anomalyRows, ...smsRows]
      .map((row) => row.map(csvCell).join(';')).join('\n');
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `shopflow-rapport-${day}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      } else {
        const directory = FileSystem.cacheDirectory;
        if (!directory) throw new Error('Répertoire de partage local indisponible.');
        const uri = `${directory}shopflow-rapport-${day}.csv`;
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: `Rapport ShopFlow ${day}` });
      }
    } catch {
      Alert.alert('Export indisponible', 'Le CSV n’a pas pu être partagé depuis cet appareil. Vérifie les options de partage et réessaie.');
    }
  }

  return (
    <Screen title="Rapports" subtitle="Synthèse à partir des données locales" back>
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="info" size={17} color={colors.secondaryForeground} />
          <Text style={{ flex: 1, color: colors.secondaryForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Ce rapport est local et incomplet par conception : il ne contient que les événements présents sur cet appareil.
          </Text>
        </Row>
      </Card>
      <Card>
        <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Rapport journalier</Text>
        <Field label="Jour local (AAAA-MM-JJ)" placeholder={today} value={day} onChangeText={setDay} />
        {!validDay ? (
          <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Saisis une date valide, passée ou égale à aujourd’hui, au format AAAA-MM-JJ.</Text>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Opérations de la journée</Text>
              <Badge tone="info">{transactionsForDay.length}</Badge>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>En attente / non comptabilisées</Text>
              <Badge tone={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Mouvements de caisse · clôtures · dossiers créés</Text>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                {cashMovementsForDay.length} · {closedSessionsForDay.length} · {anomaliesForDay.length}
              </Text>
            </Row>
          </>
        )}
      </Card>
      {validDay ? (
        <>
          <SectionTitle title="Par opérateur et compte" />
          {operators.map((operator) => {
            const dayTransactions = transactionsForDay.filter((item) => item.operator === operator);
            const counted = dayTransactions.filter(isCounted);
            const incoming = counted.reduce((sum, item) => sum + Math.max(0, item.electronicDeltaCents), 0);
            const outgoing = counted.reduce((sum, item) => sum + Math.max(0, -item.electronicDeltaCents), 0);
            const opening = openingForOperator(operator);
            const delta = incoming - outgoing;
            const sms = smsForDay
              .filter((event) => event.operator === operator && event.balanceCents !== undefined)
              .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))[0];
            const reference = data.referenceMetadata[operator];
            const ageHours = Math.floor(Math.max(0, Date.now() - Date.parse(reference.capturedAt)) / 3_600_000);
            const grossVolume = counted.reduce((sum, item) => sum + item.amountCents, 0);
            return (
              <Card key={operator}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{operator}</Text>
                  <Badge tone={reference.confidence === 'example' || ageHours >= 24 ? 'warning' : 'info'}>
                    {reference.confidence === 'example' ? 'Exemple fictif' : ageHours >= 24 ? 'Référence ancienne' : 'Référence manuelle'}
                  </Badge>
                </Row>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>
                  Point de départ : {formatMoney(data.referenceBalances[operator], data.settings.currency)} · {formatDate(reference.capturedAt)} · {reference.source} · {ageHours} h
                </Text>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Volume brut des opérations comptées</Text>
                  <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{formatMoney(grossVolume, data.settings.currency)}</Text>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Entrées / sorties connues</Text>
                  <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                    +{formatMoney(incoming, data.settings.currency)} / −{formatMoney(outgoing, data.settings.currency)}
                  </Text>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Ouverture → fin théorique estimée</Text>
                  <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                    {opening === null ? 'Historique insuffisant' : `${formatMoney(opening, data.settings.currency)} → ${formatMoney(opening + delta, data.settings.currency)}`}
                  </Text>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Frais / commission saisie</Text>
                  <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                    {formatMoney(dayTransactions.reduce((sum, item) => sum + item.feeCents, 0), data.settings.currency)} / {formatMoney(dayTransactions.reduce((sum, item) => sum + item.commissionCents, 0), data.settings.currency)}
                  </Text>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Référence sans correspondance sûre</Text>
                  <Badge tone={dayTransactions.some((item) => item.matchStatus !== 'matched') ? 'warning' : 'success'}>
                    {dayTransactions.filter((item) => item.matchStatus !== 'matched').length}
                  </Badge>
                </Row>
                {sms ? (
                  <Text style={{ color: colors.inkSoft, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>
                    Dernier solde annoncé saisi : {formatMoney(sms.balanceCents ?? 0, data.settings.currency)} · {formatDate(sms.receivedAt)} · non utilisé pour remplacer le calcul.
                  </Text>
                ) : null}
              </Card>
            );
          })}
          <Card>
            <SectionTitle title="Caisse physique · reconstitution locale" />
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>
              Référence : {formatMoney(data.referenceCashCents, data.settings.currency)} · {data.referenceCashMetadata.source} · {formatDate(data.referenceCashMetadata.capturedAt)}
            </Text>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
              Ouverture reconstituée : {openingForCash() === null ? 'indisponible depuis les données conservées' : formatMoney(openingForCash() ?? 0, data.settings.currency)}
            </Text>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
              Mouvements connus nets : {formatMoney(
                [
                  ...transactionsForDay.filter(isCounted).map((item) => item.cashDeltaCents),
                  ...cashMovementsForDay.filter((item) => item.status === 'confirmed').map((item) => item.deltaCents),
                ].reduce((sum, delta) => sum + delta, 0),
                data.settings.currency,
              )}
            </Text>
            <Text style={{ color: colors.inkSoft, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>
              Les ouvertures/clôtures sont des observations. Aucun montant compté n’écrase la caisse théorique.
            </Text>
          </Card>
          <SectionTitle title={`Comptages de clôture (${closedSessionsForDay.length})`} />
          {closedSessionsForDay.map((session) => (
            <Card key={session.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{session.agent} · {formatDate(session.closedAt ?? session.openedAt)}</Text>
                <Badge tone={(session.varianceCents ?? 0) === 0 ? 'success' : 'warning'}>
                  Écart {formatMoney(session.varianceCents ?? 0, data.settings.currency)}
                </Badge>
              </Row>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                Comptage saisi : {formatMoney(session.closingCountCents ?? 0, data.settings.currency)} · référence conservée, aucune correction appliquée
              </Text>
              {session.explanation ? <Text style={{ color: colors.inkSoft, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{session.explanation}</Text> : null}
            </Card>
          ))}
          {closedSessionsForDay.length === 0 ? (
            <Card><Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>Aucun comptage de clôture enregistré ce jour.</Text></Card>
          ) : null}
          <SectionTitle title={`Par agent · ${day}`} />
          {agentNames.map((name) => {
            const agentTransactions = transactionsForDay.filter((item) => item.agent === name);
            const agentAnomalies = anomaliesForDay.filter((item) => item.agent === name);
            const agentClosings = closedSessionsForDay.filter((item) => item.agent === name);
            const failed = agentTransactions.filter((item) => item.status === 'failed' || item.status === 'cancelled').length;
            const reversed = agentTransactions.filter((item) => item.status === 'reversed').length;
            const volume = agentTransactions.filter(isCounted).reduce((sum, item) => sum + item.amountCents, 0);
            const commission = agentTransactions.filter(isCounted).reduce((sum, item) => sum + item.commissionCents, 0);
            return (
              <Card key={name}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{name}</Text>
                  <Badge tone="info">{agentTransactions.length} op.</Badge>
                </Row>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                  Volume saisi {formatMoney(volume, data.settings.currency)} · commissions locales {formatMoney(commission, data.settings.currency)}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                  Échecs/annulations {failed} · inversions {reversed} · dossiers créés {agentAnomalies.length} · clôtures {agentClosings.length}
                </Text>
                {agentClosings.some((session) => (session.varianceCents ?? 0) !== 0) ? (
                  <Text style={{ color: colors.warning, fontSize: 11, fontFamily: 'Inter_500Medium' }}>
                    Écarts de clôture documentés : {formatMoney(agentClosings.reduce((sum, session) => sum + (session.varianceCents ?? 0), 0), data.settings.currency)}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : null}
      <Card>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_500Medium' }}>SOLDES THÉORIQUES ACTUELS · TOUTES DATES</Text>
        {operators.map((operator) => (
          <Row key={operator} style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>{operator}</Text>
            <Text style={{ color: getWalletBalance(data, operator) >= 0 ? colors.success : colors.destructive, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{formatMoney(getWalletBalance(data, operator), data.settings.currency)}</Text>
          </Row>
        ))}
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Caisse théorique</Text>
          <Text style={{ color: getCashBalance(data) >= 0 ? colors.success : colors.destructive, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{formatMoney(getCashBalance(data), data.settings.currency)}</Text>
        </Row>
        <Button title="Reconstituer le détail des soldes" icon="list" variant="secondary" onPress={() => router.push('/ledger')} />
      </Card>
      <Row>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Confirmées localement</Text>
          <Text style={{ color: colors.foreground, fontSize: 22, fontFamily: 'Inter_700Bold' }}>{confirmed.length}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>sur {transactionsForDay.length} entrées le {day}</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>À confirmer</Text>
          <Text style={{ color: colors.warning, fontSize: 22, fontFamily: 'Inter_700Bold' }}>{pending.length}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>non incluses aux soldes</Text>
        </Card>
      </Row>
      <SectionTitle title="Commissions" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Estimées / saisies</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Ne signifie pas encaissées</Text>
          </View>
          <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{formatMoney(commissionsEstimated, data.settings.currency)}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Sur opérations confirmées localement</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Confirmation saisie, non vérifiée par l’opérateur</Text>
          </View>
          <Text style={{ color: colors.primary, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{formatMoney(commissionsConfirmed, data.settings.currency)}</Text>
        </Row>
      </Card>
      {session ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Suivi serveur · toutes dates</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Calculs attendus et encaissements enregistrés dans la boutique</Text>
            </View>
            <Badge tone={serverCommissionError ? 'warning' : serverGapCents === 0 ? 'success' : 'warning'}>
              {serverCommissionError ? 'Indisponible' : serverGapCents === 0 ? 'Équilibré' : 'Écart'}
            </Badge>
          </Row>
          {serverCommissionError ? (
            <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{serverCommissionError}</Text>
          ) : (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Commissions attendues</Text>
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{formatMoney(serverExpectedCents, data.settings.currency)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Reçues et rapprochées</Text>
                <Text style={{ color: colors.primary, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{formatMoney(serverReceivedCents, data.settings.currency)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Écart à documenter</Text>
                <Text style={{ color: serverGapCents === 0 ? colors.success : colors.warning, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{formatMoney(serverGapCents, data.settings.currency)}</Text>
              </Row>
            </>
          )}
        </Card>
      ) : null}
      <SectionTitle title="Qualité des données" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>Opérations en attente</Text><Badge tone={pending.length ? 'warning' : 'success'}>{pending.length}</Badge></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>Dossiers ouverts</Text><Badge tone={openAnomalies.length ? 'danger' : 'success'}>{openAnomalies.length}</Badge></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>Messages saisis ce jour</Text><Badge tone="info">{smsForDay.length}</Badge></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>Messages non reconnus ce jour</Text><Badge tone={smsForDay.some((event) => event.confidence === 'low') ? 'warning' : 'success'}>{smsForDay.filter((event) => event.confidence === 'low').length}</Badge></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>Références de transaction manquantes ce jour</Text><Badge tone={transactionsForDay.some((transaction) => !transaction.reference.trim()) ? 'warning' : 'success'}>{transactionsForDay.filter((transaction) => !transaction.reference.trim()).length}</Badge></Row>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>
          Références locales uniquement : sans lecture SMS système ni synchronisation, l’application ne peut pas connaître les événements qui n’ont pas été importés.
        </Text>
      </Card>
      <SectionTitle title="Opérations récentes" />
      {transactionsForDay.slice(0, 6).map((transaction) => (
        <Card key={transaction.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{transactionTypeName(transaction)} · {transaction.operator}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{transaction.reference || 'Sans référence'} · {formatDate(transaction.createdAt)}</Text>
            </View>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{formatMoney(transaction.amountCents, data.settings.currency)}</Text>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{transaction.agent} · {transaction.status}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{transaction.matchStatus}</Text>
          </Row>
        </Card>
      ))}
      {transactionsForDay.length === 0 ? (
        <Card><Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>Aucune transaction enregistrée pour cette date.</Text></Card>
      ) : null}
      <Button title="Exporter le rapport journalier en CSV" icon="share-2" onPress={exportCsv} />
      <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>
        Le fichier inclut les références, statuts, montants et noms d’agents du jour choisi. Vérifie son contenu avant tout partage externe.
      </Text>
    </Screen>
  );
}
