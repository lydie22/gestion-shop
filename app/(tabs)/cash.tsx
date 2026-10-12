import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChip, Field, Row, Screen, SectionTitle, Spacer } from '@/components/shopflow/ui';
import { formatDate, formatMoney } from '@/components/shopflow/format';
import { CashMovement, getCashBalance, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

type CashForm = 'open' | 'close' | 'movement' | null;
type MovementCategory = CashMovement['category'];

export default function CashScreen() {
  const { data, openCashSession, closeCashSession, addCashMovement, reviewCashMovement } = useShopFlow();
  const colors = useColors();
  const [form, setForm] = useState<CashForm>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<MovementCategory>('expense');
  const [pending, setPending] = useState(false);
  const balance = getCashBalance(data);
  const currentSession = data.cashSessions.find((session) => session.status === 'open');
  const latestClosed = data.cashSessions.find((session) => session.status === 'closed');

  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  function submit() {
    if (!Number.isFinite(cents) || cents < 0 || (form === 'movement' && cents === 0)) {
      Alert.alert('Montant invalide', 'Saisis un montant positif pour un mouvement et un montant égal ou supérieur à zéro pour un comptage.');
      return;
    }
    if (form === 'open') {
      if (cents !== balance && note.trim().length < 4) {
        Alert.alert('Justification requise', 'Explique la différence entre le comptage d’ouverture et le solde théorique.');
        return;
      }
      openCashSession(cents, note);
    } else if (form === 'close') {
      if (cents !== balance && note.trim().length < 4) {
        Alert.alert('Justification requise', 'Explique l’écart. Le solde théorique ne sera pas modifié.');
        return;
      }
      closeCashSession(cents, note);
    } else if (form === 'movement') {
      if (note.trim().length < 3) {
        Alert.alert('Motif requis', 'Ajoute un motif pour conserver une trace du mouvement.');
        return;
      }
      const sign = category === 'owner_in' ? 1 : category === 'owner_out' || category === 'expense' ? -1 : 0;
      addCashMovement({
        category,
        amountCents: cents,
        deltaCents: sign * cents,
        note: note.trim(),
        status: pending || category === 'other' ? 'pending' : 'confirmed',
      });
    }
    setForm(null);
    setAmount('');
    setNote('');
    setPending(false);
  }

  return (
    <Screen title="Caisse" subtitle="Espèces physiques · mouvements et clôtures">
      <Card style={{ backgroundColor: colors.hero, borderColor: colors.hero }}>
        <Text style={{ color: colors.heroMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>SOLDE THÉORIQUE</Text>
        <Text style={{ color: colors.heroBalance, fontSize: 34, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}>{formatMoney(balance, data.settings.currency)}</Text>
        <Text style={{ color: colors.heroMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          Référence : {formatMoney(data.referenceCashCents, data.settings.currency)} · les mouvements en attente sont exclus.
        </Text>
      </Card>

      <Card>
        <Row>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>
              {currentSession ? 'Session en cours' : 'Aucune session ouverte'}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>
              {currentSession
                ? `Ouverte ${formatDate(currentSession.openedAt)} · compté ${formatMoney(currentSession.openingCountCents, data.settings.currency)} · théorique ${formatMoney(currentSession.openingTheoreticalCents, data.settings.currency)}`
                : latestClosed
                  ? `Dernier comptage : ${formatMoney(latestClosed.closingCountCents ?? 0, data.settings.currency)} · théorique à la clôture : ${formatMoney(latestClosed.closingTheoreticalCents ?? 0, data.settings.currency)}`
                  : 'Ouvre une session et saisis le comptage physique de départ.'}
            </Text>
            {currentSession && currentSession.openingVarianceCents !== 0 ? (
              <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' }}>
                Écart à l’ouverture : {formatMoney(currentSession.openingVarianceCents ?? 0, data.settings.currency)} · {currentSession.openingExplanation || 'sans explication'}
              </Text>
            ) : null}
          </View>
          <Badge tone={currentSession ? 'success' : 'neutral'}>{currentSession ? 'Ouverte' : 'Fermée'}</Badge>
        </Row>
        <Row>
          {!currentSession ? (
            <View style={{ flex: 1 }}><Button title="Ouvrir une session" icon="play" onPress={() => { setForm(form === 'open' ? null : 'open'); setAmount((balance / 100).toFixed(2)); }} /></View>
          ) : (
            <View style={{ flex: 1 }}><Button title="Clôturer la session" icon="check-square" onPress={() => { setForm(form === 'close' ? null : 'close'); setAmount((balance / 100).toFixed(2)); }} /></View>
          )}
          <View style={{ flex: 1 }}><Button title="Mouvement" variant="secondary" icon="plus" onPress={() => setForm(form === 'movement' ? null : 'movement')} /></View>
        </Row>
      </Card>

      {form ? (
        <Card>
          <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
            {form === 'open' ? 'Comptage d’ouverture' : form === 'close' ? 'Comptage de clôture' : 'Nouveau mouvement de caisse'}
          </Text>
          <Field label={`Montant (${data.settings.currency})`} placeholder="0,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
          {form === 'movement' ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ChoiceChip label="Dépense" selected={category === 'expense'} onPress={() => setCategory('expense')} />
                <ChoiceChip label="Apport" selected={category === 'owner_in'} onPress={() => setCategory('owner_in')} />
                <ChoiceChip label="Retrait propriétaire" selected={category === 'owner_out'} onPress={() => setCategory('owner_out')} />
                <ChoiceChip label="Autre" selected={category === 'other'} onPress={() => setCategory('other')} />
              </View>
              <Field label="Motif / justificatif" placeholder="Ex. achat de fournitures" value={note} onChangeText={setNote} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ChoiceChip label="Comptabiliser localement" selected={!pending && category !== 'other'} onPress={() => setPending(false)} />
                <ChoiceChip label="Laisser en attente" selected={pending || category === 'other'} onPress={() => setPending(true)} />
              </View>
              {category === 'other' ? (
                <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' }}>
                  « Autre » reste toujours en attente : précise la direction financière avant de l’inclure dans le solde.
                </Text>
              ) : null}
            </>
          ) : form === 'close' || form === 'open' ? (
            <Field label={`${form === 'open' ? 'Source / explication du comptage initial' : 'Explication de clôture'} (obligatoire si écart)`} placeholder="Décris ce qui reste à vérifier" value={note} onChangeText={setNote} multiline />
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
              Le comptage est enregistré séparément du montant théorique. Un écart ne déclenche aucun ajustement automatique.
            </Text>
          )}
          <Row>
            <View style={{ flex: 1 }}><Button title="Enregistrer" icon="check" onPress={submit} /></View>
            <View style={{ flex: 1 }}><Button title="Annuler" variant="outline" onPress={() => setForm(null)} /></View>
          </Row>
        </Card>
      ) : null}

      <SectionTitle title="Mouvements récents" />
      {data.cashMovements.slice(0, 6).map((movement) => (
        <Card key={movement.id}>
          <Row>
            <Feather name={movement.deltaCents < 0 ? 'arrow-down-right' : movement.deltaCents > 0 ? 'arrow-up-right' : 'repeat'} size={18} color={movement.deltaCents < 0 ? colors.destructive : colors.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{movement.note}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{formatDate(movement.createdAt)} · {movement.agent}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{movement.deltaCents > 0 ? '+' : movement.deltaCents < 0 ? '−' : ''}{formatMoney(Math.abs(movement.deltaCents), data.settings.currency)}</Text>
              <Badge tone={movement.status === 'confirmed' ? 'success' : movement.status === 'rejected' ? 'danger' : 'warning'}>
                {movement.status === 'confirmed' ? 'Local' : movement.status === 'rejected' ? 'Rejeté' : 'En attente'}
              </Badge>
            </View>
          </Row>
          {movement.status === 'pending' ? (
            <>
              <Field
                label="Note de revue obligatoire"
                placeholder="Vérification ou motif de rejet…"
                value={reviewNotes[movement.id] ?? ''}
                onChangeText={(value) => setReviewNotes((current) => ({ ...current, [movement.id]: value }))}
              />
              <Row>
                <View style={{ flex: 1 }}>
                  <Button title="Valider localement" icon="check" variant="secondary" onPress={() => {
                    const review = reviewNotes[movement.id] ?? '';
                    if (review.trim().length < 4) {
                      Alert.alert('Note requise', 'Ajoute une courte note de vérification.');
                      return;
                    }
                    reviewCashMovement(movement.id, 'confirmed', review);
                    setReviewNotes((current) => ({ ...current, [movement.id]: '' }));
                  }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Rejeter" icon="x" variant="danger" onPress={() => {
                    const review = reviewNotes[movement.id] ?? '';
                    if (review.trim().length < 4) {
                      Alert.alert('Motif requis', 'Ajoute la raison du rejet.');
                      return;
                    }
                    reviewCashMovement(movement.id, 'rejected', review);
                    setReviewNotes((current) => ({ ...current, [movement.id]: '' }));
                  }} />
                </View>
              </Row>
            </>
          ) : null}
        </Card>
      ))}

      <SectionTitle title="Clôtures récentes" />
      {data.cashSessions.filter((session) => session.status === 'closed').slice(0, 4).map((session) => (
        <Card key={session.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{formatDate(session.closedAt ?? session.openedAt)}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                Compté {formatMoney(session.closingCountCents ?? 0, data.settings.currency)} · attendu {formatMoney(session.closingTheoreticalCents ?? 0, data.settings.currency)}
              </Text>
            </View>
            <Badge tone={session.varianceCents === 0 ? 'success' : 'warning'}>
              Écart {formatMoney(session.varianceCents ?? 0, data.settings.currency)}
            </Badge>
          </Row>
          {session.explanation ? <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{session.explanation}</Text> : null}
        </Card>
      ))}
      <Spacer size={8} />
    </Screen>
  );
}
