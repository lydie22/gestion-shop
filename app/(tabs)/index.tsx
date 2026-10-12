import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Body, Button, Card, Row, Screen, SectionTitle, Spacer } from '@/components/shopflow/ui';
import { formatDate, formatMoney, transactionStatusTone, transactionTypeName } from '@/components/shopflow/format';
import { getCashBalance, getWalletBalance, operators, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

export default function DashboardScreen() {
  const { data, isReady, storageIssue } = useShopFlow();
  const colors = useColors();
  const totalOpen = data.anomalies.filter((anomaly) => anomaly.status !== 'resolved').length;
  const pending = data.transactions.filter((transaction) => transaction.status === 'pending').length;
  const confirmedToday = data.transactions.filter(
    (transaction) =>
      transaction.status === 'confirmed' &&
      new Date(transaction.createdAt).toDateString() === new Date().toDateString(),
  ).length;
  const latestCashCount = data.cashSessions.find((session) => session.status === 'closed');
  const latestReferenceAt = [
    ...operators.map((operator) => data.referenceMetadata[operator].capturedAt),
    data.referenceCashMetadata.capturedAt,
  ].sort().at(-1);
  const balanceDiscrepancy = data.anomalies.find((anomaly) => anomaly.id === 'demo-an-01');
  const discrepancyOperator = balanceDiscrepancy?.operator;
  const discrepancyCalculated = discrepancyOperator ? getWalletBalance(data, discrepancyOperator) : 0;
  const discrepancyReported = Math.max(0, discrepancyCalculated - (balanceDiscrepancy?.amountCents ?? 0));

  return (
    <Screen
      title="Bonjour, Aline"
      subtitle={data.settings.shopName}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paramètres"
          onPress={() => router.push('/settings')}
          style={{ padding: 8 }}
        >
          <Feather name="settings" size={20} color={colors.foreground} />
        </Pressable>
      }
    >
      <Card style={{ backgroundColor: colors.destructive, borderColor: colors.destructive, padding: 20, minHeight: 186 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.heroMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>SOLDE ÉLECTRONIQUE THÉORIQUE</Text>
        </Row>
        <Text style={{ color: colors.primaryForeground, fontSize: 35, lineHeight: 42, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}>
          {formatMoney(operators.reduce((sum, operator) => sum + getWalletBalance(data, operator), 0), data.settings.currency)}
        </Text>
        <Text style={{ color: colors.heroMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
          Calculé à partir des opérations locales confirmées · jamais un solde opérateur en temps réel
        </Text>
        <Row style={{ justifyContent: 'space-between', marginTop: 3 }}>
          <Text style={{ color: colors.primaryForeground, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Référence la plus récente</Text>
          <Text style={{ color: colors.heroMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>{latestReferenceAt ? formatDate(latestReferenceAt) : '—'}</Text>
        </Row>
      </Card>

      <Row>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Caisse théorique</Text>
          <Text style={{ color: getCashBalance(data) >= 0 ? colors.success : colors.destructive, fontSize: 19, fontFamily: 'Inter_700Bold' }}>
            {formatMoney(getCashBalance(data), data.settings.currency)}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
            Dernier comptage {latestCashCount ? formatMoney(latestCashCount.closingCountCents ?? 0, data.settings.currency) : '—'}
          </Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>À surveiller</Text>
          <Text style={{ color: totalOpen ? colors.warning : colors.foreground, fontSize: 19, fontFamily: 'Inter_700Bold' }}>
            {totalOpen} dossier{totalOpen === 1 ? '' : 's'}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
            {pending} opération{pending === 1 ? '' : 's'} en attente
          </Text>
        </Card>
      </Row>

      {!isReady ? (
        <Card><Body muted>Chargement des données stockées sur cet appareil…</Body></Card>
      ) : null}
      {storageIssue ? (
        <Card style={{ backgroundColor: colors.dangerSurface, borderColor: colors.dangerSurface }}>
          <Row>
            <Feather name="alert-circle" size={18} color={colors.destructive} />
            <Text style={{ flex: 1, color: colors.destructive, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold' }}>
              L’enregistrement local a échoué. Ne ferme pas l’application avant d’avoir vérifié tes données.
            </Text>
          </Row>
        </Card>
      ) : null}

      {balanceDiscrepancy && balanceDiscrepancy.status !== 'resolved' ? (
      <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="alert-triangle" size={18} color={colors.warning} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.warning, fontSize: 14, fontFamily: 'Inter_700Bold' }}>
              {balanceDiscrepancy.title} · {formatMoney(balanceDiscrepancy.amountCents, data.settings.currency)}
            </Text>
            <Text style={{ color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
              Solde annoncé {formatMoney(discrepancyReported, data.settings.currency)} · calcul local {formatMoney(discrepancyCalculated, data.settings.currency)}. Les deux valeurs restent distinctes.
            </Text>
          </View>
          <Pressable onPress={() => router.push(`/controls/${balanceDiscrepancy.id}`)} accessibilityRole="button">
            <Feather name="chevron-right" size={19} color={colors.warning} />
          </Pressable>
        </Row>
      </Card>
      ) : null}

      <SectionTitle title="Comptes opérationnels" action="Détails" onAction={() => router.push('/reports')} />
      {operators.map((operator) => (
        <Card key={operator} onPress={() => router.push('/reports')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{operator}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                Référence locale · {formatMoney(data.referenceBalances[operator], data.settings.currency)}
              </Text>
            </View>
            <Text style={{ color: getWalletBalance(data, operator) >= 0 ? colors.success : colors.destructive, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
              {formatMoney(getWalletBalance(data, operator), data.settings.currency)}
            </Text>
            <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
          </Row>
        </Card>
      ))}

      <Row style={{ gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title="Nouvelle opération" icon="plus" onPress={() => router.push('/transactions/new')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Clôturer la caisse" variant="secondary" icon="check-square" onPress={() => router.push('/(tabs)/cash')} />
        </View>
      </Row>

      <SectionTitle title="Activité récente" action="Tout voir" onAction={() => router.push('/(tabs)/activity')} />
      {data.transactions.slice(0, 3).map((transaction) => (
        <Card key={transaction.id} onPress={() => router.push(`/transactions/${transaction.id}`)}>
          <Row>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{transactionTypeName(transaction)}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                {transaction.operator} · {transaction.reference || 'Sans référence'} · {formatDate(transaction.createdAt)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>
                {formatMoney(transaction.amountCents, data.settings.currency)}
              </Text>
              <Badge tone={transactionStatusTone(transaction.status)}>
                {transaction.status === 'confirmed' ? 'Confirmée localement' : 'À confirmer'}
              </Badge>
            </View>
          </Row>
        </Card>
      ))}

      <Card>
        <Row>
          <Feather name="smartphone" size={18} color={colors.primary} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Données locales uniquement</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
              Pas de serveur, de synchronisation ni de lecture automatique des SMS. Les exemples sont fictifs.
            </Text>
          </View>
        </Row>
      </Card>
      <Spacer size={8} />
      <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>
        {confirmedToday} opération{confirmedToday === 1 ? '' : 's'} confirmée{confirmedToday === 1 ? '' : 's'} localement aujourd’hui
      </Text>
    </Screen>
  );
}
