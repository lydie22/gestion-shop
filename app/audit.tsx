import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { Card, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { formatDate } from '@/components/shopflow/format';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

export default function AuditScreen() {
  const { data } = useShopFlow();
  const colors = useColors();
  return (
    <Screen title="Journal d’audit" subtitle="Historique local non synchronisé" back>
      <Card style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="info" size={17} color={colors.secondaryForeground} />
          <Text style={{ flex: 1, color: colors.secondaryForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Journal utile pour retracer les actions faites dans l’appareil. Il n’est pas inviolable et ne remplace pas un journal serveur.
          </Text>
        </Row>
      </Card>
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
