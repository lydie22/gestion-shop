import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChip, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { formatDate, formatMoney } from '@/components/shopflow/format';
import { Operator, operators, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

const sampleText = 'Transaction réussie. Montant : 50 USD Référence : AT-84921 Nouveau solde : 350 USD';

export default function SmsScreen() {
  const { data, addSmsText } = useShopFlow();
  const colors = useColors();
  const [text, setText] = useState('');
  const [operator, setOperator] = useState<Operator>(operators[0]);

  function importText() {
    if (!text.trim()) {
      Alert.alert('Texte requis', 'Colle ou saisis un texte de message.');
      return;
    }
    addSmsText(text, operator);
    setText('');
  }

  return (
    <Screen title="Messages" subtitle="Saisie manuelle uniquement · aucun accès à la boîte SMS" back>
      <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="alert-triangle" size={17} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            ShopFlow ne lit pas les SMS entrants. Seuls les textes que tu colles ici sont analysés localement. Le parseur d’exemple ne prouve pas l’authenticité d’un message.
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
      </Card>

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
