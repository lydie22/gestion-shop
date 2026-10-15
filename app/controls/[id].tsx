import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { anomalySeverityName, anomalyTone, formatDate, formatMoney } from '@/components/shopflow/format';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { shopflowApi } from '@/services/shopflowApi';

export default function AnomalyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, setAnomalyStatus, refreshServerData } = useShopFlow();
  const { session } = useAuth();
  const colors = useColors();
  const [note, setNote] = useState('');
  const anomaly = data.anomalies.find((item) => item.id === id);
  const anomalyId = anomaly?.id;
  const linkedTransactions = anomaly?.reference
    ? data.transactions.filter((transaction) =>
        transaction.reference === anomaly.reference &&
        (!anomaly.operator || transaction.operator === anomaly.operator),
      )
    : [];
  const linkedMessages = anomaly?.reference
    ? data.smsEvents.filter((event) =>
        event.reference === anomaly.reference &&
        (!anomaly.operator || event.operator === anomaly.operator),
      )
    : [];

  if (!anomaly) {
    return <Screen title="Dossier introuvable" back><Card><Text style={{ color: colors.mutedForeground }}>Cette anomalie n’est pas enregistrée localement.</Text></Card></Screen>;
  }

  function resolve() {
    if (note.trim().length < 4) {
      Alert.alert('Justification requise', 'Ajoute une explication courte à l’historique avant de résoudre le dossier.');
      return;
    }
    const resolution = note.trim();
    if (session && anomaly?.source === 'server') {
      void shopflowApi.resolveAnomaly(anomalyId!, resolution, session.access_token)
        .then(() => {
          refreshServerData();
          setNote('');
          Alert.alert('Dossier mis à jour', 'La résolution est enregistrée sur le serveur et dans le journal d’audit.');
        })
        .catch((error: unknown) => Alert.alert('Résolution refusée', error instanceof Error ? error.message : 'Le serveur a refusé cette résolution.'));
      return;
    }
    setAnomalyStatus(anomalyId!, 'resolved', resolution);
    setNote('');
    Alert.alert('Dossier mis à jour', 'La résolution locale reste visible sur cet appareil et sera synchronisée selon le flux prévu.');
  }

  return (
    <Screen title="Dossier de contrôle" subtitle={anomaly.type} back>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge tone={anomalyTone(anomaly.severity)}>{anomalySeverityName(anomaly.severity)}</Badge>
          <Badge tone={anomaly.status === 'resolved' ? 'success' : anomaly.status === 'in_review' ? 'info' : 'warning'}>
            {anomaly.status === 'resolved' ? 'Résolu' : anomaly.status === 'in_review' ? 'En cours' : 'À traiter'}
          </Badge>
        </Row>
        <Text style={{ color: colors.foreground, fontSize: 18, lineHeight: 25, fontFamily: 'Inter_700Bold' }}>{anomaly.title}</Text>
        {anomaly.amountCents > 0 ? <Text style={{ color: colors.foreground, fontSize: 25, fontFamily: 'Inter_700Bold' }}>{formatMoney(anomaly.amountCents, data.settings.currency)}</Text> : null}
        <Text style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' }}>{anomaly.description}</Text>
      </Card>

      <Card>
        <SectionTitle title="Éléments du dossier" />
        <Detail label="Créé" value={formatDate(anomaly.createdAt)} />
        <Detail label="Opérateur / type" value={anomaly.operator ?? anomaly.type} />
        <Detail label="Référence" value={anomaly.reference ?? 'Non disponible'} />
        <Detail label="Agent attribué" value={anomaly.agent} />
      </Card>

      {anomaly.status !== 'resolved' ? (
        <Card>
          <SectionTitle title="Décision humaine" />
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
            Résoudre le dossier ne change pas les mouvements comptabilisés. Décris le fait vérifié ou pourquoi le cas est clos.
          </Text>
          <Field label="Explication / élément de preuve" placeholder="Ex. message reçu en retard, référence vérifiée…" value={note} onChangeText={setNote} multiline />
          <Row>
            <View style={{ flex: 1 }}>
              <Button title="Marquer en cours" variant="secondary" onPress={() => {
                if (note.trim().length < 4) {
                  Alert.alert('Note requise', 'Ajoute une note pour expliquer l’examen.');
                  return;
                }
                const reviewNote = note.trim();
                if (session && anomaly.source === 'server') {
                  void shopflowApi.reviewAnomaly(anomaly.id, reviewNote, session.access_token)
                    .then(() => {
                      refreshServerData();
                      setNote('');
                    })
                    .catch((error: unknown) => Alert.alert('Mise en revue refusée', error instanceof Error ? error.message : 'Le serveur a refusé cette action.'));
                  return;
                }
                setAnomalyStatus(anomaly.id, 'in_review', reviewNote);
                setNote('');
              }} />
            </View>
            <View style={{ flex: 1 }}><Button title="Résoudre" icon="check" onPress={resolve} /></View>
          </Row>
        </Card>
      ) : anomaly.resolution ? (
        <Card><SectionTitle title="Résolution enregistrée" /><Text style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' }}>{anomaly.resolution}</Text></Card>
      ) : null}

      <Card>
        <SectionTitle title={`Éléments avec référence exacte (${linkedTransactions.length + linkedMessages.length})`} />
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>
          Liens proposés uniquement si la référence correspond exactement. Confirme manuellement le contexte avant toute décision.
        </Text>
        {linkedTransactions.map((transaction) => (
          <Button
            key={transaction.id}
            title={`${transaction.operator} · ${formatMoney(transaction.amountCents, data.settings.currency)} · ${formatDate(transaction.createdAt)}`}
            icon="arrow-up-right"
            variant="secondary"
            onPress={() => router.push(`/transactions/${transaction.id}`)}
          />
        ))}
        {linkedMessages.map((message) => (
          <View key={message.id} style={{ gap: 4, paddingTop: 8 }}>
            <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Message local · {formatDate(message.receivedAt)}</Text>
            <Text style={{ color: colors.inkSoft, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{message.rawText}</Text>
          </View>
        ))}
        {linkedTransactions.length + linkedMessages.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Aucun élément local ne partage cette référence exacte.</Text>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title="Historique" />
        {anomaly.history.map((item, index) => (
          <Row key={`${item.at}-${index}`} style={{ alignItems: 'flex-start' }}>
            <Feather name="circle" size={10} color={colors.primary} style={{ marginTop: 4 }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>{item.text}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{formatDate(item.at)}</Text>
            </View>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 6 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{label}</Text>
      <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{value}</Text>
    </View>
  );
}
