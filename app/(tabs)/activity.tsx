import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChip, Field, IconButton, Row, Screen, SectionTitle, Spacer } from '@/components/shopflow/ui';
import { formatDate, formatMoney, statusName, transactionStatusTone, transactionTypeName } from '@/components/shopflow/format';
import { Transaction, TransactionStatus, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { BackendTransaction, shopflowApi } from '@/services/shopflowApi';

const filters = [
  { label: 'Tout', value: 'all' },
  { label: 'Confirmées', value: 'confirmed' },
  { label: 'En attente', value: 'pending' },
  { label: 'Échec', value: 'failed' },
] as const;

export default function ActivityScreen() {
  const { data } = useShopFlow();
  const { session } = useAuth();
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]['value']>('all');
  const [remoteTransactions, setRemoteTransactions] = useState<Transaction[] | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteHasMore, setRemoteHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [remoteAccountNames, setRemoteAccountNames] = useState<Map<string, Transaction['operator']>>(new Map());
  const [remoteAgentNames, setRemoteAgentNames] = useState<Map<string, string>>(new Map());

  function mapServerTransaction(row: BackendTransaction, accountNames: Map<string, Transaction['operator']>, agentNames: Map<string, string>): Transaction {
    return {
      id: row.id,
      reference: row.reference,
      operator: accountNames.get(row.account_id) ?? ('Compte inconnu' as Transaction['operator']),
      type: (row.operation_type as Transaction['type']) || 'adjustment',
      amountCents: row.amount_cents,
      feeCents: row.fee_cents,
      commissionCents: row.commission_expected_cents,
      electronicDeltaCents: 0,
      cashDeltaCents: 0,
      status: (row.status as Transaction['status']) || 'pending',
      matchStatus: (row.reconciliation_status as Transaction['matchStatus']) || 'unmatched',
      agent: row.agent_id ? (agentNames.get(row.agent_id) ?? 'Agent non identifié') : 'Non attribué',
      note: row.note ?? 'Transaction synchronisée depuis le backend.',
      source: 'server',
      createdAt: row.created_at,
    };
  }

  useEffect(() => {
    if (!session) {
      setRemoteTransactions(null);
      setRemoteError(null);
      setRemoteHasMore(false);
      return;
    }
    let active = true;
    Promise.all([
      shopflowApi.listTransactions(session.access_token, { limit: 100, offset: 0 }),
      shopflowApi.listAccounts(session.access_token),
      shopflowApi.listAgents(session.access_token),
    ]).then(([rows, accounts, agents]) => {
      if (!active) return;
      const accountNames = new Map(accounts.map((account) => [account.id, account.operator as Transaction['operator']]));
      const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
      setRemoteAccountNames(accountNames);
      setRemoteAgentNames(agentNames);
      setRemoteTransactions(rows.map((row: BackendTransaction) => mapServerTransaction(row, accountNames, agentNames)));
      setRemoteHasMore(rows.length === 100);
      setRemoteError(null);
    }).catch((error: unknown) => {
      if (!active) return;
      setRemoteTransactions(null);
      setRemoteHasMore(false);
      setRemoteError(error instanceof Error ? error.message : 'Transactions serveur indisponibles.');
    });
    return () => { active = false; };
  }, [session?.access_token]);

  async function loadMore() {
    if (!session || !remoteHasMore || loadingMore || !remoteTransactions) return;
    setLoadingMore(true);
    try {
      const rows = await shopflowApi.listTransactions(session.access_token, { limit: 100, offset: remoteTransactions.length });
      setRemoteTransactions((current) => current ? [...current, ...rows.map((row) => mapServerTransaction(row, remoteAccountNames, remoteAgentNames))] : current);
      setRemoteHasMore(rows.length === 100);
    } catch (error: unknown) {
      setRemoteError(error instanceof Error ? error.message : 'La page suivante est indisponible.');
    } finally {
      setLoadingMore(false);
    }
  }

  const transactions = remoteTransactions ?? data.transactions;
  const visibleTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const matchesFilter = filter === 'all' || transaction.status === (filter as TransactionStatus);
        const searchable = `${transaction.reference} ${transaction.operator} ${transaction.agent} ${transactionTypeName(transaction)}`.toLocaleLowerCase();
        return matchesFilter && searchable.includes(query.trim().toLocaleLowerCase());
      }),
    [transactions, filter, query],
  );

  return (
    <Screen
      title="Opérations"
      subtitle={`${transactions.length} entrée${transactions.length === 1 ? '' : 's'} dans le journal ${session ? 'serveur' : 'local'}`}
      right={<IconButton icon="plus" label="Nouvelle opération" onPress={() => router.push('/transactions/new')} />}
    >
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row>
          <Feather name="database" size={17} color={colors.secondaryForeground} />
          <Text style={{ color: colors.secondaryForeground, flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            {session ? 'Les opérations confirmées par le backend sont partagées dans la boutique. Une saisie manuelle reste distincte d’une confirmation de l’opérateur.' : 'Le journal reste sur cet appareil. Une saisie manuelle n’est pas une confirmation de l’opérateur.'}
          </Text>
        </Row>
      </Card>
      {remoteError ? <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}><Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' }}>{remoteError} Affichage local temporaire.</Text></Card> : null}
      <Field
        label="Rechercher"
        placeholder="Référence, opérateur, agent…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {filters.map((item) => (
          <ChoiceChip key={item.value} label={item.label} selected={filter === item.value} onPress={() => setFilter(item.value)} />
        ))}
      </View>
      <SectionTitle title={`${visibleTransactions.length} résultat${visibleTransactions.length === 1 ? '' : 's'}`} />
      {visibleTransactions.length === 0 ? (
        <Card><Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 20, fontFamily: 'Inter_400Regular' }}>Aucune opération ne correspond à ces filtres.</Text></Card>
      ) : (
        visibleTransactions.map((transaction) => (
          <Pressable key={transaction.id} accessibilityRole="button" onPress={() => router.push(`/transactions/${transaction.id}`)}>
            <Card>
              <Row>
                <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }}>
                  <Feather
                    name={transaction.type === 'deposit' || transaction.type === 'transfer_in' ? 'arrow-down-left' : 'arrow-up-right'}
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{transactionTypeName(transaction)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                    {transaction.operator} · {transaction.reference || 'Sans référence'}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                    {formatDate(transaction.createdAt)} · {transaction.agent}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 7 }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>
                    {formatMoney(transaction.amountCents, data.settings.currency)}
                  </Text>
                  <Badge tone={transactionStatusTone(transaction.status)}>{statusName(transaction.status)}</Badge>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Row>
            </Card>
          </Pressable>
        ))
      )}
      {session && remoteHasMore ? <Button title={loadingMore ? 'Chargement…' : 'Charger plus'} variant="secondary" onPress={() => void loadMore()} loading={loadingMore} /> : null}
      <Spacer size={8} />
    </Screen>
  );
}
