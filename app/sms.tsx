import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChip, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { formatDate, formatMoney } from '@/components/shopflow/format';
import { Operator, operators, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { shopflowApi } from '@/services/shopflowApi';
import { getLocalDeviceKey } from '@/services/deviceIdentity';
import { configureNativeSms, drainNativeSms, isNativeSmsAvailable } from '../modules/shopflow-sms/src';

const sampleText = 'Transaction réussie. Montant : 50 USD Référence : AT-84921 Nouveau solde : 350 USD';

export default function SmsScreen() {
  const { data, addSmsText } = useShopFlow();
  const { session } = useAuth();
  const colors = useColors();
  const [text, setText] = useState('');
  const [operator, setOperator] = useState<Operator>(operators[0]);
  const [serverReconciliations, setServerReconciliations] = useState<Array<{ status: string; reason: string }>>([]);

  useEffect(() => {
    if (!session) {
      setServerReconciliations([]);
      return;
    }
    shopflowApi.getReconciliations(session.access_token)
      .then(setServerReconciliations)
      .catch(() => setServerReconciliations([]));
  }, [session?.access_token]);

  const serverStatusCounts = useMemo(() => serverReconciliations.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {}), [serverReconciliations]);

  function importText() {
    if (!text.trim()) {
      Alert.alert('Texte requis', 'Colle ou saisis un texte de message.');
      return;
    }
    addSmsText(text, operator);
    setText('');
  }

  async function syncEvents() {
    if (!session || data.smsEvents.length === 0) return;
    try {
      const deviceKey = await getLocalDeviceKey();
      const result = await shopflowApi.syncSmsBatch(
        data.smsEvents.map((event) => ({
          operator: event.operator ?? 'Opérateur inconnu',
          raw_text: event.rawText,
          device_id: deviceKey,
          received_at: event.receivedAt,
          idempotency_key: `local-sms-${event.id}`,
        })),
        session.access_token,
      );
      Alert.alert('Synchronisation terminée', `${result.length} événement(s) envoyé(s). Les SMS restent des événements sources et ne créent pas automatiquement de mouvement confirmé.`);
    } catch (cause) {
      Alert.alert('Synchronisation impossible', cause instanceof Error ? cause.message : 'Vérifie la connexion au backend.');
    }
  }

  async function enableNativeCapture() {
    if (Platform.OS !== 'android' || !isNativeSmsAvailable) {
      Alert.alert('Mode manuel', 'La capture Android nécessite une build native privée. Cet appareil utilise l’import contrôlé.');
      return;
    }
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS, {
      title: 'Autoriser les SMS ShopFlow',
      message: 'ShopFlow utilise uniquement les notifications Airtel configurées pour le rapprochement de la boutique.',
      buttonPositive: 'Autoriser',
      buttonNegative: 'Refuser',
    });
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert('Permission refusée', 'La capture automatique reste désactivée. Tu peux importer un texte manuellement.');
      return;
    }
    configureNativeSms(['airtel', 'airtel money']);
    const received = drainNativeSms();
    for (const message of received) addSmsText(message.body, 'Airtel Money');
    Alert.alert('Capture activée', `${received.length} message(s) en attente importé(s). Les SMS restent des événements à rapprocher, pas des confirmations automatiques.`);
  }

  return (
    <Screen title="Messages" subtitle="Saisie manuelle uniquement · aucun accès à la boîte SMS" back>
      <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="alert-triangle" size={17} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            {Platform.OS === 'android' && isNativeSmsAvailable ? 'La capture Android est optionnelle et limitée aux expéditeurs Airtel configurés après accord de la permission. Le parseur ne prouve pas à lui seul l’authenticité d’un message.' : 'ShopFlow ne lit pas les SMS sur cet appareil. Seuls les textes que tu colles ici sont analysés localement. Le parseur d’exemple ne prouve pas l’authenticité d’un message.'}
          </Text>
        </Row>
      </Card>
      <Card>
        <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Analyser un texte fourni</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          Extraction déterministe de la référence, du montant et du solde pour un format d’exemple. Aucun mouvement n’est créé automatiquement.
        </Text>
        <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Opérateur déclaré</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {operators.map((item) => <ChoiceChip key={item} label={item} selected={operator === item} onPress={() => setOperator(item)} />)}
        </View>
        <Field label="Texte du message" placeholder="Colle ici un message anonymisé…" value={text} onChangeText={setText} multiline autoCapitalize="sentences" />
        <Button title="Utiliser l’exemple fictif" variant="secondary" icon="copy" onPress={() => setText(sampleText)} />
        <Button title="Analyser sur cet appareil" icon="search" onPress={importText} />
        {Platform.OS === 'android' ? <Button title="Activer la capture SMS Airtel" variant="secondary" icon="smartphone" onPress={() => void enableNativeCapture()} /> : null}
        {session ? <Button title="Synchroniser vers le backend" variant="outline" icon="upload-cloud" onPress={() => void syncEvents()} disabled={data.smsEvents.length === 0} /> : null}
      </Card>

      {session ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>Rapprochements serveur</Text>
            <Badge tone={serverStatusCounts.unmatched || serverStatusCounts.amount_mismatch || serverStatusCounts.status_conflict ? 'warning' : 'success'}>{serverReconciliations.length}</Badge>
          </Row>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>
            Concordants : {serverStatusCounts.matched ?? 0} · à vérifier : {(serverStatusCounts.unmatched ?? 0) + (serverStatusCounts.amount_mismatch ?? 0) + (serverStatusCounts.status_conflict ?? 0) + (serverStatusCounts.ambiguous ?? 0)} · comparaison de solde : {serverStatusCounts.comparison_only ?? 0}
          </Text>
        </Card>
      ) : null}

      <SectionTitle title={`Événements (${data.smsEvents.length})`} />
      {data.smsEvents.map((event) => (
        <Card key={event.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{event.type}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{event.operator ?? 'Opérateur inconnu'} · {formatDate(event.receivedAt)}</Text>
            </View>
            <Badge tone={event.confidence === 'high' ? 'success' : 'warning'}>{event.confidence === 'high' ? 'Champs extraits' : 'Inconnu'}</Badge>
          </Row>
          {event.reference ? <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Référence : {event.reference}</Text> : null}
          {event.amountCents !== undefined ? <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Montant détecté : {formatMoney(event.amountCents, data.settings.currency)}</Text> : null}
          {event.balanceCents !== undefined ? <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Solde annoncé : {formatMoney(event.balanceCents, data.settings.currency)}</Text> : null}
          <Text style={{ color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>{event.reconciliation}</Text>
          <View style={{ padding: 10, borderRadius: 12, backgroundColor: colors.muted }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>{event.rawText}</Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>
            {event.source === 'demo' ? 'Exemple fictif' : 'Texte saisi manuellement'}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
