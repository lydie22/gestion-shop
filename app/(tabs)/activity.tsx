import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Card, ChoiceChip, Field, IconButton, Row, Screen, SectionTitle, Spacer } from '@/components/shopflow/ui';
import { formatDate, formatMoney, statusName, transactionStatusTone, transactionTypeName } from '@/components/shopflow/format';
import { TransactionStatus, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

const filters = [
  { label: 'Tout', value: 'all' },
  { label: 'Confirmées', value: 'confirmed' },
  { label: 'En attente', value: 'pending' },
  { label: 'Échec', value: 'failed' },
] as const;

export default function ActivityScreen() {
  const { data } = useShopFlow();
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]['value']>('all');
  const visibleTransactions = useMemo(
    () =>
      data.transactions.filter((transaction) => {
        const matchesFilter = filter === 'all' || transaction.status === (filter as TransactionStatus);
        const searchable = `${transaction.reference} ${transaction.operator} ${transaction.agent} ${transactionTypeName(transaction)}`.toLocaleLowerCase();
        return matchesFilter && searchable.includes(query.trim().toLocaleLowerCase());
      }),
    [data.transactions, filter, query],
  );

  return (
    <Screen
      title="Opérations"
      subtitle={`${data.transactions.length} entrée${data.transactions.length === 1 ? '' : 's'} dans le journal local`}
      right={<IconButton icon="plus" label="Nouvelle opération" onPress={() => router.push('/transactions/new')} />}
    >
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row>
          <Feather name="database" size={17} color={colors.secondaryForeground} />
          <Text style={{ color: colors.secondaryForeground, flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Le journal reste sur cet appareil. Une saisie manuelle n’est pas une confirmation de l’opérateur.
          </Text>
        </Row>
      </Card>
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
      <Spacer size={8} />
    </Screen>
  );
}
