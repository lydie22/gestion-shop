import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChip, Field, Row, Screen } from '@/components/shopflow/ui';
import { formatMoney } from '@/components/shopflow/format';
import { Operator, operators, TransactionStatus, TransactionType, transactionTypeLabel, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

const types: TransactionType[] = ['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'fee'];

function readCents(value: string) {
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

export default function NewTransactionScreen() {
  const { addTransaction, data } = useShopFlow();
  const colors = useColors();
  const [operator, setOperator] = useState<Operator>(operators[0]);
  const [type, setType] = useState<TransactionType>('deposit');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [commission, setCommission] = useState('');
  const [reference, setReference] = useState('');
  const [agent, setAgent] = useState(data.agents[0]?.name ?? 'Utilisateur local');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<TransactionStatus>('pending');

  function save() {
    const amountCents = readCents(amount);
    const feeCents = fee ? readCents(fee) : 0;
    const commissionCents = commission ? readCents(commission) : 0;
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      Alert.alert('Montant requis', 'Saisis un montant supérieur à zéro.');
      return;
    }
    if (status === 'confirmed' && reference.trim().length < 3) {
      Alert.alert('Référence requise', 'Pour marquer la saisie comme confirmée localement, ajoute une référence de preuve.');
      return;
    }
    if (status === 'failed' && note.trim().length < 4) {
      Alert.alert('Motif requis', 'Ajoute une note expliquant pourquoi cette opération est déclarée en échec.');
      return;
    }
    if (reference.trim() && data.transactions.some(
      (transaction) => transaction.operator === operator && transaction.reference.toLocaleLowerCase() === reference.trim().toLocaleLowerCase(),
    )) {
      Alert.alert('Référence déjà enregistrée', 'Une opération avec cette référence existe déjà pour cet opérateur. Vérifie la saisie avant de continuer.');
      return;
    }
    addTransaction({
      operator,
      type,
      amountCents,
      feeCents: Number.isFinite(feeCents) ? feeCents : 0,
      commissionCents: Number.isFinite(commissionCents) ? commissionCents : 0,
      reference,
      agent,
      note,
      status,
    });
    Alert.alert(
      'Opération enregistrée',
      status === 'confirmed'
        ? 'Cette opération est marquée comme confirmée par saisie locale. ShopFlow ne l’a pas vérifiée auprès de l’opérateur.'
        : status === 'failed'
          ? 'L’opération déclarée en échec reste dans l’historique mais ne modifie pas les soldes.'
          : 'L’opération reste en attente et n’entre pas dans le calcul des soldes.',
      [{ text: 'Continuer', onPress: () => router.back() }],
    );
  }

  return (
    <Screen title="Nouvelle opération" subtitle="Saisie locale · aucune requête serveur" back>
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="info" size={17} color={colors.secondaryForeground} />
          <Text style={{ color: colors.secondaryForeground, flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Les frais restent distincts du montant principal. Une opération en attente ne modifie aucun solde calculé.
          </Text>
        </Row>
      </Card>

      <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Opérateur</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {operators.map((item) => <ChoiceChip key={item} label={item} selected={operator === item} onPress={() => setOperator(item)} />)}
      </View>

      <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Type d’opération</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {types.map((item) => <ChoiceChip key={item} label={transactionTypeLabel[item]} selected={type === item} onPress={() => setType(item)} />)}
      </View>

      <Field label={`Montant principal (${data.settings.currency})`} placeholder="0,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <Row>
        <View style={{ flex: 1 }}><Field label={`Frais (${data.settings.currency})`} placeholder="0,00" keyboardType="decimal-pad" value={fee} onChangeText={setFee} /></View>
        <View style={{ flex: 1 }}><Field label={`Commission estimée (${data.settings.currency})`} placeholder="0,00" keyboardType="decimal-pad" value={commission} onChangeText={setCommission} /></View>
      </Row>
      <Field label="Référence" placeholder="Ex. TX84921" autoCapitalize="characters" value={reference} onChangeText={setReference} />

      <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Agent associé</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {data.agents.map((item) => <ChoiceChip key={item.id} label={item.name} selected={agent === item.name} onPress={() => setAgent(item.name)} />)}
      </View>
      <Field label="Note (facultatif)" placeholder="Détail utile au rapprochement" value={note} onChangeText={setNote} multiline />

      <Card>
        <Row>
          <Feather name={status === 'confirmed' ? 'check-circle' : status === 'failed' ? 'x-circle' : 'clock'} size={18} color={status === 'confirmed' ? colors.primary : status === 'failed' ? colors.destructive : colors.warning} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
              {status === 'confirmed' ? 'Confirmée par déclaration locale' : status === 'failed' ? 'Échec déclaré localement' : 'En attente de confirmation'}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>
              {status === 'confirmed'
                ? 'Elle sera comptée dans les soldes locaux. Cela ne constitue pas une validation opérateur.'
                : status === 'failed'
                  ? 'L’explication est conservée ; aucun mouvement définitif n’est comptabilisé.'
                  : 'Une opération en attente ne modifie pas les soldes calculés.'}
            </Text>
          </View>
          <Badge tone={status === 'confirmed' ? 'success' : status === 'failed' ? 'danger' : 'warning'}>
            {status === 'confirmed' ? 'Local' : status === 'failed' ? 'Échec' : 'Attente'}
          </Badge>
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <ChoiceChip label="À confirmer" selected={status === 'pending'} onPress={() => setStatus('pending')} />
          <ChoiceChip label="Confirmée localement" selected={status === 'confirmed'} onPress={() => setStatus('confirmed')} />
          <ChoiceChip label="Échec déclaré" selected={status === 'failed'} onPress={() => setStatus('failed')} />
        </View>
      </Card>

      <Card style={{ backgroundColor: colors.secondary, borderColor: colors.secondary }}>
        <Text style={{ color: colors.secondaryForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
          Impacts prévus : portefeuille {type === 'deposit' || type === 'transfer_in' ? '+' : type === 'withdrawal' || type === 'transfer_out' || type === 'fee' ? '−' : '0'}{formatMoney(readCents(amount) || 0, data.settings.currency)} · caisse {type === 'deposit' ? '+' : type === 'withdrawal' ? '−' : 'sans changement'}{type === 'deposit' || type === 'withdrawal' ? formatMoney(readCents(amount) || 0, data.settings.currency) : ''}
        </Text>
      </Card>
      <Button title="Enregistrer dans le journal local" icon="check" onPress={save} testID="save-transaction" />
    </Screen>
  );
}
