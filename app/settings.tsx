import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, ChoiceChip, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { Operator, operators, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { shopflowApi, SubscriptionSummary } from '@/services/shopflowApi';
import { getLocalDeviceKey } from '@/services/deviceIdentity';

export default function SettingsScreen() {
  const { data, updateSettings, updateReferenceBalances, resetDemo } = useShopFlow();
  const colors = useColors();
  const { session, accessibleShops, switchShop } = useAuth();
  const [shopName, setShopName] = useState(data.settings.shopName);
  const [currency, setCurrency] = useState(data.settings.currency);
  const [threshold, setThreshold] = useState((data.settings.discrepancyThresholdCents / 100).toFixed(2));
  const [deviceName, setDeviceName] = useState(data.settings.deviceName);
  const [referenceBalances, setReferenceBalances] = useState<Record<Operator, string>>({
    'Airtel Money': (data.referenceBalances['Airtel Money'] / 100).toFixed(2),
    'Orange Money': (data.referenceBalances['Orange Money'] / 100).toFixed(2),
    'M-Pesa': (data.referenceBalances['M-Pesa'] / 100).toFixed(2),
  });
  const [referenceCash, setReferenceCash] = useState((data.referenceCashCents / 100).toFixed(2));
  const [referenceSource, setReferenceSource] = useState('Comptage / relevé de référence saisi manuellement');
  const [deviceKey, setDeviceKey] = useState('');
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionSummary['plan']>('pilot');
  const [switchingShop, setSwitchingShop] = useState(false);

  useEffect(() => {
    getLocalDeviceKey().then(setDeviceKey).catch(() => setDeviceStatus('Identifiant local indisponible'));
  }, []);

  useEffect(() => {
    if (!session) {
      setSubscription(null);
      return;
    }
    shopflowApi.getSubscription(session.access_token)
      .then((value) => { setSubscription(value); setSubscriptionPlan(value.plan); })
      .catch(() => setSubscription(null));
  }, [session?.access_token]);

  async function saveSubscription() {
    if (!session || session.role !== 'owner' || !subscription) return;
    try {
      setSubscription(await shopflowApi.updateSubscription({ plan: subscriptionPlan, status: subscription.status }, session.access_token));
      Alert.alert('Abonnement mis à jour', 'Le plan SaaS de cette boutique a été enregistré côté serveur.');
    } catch (cause) {
      Alert.alert('Mise à jour impossible', cause instanceof Error ? cause.message : 'Le serveur a refusé la modification.');
    }
  }

  async function registerDevice() {
    if (!session || !deviceKey || !['owner', 'supervisor'].includes(session.role)) return;
    try {
      const result = await shopflowApi.registerDevice({ device_key: deviceKey, label: deviceName.trim() || 'Appareil ShopFlow' }, session.access_token);
      setDeviceStatus(result.status === 'active' ? 'Appareil autorisé pour cette boutique.' : result.status);
    } catch (cause) {
      setDeviceStatus(cause instanceof Error ? cause.message : 'Association impossible.');
    }
  }

  async function changeShop(shopId: string) {
    if (!session || shopId === session.shop_id || switchingShop) return;
    setSwitchingShop(true);
    try {
      await switchShop(shopId);
      const selected = accessibleShops.find((shop) => shop.id === shopId);
      Alert.alert('Boutique changée', `${selected?.name ?? 'La boutique'} est maintenant active.`);
    } catch (cause) {
      Alert.alert('Changement impossible', cause instanceof Error ? cause.message : 'La boutique n’a pas pu être sélectionnée.');
    } finally {
      setSwitchingShop(false);
    }
  }

  function savePreferences() {
    const cents = Math.round(Number(threshold.replace(',', '.')) * 100);
    if (shopName.trim().length < 2 || !Number.isFinite(cents) || cents < 0 || !/^[A-Z]{3}$/.test(currency.trim())) {
      Alert.alert('Vérifie les champs', 'Nom de boutique requis, seuil positif ou nul et devise au format ISO de trois lettres.');
      return;
    }
    updateSettings({
      shopName: shopName.trim(),
      currency: currency.trim().toUpperCase(),
      discrepancyThresholdCents: cents,
      deviceName: deviceName.trim() || 'Appareil local',
    });
    Alert.alert('Paramètres enregistrés', 'Les préférences sont conservées sur cet appareil.');
  }

  function saveReferences() {
    const parsedReferences = {} as Record<Operator, number>;
    for (const operator of operators) {
      const parsed = Number(referenceBalances[operator].replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        Alert.alert('Point de référence invalide', `Vérifie le solde de ${operator}.`);
        return;
      }
      parsedReferences[operator] = Math.round(parsed * 100);
    }
    const parsedCash = Number(referenceCash.replace(',', '.'));
    if (!Number.isFinite(parsedCash) || parsedCash < 0 || referenceSource.trim().length < 4) {
      Alert.alert('Point de référence invalide', 'Vérifie la caisse initiale et précise sa source.');
      return;
    }
    updateReferenceBalances(parsedReferences, Math.round(parsedCash * 100), referenceSource);
    Alert.alert('Références mises à jour', 'Les soldes de départ sont datés et leur nouvelle source est inscrite dans le journal local.');
  }

  function confirmReset() {
    Alert.alert(
      'Réinitialiser les données locales ?',
      'Cette action remplacera les opérations, agents, alertes et préférences enregistrés sur cet appareil par les exemples de démonstration. Elle est irréversible depuis l’application.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réinitialiser', style: 'destructive', onPress: () => resetDemo() },
      ],
    );
  }

  return (
      <Screen title="Paramètres" subtitle={session ? `Boutique connectée · rôle ${session.role}` : 'Préférences locales de la boutique'} back>
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="smartphone" size={17} color={colors.secondaryForeground} />
          <Text style={{ flex: 1, color: colors.secondaryForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            {session ? 'Les préférences de calcul restent locales à cet appareil ; les opérations, rôles et écritures validées sont contrôlés par le backend.' : 'Les paramètres ne sont pas partagés avec d’autres appareils. Connecte-toi pour activer les contrôles serveur.'}
          </Text>
        </Row>
      </Card>
      {session && subscription ? (
        <>
          <SectionTitle title="Abonnement SaaS" />
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>Plan {subscription.plan}</Text>
              <Text style={{ color: subscription.status === 'active' || subscription.status === 'trialing' ? colors.success : colors.warning, fontSize: 12, fontFamily: 'Inter_700Bold' }}>{subscription.status}</Text>
            </Row>
            {subscription.trial_ends_at ? <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Essai jusqu’au {new Date(subscription.trial_ends_at).toLocaleDateString('fr-FR')}</Text> : null}
            {session.role === 'owner' ? (
              <>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Plan de la boutique</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(['pilot', 'standard', 'pro'] as const).map((item) => <ChoiceChip key={item} label={item} selected={subscriptionPlan === item} onPress={() => setSubscriptionPlan(item)} />)}
                </View>
                <Button title="Enregistrer le plan SaaS" icon="save" variant="secondary" onPress={() => void saveSubscription()} />
              </>
            ) : null}
          </Card>
        </>
      ) : null}
      {session && accessibleShops.length > 1 ? (
        <>
          <SectionTitle title="Boutique active" />
          <Card>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
              Le changement remplace le contexte serveur, le rôle et les permissions de la session.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {accessibleShops.map((shop) => <ChoiceChip key={shop.id} label={`${shop.name} · ${shop.role}`} selected={shop.id === session.shop_id} onPress={() => void changeShop(shop.id)} />)}
            </View>
            {switchingShop ? <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Changement en cours…</Text> : null}
          </Card>
        </>
      ) : null}
      <SectionTitle title="Boutique & calculs" />
      <Card>
        <Field label="Nom de la boutique" value={shopName} onChangeText={setShopName} />
        <Field label="Devise (code à 3 lettres)" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} />
        <Field label={`Seuil d’écart (${currency || data.settings.currency})`} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" />
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>
          Le seuil classe les écarts dans cette interface. Il ne masque jamais une différence et ne déclenche pas d’ajustement.
        </Text>
        <Field label="Nom de cet appareil" value={deviceName} onChangeText={setDeviceName} />
        <Button title="Enregistrer les préférences" icon="save" onPress={savePreferences} />
        {session && ['owner', 'supervisor'].includes(session.role) ? (
          <>
            <Button title="Associer cet appareil à la boutique" icon="link" variant="outline" onPress={() => void registerDevice()} />
            <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' }}>
              Identifiant technique : {deviceKey || 'génération en cours'}
            </Text>
            {deviceStatus ? <Text style={{ color: deviceStatus.includes('autorisé') ? colors.success : colors.warning, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' }}>{deviceStatus}</Text> : null}
          </>
        ) : null}
      </Card>
      <SectionTitle title="Points de référence des soldes" />
      <Card>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          Un point de départ est une donnée sourcée, datée et distincte du total théorique recalculé. Le remplacer ajoute une trace locale et recalcule les vues.
        </Text>
        {operators.map((operator) => (
          <Field
            key={operator}
            label={`${operator} · devise ${currency || data.settings.currency}`}
            value={referenceBalances[operator]}
            onChangeText={(value) => setReferenceBalances((current) => ({ ...current, [operator]: value }))}
            keyboardType="decimal-pad"
          />
        ))}
        <Field label={`Référence de la caisse · devise ${currency || data.settings.currency}`} value={referenceCash} onChangeText={setReferenceCash} keyboardType="decimal-pad" />
        <Field label="Source des points de référence" value={referenceSource} onChangeText={setReferenceSource} placeholder="Ex. relevé opérateur du 12/10/2026" />
        {operators.map((operator) => (
          <Text key={`${operator}-meta`} style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>
            {operator} : {data.referenceMetadata[operator].source} · {new Date(data.referenceMetadata[operator].capturedAt).toLocaleString('fr-FR')}
          </Text>
        ))}
        <Button title="Enregistrer les nouveaux points de départ" icon="save" variant="secondary" onPress={saveReferences} />
      </Card>
      <SectionTitle title="Limites actuelles" />
      <Card>
        <Limit text="Lecture automatique des SMS désactivée ; import de texte uniquement." />
        <Limit text={session ? 'Les opérations synchronisées sont protégées par le rôle et la boutique côté serveur.' : 'Aucune synchronisation réseau ou sauvegarde distante.'} />
        <Limit text={session ? 'Les profils locaux restent indicatifs ; les permissions financières réelles sont serveur.' : 'Les profils d’agents ne protègent pas l’accès aux données de l’appareil.'} />
        <Limit text="Les preuves et statuts sont saisis localement et ne sont pas validés par un opérateur." />
      </Card>
      <SectionTitle title="Données de démonstration" />
      <Card style={{ backgroundColor: colors.dangerSurface, borderColor: colors.dangerSurface }}>
        <Text style={{ color: colors.destructive, fontSize: 14, fontFamily: 'Inter_700Bold' }}>Réinitialisation destructive</Text>
        <Text style={{ color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          Remplace les données locales existantes par les exemples initiaux. Exporte d’abord les informations que tu veux conserver.
        </Text>
        <Button title="Réinitialiser les données de l’appareil" icon="rotate-ccw" variant="danger" onPress={confirmReset} />
      </Card>
    </Screen>
  );
}

function Limit({ text }: { text: string }) {
  const colors = useColors();
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <Feather name="minus-circle" size={15} color={colors.mutedForeground} />
      <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>{text}</Text>
    </Row>
  );
}
