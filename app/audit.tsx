import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { formatDate } from '@/components/shopflow/format';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { shopflowApi } from '@/services/shopflowApi';

export default function AuditScreen() {
  const { data } = useShopFlow();
  const { session } = useAuth();
  const colors = useColors();
  const [serverLogs, setServerLogs] = useState<Array<{ id: string; action: string; entity_type: string; entity_id: string; reason?: string; created_at: string }>>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !['owner', 'supervisor'].includes(session.role)) {
      setServerLogs([]);
      return;
    }
    shopflowApi.getAuditLogs(session.access_token)
      .then(setServerLogs)
      .catch((error: unknown) => setServerError(error instanceof Error ? error.message : 'Journal serveur indisponible.'));
  }, [session?.access_token, session?.role]);
  return (
    <Screen title="Journal d’audit" subtitle={session ? 'Historique local et serveur selon vos permissions' : 'Historique local non synchronisé'} back>
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="info" size={17} color={colors.secondaryForeground} />
          <Text style={{ flex: 1, color: colors.secondaryForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Journal utile pour retracer les actions faites dans l’appareil. Il n’est pas inviolable et ne remplace pas un journal serveur.
          </Text>
        </Row>
      </Card>
      {session && ['owner', 'supervisor'].includes(session.role) ? (
        <Card>
          <SectionTitle title={`Journal serveur (${serverLogs.length})`} />
          {serverError ? <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{serverError}</Text> : null}
          {serverLogs.slice(0, 12).map((event) => (
            <View key={event.id} style={{ gap: 3, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{event.action} · {event.entity_type}</Text>
              <Text style={{ color: colors.inkSoft, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{event.reason || `Référence ${event.entity_id}`}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{formatDate(event.created_at)}</Text>
            </View>
          ))}
          {serverLogs.length === 0 && !serverError ? <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Aucune trace serveur reçue.</Text> : null}
        </Card>
      ) : null}
      <SectionTitle title={`${data.auditEvents.length} action${data.auditEvents.length === 1 ? '' : 's'} récentes`} />
      {data.auditEvents.map((event) => (
        <Card key={event.id}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="activity" size={15} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{event.action}</Text>
              <Text style={{ color: colors.inkSoft, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>{event.detail}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{event.actor} · {formatDate(event.at)}</Text>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
