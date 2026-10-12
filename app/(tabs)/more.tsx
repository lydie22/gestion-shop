import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Row, Screen, Spacer } from '@/components/shopflow/ui';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

const menu = [
  { title: 'Rapports & commissions', detail: 'Synthèse journalière, par opérateur et par agent', icon: 'bar-chart-2' as const, route: '/reports' },
  { title: 'Journal financier', detail: 'Reconstituer chaque solde depuis un point de référence', icon: 'list' as const, route: '/ledger' },
  { title: 'Scénarios de contrôle', detail: 'Liste de suivi des 12 vérifications recommandées', icon: 'check-square' as const, route: '/checklist' },
  { title: 'Messages de démonstration', detail: 'Saisir un texte à analyser manuellement', icon: 'message-square' as const, route: '/sms' },
  { title: 'Agents & rôles', detail: 'Profils locaux et affectations indicatives', icon: 'users' as const, route: '/team' },
  { title: 'Journal d’audit', detail: 'Historique des actions conservé sur cet appareil', icon: 'clock' as const, route: '/audit' },
  { title: 'Paramètres de la boutique', detail: 'Devise, seuil d’écart et données locales', icon: 'settings' as const, route: '/settings' },
] as const;

export default function MoreScreen() {
  const colors = useColors();
  const { data } = useShopFlow();
  return (
    <Screen title="Plus" subtitle={data.settings.shopName}>
      <Card style={{ backgroundColor: colors.hero, borderColor: colors.hero }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="smartphone" size={20} color={colors.primaryForeground} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: colors.primaryForeground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Mode local sur un appareil</Text>
            <Text style={{ color: colors.heroMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
              Les données restent dans le stockage de l’application. Les rôles présentés ne remplacent ni une connexion ni des autorisations sécurisées.
            </Text>
          </View>
        </Row>
      </Card>
      {menu.map((item) => (
        <Pressable key={item.route} accessibilityRole="button" onPress={() => router.push(item.route)}>
          <Card>
            <Row>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={item.icon} size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{item.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' }}>{item.detail}</Text>
              </View>
              <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
            </Row>
          </Card>
        </Pressable>
      ))}
      <Spacer size={5} />
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>
        Version de démonstration locale · aucune donnée financière réelle n’est connectée.
      </Text>
    </Screen>
  );
}
