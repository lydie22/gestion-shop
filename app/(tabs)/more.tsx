import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Row, Screen, Spacer } from '@/components/shopflow/ui';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

const menu = [
  { title: 'Comptes Airtel', detail: 'Soldes théoriques et comptes accessibles', icon: 'credit-card' as const, route: '/accounts', roles: ['owner', 'supervisor', 'agent'] },
  { title: 'Rapports & commissions', detail: 'Synthèse de vos opérations et commissions', icon: 'bar-chart-2' as const, route: '/reports', roles: ['owner', 'supervisor', 'agent'] },
  { title: 'Journal financier', detail: 'Soldes et mouvements des comptes autorisés', icon: 'list' as const, route: '/ledger', roles: ['owner', 'supervisor', 'agent'] },
  { title: 'Scénarios de contrôle', detail: 'Liste de suivi des vérifications recommandées', icon: 'check-square' as const, route: '/checklist', roles: ['owner', 'supervisor'] },
  { title: 'Messages SMS', detail: 'Importer et rapprocher les événements autorisés', icon: 'message-square' as const, route: '/sms', roles: ['owner', 'supervisor', 'agent'] },
  { title: 'Agents & rôles', detail: 'Membres, permissions et affectations de la boutique', icon: 'users' as const, route: '/team', roles: ['owner', 'supervisor'] },
  { title: 'Journal d’audit', detail: 'Historique des actions sensibles côté serveur', icon: 'clock' as const, route: '/audit', roles: ['owner', 'supervisor'] },
  { title: 'Paramètres de la boutique', detail: 'Devise, seuil d’écart et données locales', icon: 'settings' as const, route: '/settings', roles: ['owner', 'supervisor'] },
] as const;

export default function MoreScreen() {
  const colors = useColors();
  const { data } = useShopFlow();
  const { session, logout } = useAuth();
  const visibleMenu = menu.filter((item) => session ? (item.roles as readonly string[]).includes(session.role) : item.route !== '/team' && item.route !== '/audit');
  return (
    <Screen title="Plus" subtitle={data.settings.shopName}>
      <Card style={{ backgroundColor: colors.hero, borderColor: colors.hero }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="smartphone" size={20} color={colors.primaryForeground} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: colors.primaryForeground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{session ? session.role === 'agent' ? 'Espace agent' : 'Espace responsable' : 'Mode local sur un appareil'}</Text>
            <Text style={{ color: colors.heroMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
              {session ? session.role === 'agent' ? 'Saisis tes opérations et suis les comptes qui te sont affectés. Les dossiers de contrôle sont traités par un responsable.' : 'Gère les membres, les affectations, les contrôles et les données de ta boutique. Les permissions sont vérifiées par le backend.' : 'Les données restent dans le stockage de l’application. Les rôles présentés ne remplacent ni une connexion ni des autorisations sécurisées.'}
            </Text>
          </View>
        </Row>
      </Card>
      {visibleMenu.map((item) => (
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
      <Card onPress={() => void logout()}>
        <Row>
          <Feather name="log-out" size={19} color={colors.destructive} />
          <Text style={{ color: colors.destructive, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Se déconnecter</Text>
        </Row>
      </Card>
      <Spacer size={5} />
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>
        Les données financières affichées proviennent du serveur lorsque la session est active. Les données locales en attente sont signalées.
      </Text>
    </Screen>
  );
}
