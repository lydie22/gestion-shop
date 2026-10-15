import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, Divider, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { formatDate, formatMoney, matchStatusName, statusName, transactionStatusTone, transactionTypeName } from '@/components/shopflow/format';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, cancelTransaction, reverseTransaction } = useShopFlow();
  const colors = useColors();
  const [decisionNote, setDecisionNote] = useState('');
  const transaction = data.transactions.find((item) => item.id === id);
  const linkedReversal = data.transactions.find((item) => item.relatedTransactionId === id);
  const linkedOriginal = transaction?.relatedTransactionId
    ? data.transactions.find((item) => item.id === transaction.relatedTransactionId)
    : undefined;
  const linkedMessages = transaction?.reference
    ? data.smsEvents.filter((event) => event.reference === transaction.reference && event.operator === transaction.operator)
    : [];

  if (!transaction) {
    return (
      <Screen title="Opération introuvable" back>
        <Card><Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Cette entrée n’existe pas dans le journal de cet appareil.</Text></Card>
      </Screen>
    );
  }

  const sourceLabel = transaction.source === 'server' ? 'Serveur' : 'Saisie manuelle locale';
  const electronicAnchor = Date.parse(data.referenceMetadata[transaction.operator].capturedAt);
  const cashAnchor = Date.parse(data.referenceCashMetadata.capturedAt);
  const transactionAt = Date.parse(transaction.createdAt);
  const canReconstructElectronicAtTransaction = transactionAt >= electronicAnchor;
  const canReconstructCashAtTransaction = transactionAt >= cashAnchor;
  const electronicBefore = data.referenceBalances[transaction.operator] + data.transactions
    .filter((item) =>
      item.id !== transaction.id &&
      item.operator === transaction.operator &&
      Date.parse(item.createdAt) >= electronicAnchor &&
      Date.parse(item.createdAt) < transactionAt &&
      (item.status === 'confirmed' || item.status === 'reversed'),
    )
    .reduce((total, item) => total + item.electronicDeltaCents, 0);
  const cashBefore = data.referenceCashCents +
    data.transactions
      .filter((item) =>
        item.id !== transaction.id &&
        Date.parse(item.createdAt) >= cashAnchor &&
        Date.parse(item.createdAt) < transactionAt &&
        (item.status === 'confirmed' || item.status === 'reversed'),
      )
      .reduce((total, item) => total + item.cashDeltaCents, 0) +
    data.cashMovements
      .filter((item) => Date.parse(item.createdAt) >= cashAnchor && Date.parse(item.createdAt) < transactionAt && item.status === 'confirmed')
      .reduce((total, item) => total + item.deltaCents, 0);
  const impactsAreCounted = transaction.status === 'confirmed' || transaction.status === 'reversed';

  return (
    <Screen title="Détail de l’opération" subtitle={transaction.reference || 'Sans référence'} back>
      <Card style={{ backgroundColor: colors.hero, borderColor: colors.hero }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.heroMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{transactionTypeName(transaction).toLocaleUpperCase()}</Text>
          <Badge tone={transactionStatusTone(transaction.status)}>{statusName(transaction.status)}</Badge>
        </Row>
        <Text style={{ color: colors.primaryForeground, fontSize: 34, fontFamily: 'Inter_700Bold' }}>{formatMoney(transaction.amountCents, data.settings.currency)}</Text>
        <Text style={{ color: colors.heroMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{transaction.operator} · {formatDate(transaction.createdAt)}</Text>
      </Card>

      <Card>
        <SectionTitle title="Données déclarées" />
        <DetailRow label="Référence" value={transaction.reference || 'Absente'} />
        <DetailRow label="Agent associé" value={transaction.agent} />
        <DetailRow label="Source" value={sourceLabel} />
        <DetailRow label="État de rapprochement" value={matchStatusName(transaction.matchStatus)} />
        <DetailRow label="Frais saisis" value={formatMoney(transaction.feeCents, data.settings.currency)} />
        <DetailRow label="Commission prévue" value={formatMoney(transaction.commissionCents, data.settings.currency)} />
        {transaction.note ? <DetailRow label="Note" value={transaction.note} /> : null}
      </Card>

      {transaction.status === 'pending' ? (
        <Card>
          <SectionTitle title="Annuler cette saisie en attente" />
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
            L’entrée reste dans l’historique avec le statut annulé et n’est pas comptabilisée.
          </Text>
          <Field label="Motif d’annulation" value={decisionNote} onChangeText={setDecisionNote} placeholder="Explique pourquoi la saisie est annulée" />
          <Button title="Annuler la saisie" icon="x" variant="danger" onPress={() => {
            if (decisionNote.trim().length < 4) {
              Alert.alert('Motif requis', 'Ajoute une explication avant d’annuler.');
              return;
            }
            cancelTransaction(transaction.id, decisionNote);
            setDecisionNote('');
            Alert.alert('Saisie annulée', 'L’entrée et le motif restent visibles dans le journal local.');
          }} />
        </Card>
      ) : transaction.status === 'confirmed' && !linkedReversal ? (
        <Card>
          <SectionTitle title="Déclarer une inversion" />
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
            Une inversion ajoute une écriture compensatoire liée à l’opération d’origine. L’historique n’est pas effacé ; le motif est obligatoire.
          </Text>
          <Field label="Motif / référence justificative" value={decisionNote} onChangeText={setDecisionNote} placeholder="Ex. inversion opérateur vérifiée, réf. ..." />
          <Button title="Ajouter l’écriture compensatoire" icon="rotate-ccw" variant="secondary" onPress={() => {
            if (decisionNote.trim().length < 4) {
              Alert.alert('Motif requis', 'Ajoute une justification avant de créer l’inversion.');
              return;
            }
            reverseTransaction(transaction.id, decisionNote);
            setDecisionNote('');
            Alert.alert('Inversion locale créée', 'Une alerte de contrôle a été ouverte. Vérifie la transaction et l’écriture liée avec une preuve indépendante.');
          }} />
        </Card>
      ) : null}

      {linkedReversal ? (
        <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
          <Row>
            <Feather name="rotate-ccw" size={17} color={colors.secondaryForeground} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.secondaryForeground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Écriture compensatoire liée</Text>
              <Text style={{ color: colors.secondaryForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>
                {linkedReversal.reference} · {linkedReversal.note}
              </Text>
            </View>
          </Row>
        </Card>
      ) : linkedOriginal ? (
        <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
          <Text style={{ color: colors.secondaryForeground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Liée à l’opération d’origine</Text>
          <Text style={{ color: colors.secondaryForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{linkedOriginal.reference || linkedOriginal.id}</Text>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Impacts financiers enregistrés" />
        <DetailRow label="Portefeuille électronique" value={`${transaction.electronicDeltaCents > 0 ? '+' : transaction.electronicDeltaCents < 0 ? '−' : ''}${formatMoney(Math.abs(transaction.electronicDeltaCents), data.settings.currency)}`} />
        <DetailRow label="Caisse physique" value={`${transaction.cashDeltaCents > 0 ? '+' : transaction.cashDeltaCents < 0 ? '−' : ''}${formatMoney(Math.abs(transaction.cashDeltaCents), data.settings.currency)}`} />
        <Divider />
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          Seules les opérations marquées « confirmées localement » entrent dans les totaux. Les montants déclarés restent modifiables uniquement via une nouvelle trace, jamais par effacement silencieux.
        </Text>
      </Card>
      <Card>
        <SectionTitle title="Position dans le journal" />
        {!canReconstructElectronicAtTransaction && !canReconstructCashAtTransaction ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
            Les points de référence courants sont postérieurs à cette opération. Son historique n’est pas recalculé à partir d’une référence plus récente.
          </Text>
        ) : (
          <>
            {canReconstructElectronicAtTransaction ? (
              <DetailRow label="Portefeuille avant → après" value={`${formatMoney(electronicBefore, data.settings.currency)} → ${formatMoney(electronicBefore + (impactsAreCounted ? transaction.electronicDeltaCents : 0), data.settings.currency)}`} />
            ) : (
              <DetailRow label="Portefeuille" value="Historique non reconstituable depuis la référence actuelle" />
            )}
            {canReconstructCashAtTransaction ? (
              <DetailRow label="Caisse avant → après" value={`${formatMoney(cashBefore, data.settings.currency)} → ${formatMoney(cashBefore + (impactsAreCounted ? transaction.cashDeltaCents : 0), data.settings.currency)}`} />
            ) : (
              <DetailRow label="Caisse physique" value="Historique non reconstituable depuis la référence actuelle" />
            )}
            {!impactsAreCounted ? (
              <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' }}>
                Cette opération n’est pas incluse dans les soldes tant qu’elle n’est pas confirmée localement.
              </Text>
            ) : null}
          </>
        )}
      </Card>
      <Card>
        <SectionTitle title={`Messages locaux liés par référence (${linkedMessages.length})`} />
        {linkedMessages.length ? linkedMessages.map((message) => (
          <View key={message.id} style={{ gap: 5, paddingVertical: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{formatDate(message.receivedAt)}</Text>
              <Badge tone={message.confidence === 'high' ? 'info' : 'warning'}>{message.source === 'server' ? 'Événement serveur' : 'Texte importé'}</Badge>
            </Row>
            <Text style={{ color: colors.inkSoft, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{message.rawText}</Text>
            {message.balanceCents !== undefined ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>
                Solde annoncé : {formatMoney(message.balanceCents, data.settings.currency)} · non comptabilisé
              </Text>
            ) : null}
          </View>
        )) : (
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
            Aucun message de cet appareil ne partage exactement cette référence et cet opérateur.
          </Text>
        )}
      </Card>

      <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="shield" size={17} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Cet écran décrit uniquement les informations stockées localement. Il ne vérifie pas l’exécution réelle auprès de l’opérateur.
          </Text>
        </Row>
      </Card>
      {transaction.matchStatus !== 'matched' ? (
        <Button title="Voir les contrôles associés" variant="secondary" icon="alert-circle" onPress={() => router.push('/(tabs)/controls')} />
      ) : null}
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingVertical: 8 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{label}</Text>
      <Text style={{ flexShrink: 1, color: colors.foreground, fontSize: 12, textAlign: 'right', fontFamily: 'Inter_600SemiBold' }}>{value}</Text>
    </View>
  );
}
