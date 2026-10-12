import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChip, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { Agent, useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

const roles: Agent['role'][] = ['Agent', 'Superviseur', 'Propriétaire'];

export default function TeamScreen() {
  const { data, addAgent } = useShopFlow();
  const colors = useColors();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Agent['role']>('Agent');

  function saveAgent() {
    if (name.trim().length < 2) {
      Alert.alert('Nom requis', 'Saisis au moins deux caractères.');
      return;
    }
    addAgent(name, role);
    setName('');
    setRole('Agent');
    setAdding(false);
  }

  return (
    <Screen title="Agents & rôles" subtitle="Profils indicatifs conservés sur l’appareil" back>
      <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="lock" size={17} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Ces profils ne sont pas des comptes connectés. Sans serveur ni authentification, les rôles n’appliquent pas de contrôle d’accès réel.
          </Text>
        </Row>
      </Card>
      <SectionTitle title={`${data.agents.length} profil${data.agents.length === 1 ? '' : 's'}`} action={adding ? 'Fermer' : 'Ajouter'} onAction={() => setAdding(!adding)} />
      {adding ? (
        <Card>
          <Field label="Nom affiché" placeholder="Ex. Samira D." value={name} onChangeText={setName} />
          <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Rôle indicatif</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {roles.map((item) => <ChoiceChip key={item} label={item} selected={role === item} onPress={() => setRole(item)} />)}
          </View>
          <Button title="Ajouter le profil local" icon="user-plus" onPress={saveAgent} />
        </Card>
      ) : null}
      {data.agents.map((agent) => (
        <Card key={agent.id}>
          <Row>
            <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }}>
              <Text style={{ color: colors.primary, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{agent.name.slice(0, 1).toLocaleUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{agent.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{agent.register}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Badge tone={agent.role === 'Propriétaire' ? 'info' : agent.role === 'Superviseur' ? 'success' : 'neutral'}>{agent.role}</Badge>
              <Badge tone={agent.session === 'active' ? 'success' : 'neutral'}>{agent.session === 'active' ? 'Session active' : 'Hors session'}</Badge>
            </View>
          </Row>
        </Card>
      ))}
      <Card>
        <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>État des permissions</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          Dans cette version autonome, tous les utilisateurs de l’appareil peuvent voir et modifier les données locales. Le contrôle par boutique, rôle, caisse et validation nécessite un backend sécurisé.
        </Text>
      </Card>
    </Screen>
  );
}
