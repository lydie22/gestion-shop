import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, Field, Row, Screen, SectionTitle, SkeletonBlock } from '@/components/shopflow/ui';
import { formatDate, formatMoney } from '@/components/shopflow/format';
import { BackendAccount, shopflowApi } from '@/services/shopflowApi';
import { useAuth } from '@/context/AuthContext';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

type AccountBalance = {
  theoretical_balance_cents: number;
  currency: string;
  last_observed_balance_cents?: number;
  last_observed_at?: string;
  last_observed_verification_status?: string;
};

export default function AccountsScreen() {
  const colors = useColors();
  const { data } = useShopFlow();
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<BackendAccount[]>([]);
  const [balances, setBalances] = useState<Record<string, AccountBalance>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [opening, setOpening] = useState('0');
  const canManage = session ? ['owner', 'supervisor'].includes(session.role) : false;

  const loadAccounts = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await shopflowApi.listAccounts(session.access_token);
      const balanceResults = await Promise.allSettled(rows.map((account) => shopflowApi.getBalance(account.id, session.access_token)));
      const nextBalances: Record<string, AccountBalance> = {};
      balanceResults.forEach((result, index) => {
        if (result.status === 'fulfilled') nextBalances[rows[index].id] = result.value;
      });
      setAccounts(rows);
      setBalances(nextBalances);
    } catch (cause) {
      setAccounts([]);
      setBalances({});
      setError(cause instanceof Error ? cause.message : 'Les comptes serveur sont indisponibles.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  async function createAccount() {
    if (!session || !canManage) return;
    const openingCents = Math.round(Number(opening.replace(',', '.')) * 100);
    if (label.trim().length < 2 || !Number.isFinite(openingCents) || openingCents < 0) {
      Alert.alert('Compte invalide', 'Saisis un libellé et un solde d’ouverture valide.');
      return;
    }
    try {
      await shopflowApi.createAccount({ operator: 'Airtel Money', label: label.trim(), currency: data.settings.currency, opening_balance_cents: openingCents }, session.access_token);
      setLabel('');
      setOpening('0');
      setAdding(false);
      await loadAccounts();
    } catch (cause) {
      Alert.alert('Création impossible', cause instanceof Error ? cause.message : 'Le compte n’a pas pu être créé.');
    }
  }

  if (!session) {
    return (
      <Screen title="Comptes" subtitle="Comptes Airtel de la boutique" back>
        <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Feather name="lock" size={17} color={colors.warning} />
            <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
              Connecte-toi pour consulter les comptes réels de la boutique. Aucune donnée de démonstration n’est affichée hors connexion.
            </Text>
          </Row>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Comptes" subtitle={`${accounts.length} compte${accounts.length === 1 ? '' : 's'} accessible${accounts.length === 1 ? '' : 's'} · ${session.role === 'agent' ? 'vue agent' : 'vue responsable'}`} back>
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="database" size={17} color={colors.secondaryForeground} />
          <Text style={{ flex: 1, color: colors.secondaryForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            {session.role === 'agent' ? 'Seuls les comptes qui te sont attribués par un responsable sont visibles.' : 'Les soldes sont calculés par le serveur. Un solde observé reste distinct du solde théorique.'}
          </Text>
        </Row>
      </Card>
      {error ? <Card style={{ backgroundColor: colors.dangerSurface, borderColor: colors.dangerSurface }}><Text style={{ color: colors.destructive, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' }}>{error}</Text></Card> : null}
      <SectionTitle title="Comptes Airtel Money" action={canManage ? (adding ? 'Fermer' : 'Ajouter') : undefined} onAction={canManage ? () => setAdding((value) => !value) : undefined} />
      {adding ? (
        <Card>
          <Field label="Libellé interne" placeholder="Ex. Caisse Airtel principale" value={label} onChangeText={setLabel} />
          <Field label={`Solde d’ouverture (${data.settings.currency})`} placeholder="0,00" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" />
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>Le solde d’ouverture est enregistré comme point de départ documenté ; il ne déclenche aucune opération opérateur.</Text>
          <Button title="Créer le compte serveur" icon="plus" onPress={() => void createAccount()} />
        </Card>
      ) : null}
      {loading ? <Card><SkeletonBlock width="46%" /><SkeletonBlock width="82%" height={12} style={{ marginTop: 10 }} /><SkeletonBlock width="35%" height={24} style={{ marginTop: 16 }} /></Card> : null}
      {!loading && accounts.length === 0 && !error ? <Card><Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>Aucun compte n’est encore attribué à cette boutique.</Text></Card> : null}
      {accounts.map((account) => {
        const balance = balances[account.id];
        const hasDifference = balance?.last_observed_balance_cents !== undefined && balance.last_observed_balance_cents !== balance.theoretical_balance_cents;
        return (
          <Card key={account.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{account.label}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{account.operator} · {account.currency} · {account.active ? 'Actif' : 'Inactif'}</Text>
              </View>
              <Badge tone={hasDifference ? 'warning' : 'success'}>{hasDifference ? 'Écart à vérifier' : 'Synchronisé'}</Badge>
            </Row>
            <Row style={{ justifyContent: 'space-between', marginTop: 12 }}>
              <View style={{ gap: 3 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Solde théorique</Text>
                <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: 'Inter_700Bold' }}>{balance ? formatMoney(balance.theoretical_balance_cents, balance.currency) : '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Dernier observé</Text>
                <Text style={{ color: hasDifference ? colors.warning : colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{balance?.last_observed_balance_cents !== undefined ? formatMoney(balance.last_observed_balance_cents, balance.currency) : 'Non renseigné'}</Text>
                {balance?.last_observed_at ? <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{formatDate(balance.last_observed_at)}</Text> : null}
              </View>
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
