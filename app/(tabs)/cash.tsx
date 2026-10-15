import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChip, Field, Row, Screen, SectionTitle, Spacer } from '@/components/shopflow/ui';
import { formatDate, formatMoney } from '@/components/shopflow/format';
import { CashMovement, getCashBalance, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { shopflowApi } from '@/services/shopflowApi';
import { enqueueCashMovement, readPendingCashMovements, removePendingCashMovement } from '@/services/cashSyncQueue';
import { createIdempotencyKey } from '@/services/idempotency';

type CashForm = 'open' | 'close' | 'movement' | null;
type MovementCategory = CashMovement['category'];

export default function CashScreen() {
  const { data, openCashSession, closeCashSession, addCashMovement, reviewCashMovement } = useShopFlow();
  const { session } = useAuth();
  const colors = useColors();
  const [form, setForm] = useState<CashForm>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<MovementCategory>('expense');
  const [pending, setPending] = useState(false);
  const [serverBalance, setServerBalance] = useState<number | null>(null);
  const [serverOpenSessionId, setServerOpenSessionId] = useState<string | null>(null);
  const [serverMovements, setServerMovements] = useState<Array<{ id: string; category: string; amount_cents: number; delta_cents: number; note: string; status: string; created_by: string; created_at: string }>>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) {
      setServerBalance(null);
      setServerOpenSessionId(null);
      setServerMovements([]);
      return;
    }
    Promise.all([shopflowApi.getCashBalance(session.access_token), shopflowApi.getCashSessions(session.access_token), shopflowApi.getCashMovements(session.access_token)])
      .then(([cash, sessions, movements]) => {
        setServerBalance(cash.theoretical_balance_cents);
        setServerMovements(movements);
        const ownSession = sessions.find((item) => item.status === 'open' && item.opened_by === session.user_id);
        const visibleSession = ownSession ?? (['owner', 'supervisor'].includes(session.role) ? sessions.find((item) => item.status === 'open') : undefined);
        setServerOpenSessionId(visibleSession?.id ?? null);
        setServerError(null);
      })
      .catch((error: unknown) => setServerError(error instanceof Error ? error.message : 'Caisse serveur indisponible.'));
  }, [session?.access_token]);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    readPendingCashMovements(session.shop_id).then(async (pendingMovements) => {
      let remaining = 0;
      for (const movement of pendingMovements) {
        try {
          await shopflowApi.createCashMovement(movement, session.access_token);
          await removePendingCashMovement(session.shop_id, movement.idempotency_key);
        } catch {
          remaining += 1;
        }
      }
      if (!cancelled && remaining > 0) setServerError(`${remaining} mouvement(s) de caisse restent en attente de synchronisation.`);
    });
    return () => { cancelled = true; };
  }, [session?.access_token]);
  const balance = getCashBalance(data);
  const visibleMovements = useMemo(() => {
    const serverIds = new Set(serverMovements.map((item) => item.id));
    const local = data.cashMovements.filter((item) => !item.serverId || !serverIds.has(item.serverId));
    const remote = serverMovements.map((item) => ({
      id: `server-${item.id}`,
      serverId: item.id,
      category: item.category as CashMovement['category'],
      amountCents: item.amount_cents,
      deltaCents: item.delta_cents,
      note: item.note,
      status: item.status as CashMovement['status'],
      createdAt: item.created_at,
      agent: item.created_by === session?.user_id ? 'Moi' : 'Autre agent',
    }));
    return [...remote, ...local].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.cashMovements, serverMovements, session?.user_id]);
  const currentSession = data.cashSessions.find((session) => session.status === 'open');
  const latestClosed = data.cashSessions.find((session) => session.status === 'closed');

  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const displayedBalance = serverBalance ?? balance;

  async function submit() {
    if (!Number.isFinite(cents) || cents < 0 || (form === 'movement' && cents === 0)) {
      Alert.alert('Montant invalide', 'Saisis un montant positif pour un mouvement et un montant égal ou supérieur à zéro pour un comptage.');
      return;
    }
    if (form === 'open') {
      if (cents !== displayedBalance && note.trim().length < 4) {
        Alert.alert('Justification requise', 'Explique la différence entre le comptage d’ouverture et le solde théorique.');
        return;
      }
      if (session) {
        try {
          const result = await shopflowApi.openCashSession({ counted_cents: cents, note: note.trim() }, session.access_token);
          setServerOpenSessionId(result.id);
          setServerBalance(result.theoretical_cents);
        } catch (error: unknown) {
          Alert.alert('Ouverture serveur refusée', error instanceof Error ? error.message : 'Impossible d’ouvrir la caisse côté serveur.');
          return;
        }
      }
      openCashSession(cents, note);
    } else if (form === 'close') {
      if (cents !== displayedBalance && note.trim().length < 4) {
        Alert.alert('Justification requise', 'Explique l’écart. Le solde théorique ne sera pas modifié.');
        return;
      }
      if (session) {
        if (!serverOpenSessionId) {
          Alert.alert('Session serveur introuvable', 'Actualise la caisse avant de clôturer cette session.');
          return;
        }
        try {
          const result = await shopflowApi.closeCashSession(serverOpenSessionId, { counted_cents: cents, note: note.trim() }, session.access_token);
          setServerOpenSessionId(null);
          setServerBalance(result.theoretical_cents);
        } catch (error: unknown) {
          Alert.alert('Clôture serveur refusée', error instanceof Error ? error.message : 'Impossible de clôturer la caisse côté serveur.');
          return;
        }
      }
      closeCashSession(cents, note);
    } else if (form === 'movement') {
      if (note.trim().length < 3) {
        Alert.alert('Motif requis', 'Ajoute un motif pour conserver une trace du mouvement.');
        return;
      }
      const requestedStatus: 'pending' | 'confirmed' = pending || category === 'other' ? 'pending' : 'confirmed';
      let localStatus: 'pending' | 'confirmed' = requestedStatus;
      let serverMovementId: string | undefined;
      if (session) {
        const idempotencyKey = createIdempotencyKey('cash');
        try {
          const result = await shopflowApi.createCashMovement({ category, amount_cents: cents, note: note.trim(), status: requestedStatus, idempotency_key: idempotencyKey }, session.access_token);
          serverMovementId = result.id;
          localStatus = result.status === 'pending' ? 'pending' : 'confirmed';
          setServerError(result.status === 'pending' ? 'Mouvement transmis en attente de revue serveur.' : null);
          const updated = await shopflowApi.getCashBalance(session.access_token);
          setServerBalance(updated.theoretical_balance_cents);
        } catch (error: unknown) {
          await enqueueCashMovement(session.shop_id, { category, amount_cents: cents, note: note.trim(), status: requestedStatus, idempotency_key: idempotencyKey });
          localStatus = 'pending';
          setServerError(`${error instanceof Error ? error.message : 'Réseau indisponible.'} Mouvement conservé pour reprise ultérieure.`);
        }
      }
      const sign = category === 'owner_in' ? 1 : category === 'owner_out' || category === 'expense' ? -1 : 0;
      addCashMovement({
        category,
        amountCents: cents,
        deltaCents: sign * cents,
        note: note.trim(),
        status: localStatus,
        ...(serverMovementId ? { serverId: serverMovementId } : {}),
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
        <Text style={{ color: colors.heroBalance, fontSize: 34, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}>{formatMoney(displayedBalance, data.settings.currency)}</Text>
        <Text style={{ color: colors.heroMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          Référence : {formatMoney(data.referenceCashCents, data.settings.currency)} · les mouvements en attente sont exclus.
        </Text>
      </Card>
      {session ? <Text style={{ color: serverError ? colors.warning : colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{serverError ?? 'Caisse connectée : les mutations sont contrôlées par le serveur puis conservées localement pour le mode hors ligne.'}</Text> : null}

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
            <View style={{ flex: 1 }}><Button title="Ouvrir une session" icon="play" onPress={() => { setForm(form === 'open' ? null : 'open'); setAmount((displayedBalance / 100).toFixed(2)); }} /></View>
          ) : (
            <View style={{ flex: 1 }}><Button title="Clôturer la session" icon="check-square" onPress={() => { setForm(form === 'close' ? null : 'close'); setAmount((displayedBalance / 100).toFixed(2)); }} /></View>
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
      {visibleMovements.slice(0, 6).map((movement) => (
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
                {movement.status === 'confirmed' ? movement.serverId ? 'Serveur' : 'Local' : movement.status === 'rejected' ? 'Rejeté' : 'En attente'}
              </Badge>
            </View>
          </Row>
          {movement.status === 'pending' && (!session || ['owner', 'supervisor'].includes(session.role)) ? (
            <>
              <Field
                label="Note de revue obligatoire"
                placeholder="Vérification ou motif de rejet…"
                value={reviewNotes[movement.id] ?? ''}
                onChangeText={(value) => setReviewNotes((current) => ({ ...current, [movement.id]: value }))}
              />
              <Row>
                <View style={{ flex: 1 }}>
                  <Button title="Valider" icon="check" variant="secondary" onPress={async () => {
                    const review = reviewNotes[movement.id] ?? '';
                    if (review.trim().length < 4) {
                      Alert.alert('Note requise', 'Ajoute une courte note de vérification.');
                      return;
                    }
                    if (session) {
                      if (!movement.serverId) {
                        Alert.alert('Synchronisation requise', 'Ce mouvement local doit d’abord être synchronisé avant validation.');
                        return;
                      }
                      try {
                        await shopflowApi.reviewCashMovement(movement.serverId, 'confirmed', review, session.access_token);
                        setServerMovements((current) => current.map((item) => item.id === movement.serverId ? { ...item, status: 'confirmed', note: `${item.note} · Validation : ${review.trim()}` } : item));
                      } catch (error: unknown) {
                        Alert.alert('Validation refusée', error instanceof Error ? error.message : 'Le serveur a refusé la validation.');
                        return;
                      }
                    }
                    reviewCashMovement(movement.id, 'confirmed', review);
                    setReviewNotes((current) => ({ ...current, [movement.id]: '' }));
                  }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Rejeter" icon="x" variant="danger" onPress={async () => {
                    const review = reviewNotes[movement.id] ?? '';
                    if (review.trim().length < 4) {
                      Alert.alert('Motif requis', 'Ajoute la raison du rejet.');
                      return;
                    }
                    if (session) {
                      if (!movement.serverId) {
                        Alert.alert('Synchronisation requise', 'Ce mouvement local doit d’abord être synchronisé avant rejet.');
                        return;
                      }
                      try {
                        await shopflowApi.reviewCashMovement(movement.serverId, 'rejected', review, session.access_token);
                        setServerMovements((current) => current.map((item) => item.id === movement.serverId ? { ...item, status: 'rejected', note: `${item.note} · Rejet : ${review.trim()}` } : item));
                      } catch (error: unknown) {
                        Alert.alert('Rejet refusé', error instanceof Error ? error.message : 'Le serveur a refusé le rejet.');
                        return;
                      }
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
