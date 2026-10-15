import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChip, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { BackendAccount, BackendRole, shopflowApi } from '@/services/shopflowApi';

export default function TeamScreen() {
  const { data } = useShopFlow();
  const colors = useColors();
  const { session } = useAuth();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<Array<{ user_id: string; email: string; full_name: string; role: BackendRole; active: boolean }>>([]);
  const [remoteAdding, setRemoteAdding] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberRole, setMemberRole] = useState<Exclude<BackendRole, 'owner'>>('agent');
  const [accounts, setAccounts] = useState<BackendAccount[]>([]);
  const [backendAgents, setBackendAgents] = useState<Array<{ id: string; name: string; user_id?: string; active: boolean }>>([]);
  const [accountAdding, setAccountAdding] = useState(false);
  const [accountLabel, setAccountLabel] = useState('');
  const [accountOpening, setAccountOpening] = useState('0');

  useEffect(() => {
    if (!session || session.role === 'agent') return;
    Promise.all([shopflowApi.listMembers(session.access_token), shopflowApi.listAccounts(session.access_token), shopflowApi.listAgents(session.access_token)])
      .then(([memberRows, accountRows, agentRows]) => { setMembers(memberRows); setAccounts(accountRows); setBackendAgents(agentRows); })
      .catch(() => undefined);
  }, [session]);

  async function saveRemoteAccount() {
    if (!session || !['owner', 'supervisor'].includes(session.role)) return;
    const opening = Number(accountOpening.replace(',', '.'));
    if (accountLabel.trim().length < 2 || !Number.isFinite(opening) || opening < 0) {
      Alert.alert('Compte invalide', 'Saisis un libellé et un solde initial valide.');
      return;
    }
    try {
      const created = await shopflowApi.createAccount({ operator: 'Airtel Money', label: accountLabel.trim(), opening_balance_cents: Math.round(opening * 100) }, session.access_token);
      setAccounts((items) => [created, ...items]);
      setAccountLabel('');
      setAccountOpening('0');
      setAccountAdding(false);
    } catch (cause) {
      Alert.alert('Création impossible', cause instanceof Error ? cause.message : 'Le compte serveur n’a pas pu être créé.');
    }
  }

  async function assignRemoteAccount(accountId: string, agentId: string) {
    if (!session || !['owner', 'supervisor'].includes(session.role)) return;
    try {
      await shopflowApi.assignAccount(accountId, { agent_id: agentId, assignment_role: 'operator' }, session.access_token);
      Alert.alert('Affectation enregistrée', 'L’agent peut maintenant saisir des opérations sur ce compte.');
    } catch (cause) {
      Alert.alert('Affectation impossible', cause instanceof Error ? cause.message : 'Le serveur a refusé l’affectation.');
    }
  }

  async function saveRemoteMember() {
    if (!session || session.role !== 'owner' || memberSaving) return;
    if (memberEmail.trim().length < 5 || memberPassword.length < 10 || name.trim().length < 2) {
      Alert.alert('Informations requises', 'Nom, e-mail et mot de passe de 10 caractères minimum sont nécessaires.');
      return;
    }
    if (members.some((member) => member.active && member.email.trim().toLocaleLowerCase() === memberEmail.trim().toLocaleLowerCase())) {
      Alert.alert('Membre déjà présent', 'Cette adresse e-mail appartient déjà à un membre actif de cette boutique. Modifie son rôle depuis sa fiche ou utilise une autre adresse.');
      return;
    }
    setMemberSaving(true);
    try {
      const createdMember = await shopflowApi.createMember({ email: memberEmail, full_name: name, password: memberPassword, role: memberRole }, session.access_token);
      if (memberRole === 'agent') {
        await shopflowApi.createAgent({ name: name.trim(), user_id: createdMember.user_id }, session.access_token);
      }
      setMembers(await shopflowApi.listMembers(session.access_token));
      setBackendAgents(await shopflowApi.listAgents(session.access_token));
      setName('');
      setMemberEmail('');
      setMemberPassword('');
      setRemoteAdding(false);
    } catch (cause) {
      Alert.alert('Ajout impossible', cause instanceof Error ? cause.message : 'Le backend est indisponible.');
    } finally {
      setMemberSaving(false);
    }
  }

  const visibleAgents = session ? backendAgents : data.agents;

  async function changeMemberRole(userId: string, nextRole: BackendRole) {
    if (!session || session.role !== 'owner') return;
    try {
      await shopflowApi.updateMemberRole(userId, nextRole, session.access_token);
      setMembers(await shopflowApi.listMembers(session.access_token));
    } catch (cause) {
      Alert.alert('Modification impossible', cause instanceof Error ? cause.message : 'Le backend est indisponible.');
    }
  }

  function saveAgent() {
    if (name.trim().length < 2) {
      Alert.alert('Nom requis', 'Saisis au moins deux caractères.');
      return;
    }
    if (!session) {
      Alert.alert('Connexion requise', 'Un profil agent doit être créé dans la boutique côté serveur. Connecte-toi d’abord.');
      return;
    }
    void shopflowApi.createAgent({ name: name.trim() }, session.access_token)
      .then(async () => {
        setBackendAgents(await shopflowApi.listAgents(session.access_token));
        setName('');
        setAdding(false);
      })
      .catch((cause) => Alert.alert('Création impossible', cause instanceof Error ? cause.message : 'Le profil serveur n’a pas pu être créé.'));
  }

  if (session?.role === 'agent') {
    return (
      <Screen title="Agents & rôles" subtitle="Accès réservé aux responsables" back>
        <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Feather name="lock" size={17} color={colors.warning} />
            <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
              La gestion des membres, des rôles et des affectations de comptes est réservée au propriétaire et au superviseur.
            </Text>
          </Row>
        </Card>
        <Button title="Retour" icon="arrow-left" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
      <Screen title="Agents & rôles" subtitle={session ? `Gestion sécurisée · rôle ${session.role}` : 'Connexion requise pour gérer la boutique'} back>
      <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="lock" size={17} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            {session ? 'Les membres connectés sont gérés par le backend. Les permissions sont vérifiées côté serveur pour chaque boutique et chaque opération.' : 'Ces profils ne sont pas des comptes connectés. Sans serveur ni authentification, les rôles n’appliquent pas de contrôle d’accès réel.'}
          </Text>
        </Row>
      </Card>
      <SectionTitle title={`${visibleAgents.length} profil${visibleAgents.length === 1 ? '' : 's'}`} action={adding ? 'Fermer' : 'Ajouter'} onAction={() => setAdding(!adding)} />
      {adding ? (
        <Card>
          <Field label="Nom affiché" placeholder="Ex. Samira D." value={name} onChangeText={setName} />
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
            Le profil opérationnel est créé côté serveur. Le rôle d’accès est géré séparément par le compte membre.
          </Text>
          <Button title="Créer le profil serveur" icon="user-plus" onPress={saveAgent} />
        </Card>
      ) : null}
      {session ? backendAgents.map((agent) => {
        const linkedMember = members.find((member) => member.user_id === agent.user_id);
        return (
          <Card key={agent.id}>
            <Row>
              <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }}>
                <Text style={{ color: colors.primary, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{agent.name.slice(0, 1).toLocaleUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{agent.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{linkedMember?.email ?? 'Profil serveur non lié à un compte'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Badge tone="info">Profil agent</Badge>
                <Badge tone={agent.user_id ? 'success' : 'neutral'}>{agent.user_id ? 'Compte lié' : 'Sans connexion'}</Badge>
              </View>
            </Row>
          </Card>
        );
      }) : data.agents.map((agent) => (
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
      {session ? (
        <>
          <SectionTitle title={`Membres connectés (${members.length})`} action={session.role === 'owner' ? (remoteAdding ? 'Fermer' : 'Ajouter') : undefined} onAction={session.role === 'owner' ? () => setRemoteAdding(!remoteAdding) : undefined} />
          {remoteAdding ? (
            <Card>
              <Field label="Nom complet" placeholder="Ex. Samira D." value={name} onChangeText={setName} />
              <Field label="E-mail du compte" placeholder="agent@exemple.com" value={memberEmail} onChangeText={setMemberEmail} keyboardType="email-address" autoCapitalize="none" />
              <Field label="Mot de passe temporaire" placeholder="10 caractères minimum" value={memberPassword} onChangeText={setMemberPassword} secureTextEntry />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ChoiceChip label="Agent" selected={memberRole === 'agent'} onPress={() => setMemberRole('agent')} />
                <ChoiceChip label="Superviseur" selected={memberRole === 'supervisor'} onPress={() => setMemberRole('supervisor')} />
              </View>
              <Button title="Créer le compte sécurisé" icon="user-plus" loading={memberSaving} onPress={() => void saveRemoteMember()} />
            </Card>
          ) : null}
          {members.map((member) => (
            <Card key={member.user_id}>
              <Row>
                <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{member.full_name.slice(0, 1).toLocaleUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{member.full_name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{member.email}</Text>
                </View>
                <Badge tone={member.role === 'owner' ? 'info' : member.role === 'supervisor' ? 'success' : 'neutral'}>{member.role}</Badge>
              </Row>
              {session.role === 'owner' && member.role !== 'owner' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <ChoiceChip label="Agent" selected={member.role === 'agent'} onPress={() => void changeMemberRole(member.user_id, 'agent')} />
                  <ChoiceChip label="Superviseur" selected={member.role === 'supervisor'} onPress={() => void changeMemberRole(member.user_id, 'supervisor')} />
                </View>
              ) : null}
            </Card>
          ))}
          <SectionTitle title={`Comptes opérationnels (${accounts.length})`} action={accountAdding ? 'Fermer' : 'Ajouter'} onAction={() => setAccountAdding((value) => !value)} />
          {accountAdding ? (
            <Card>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Opérateur initial : Airtel Money</Text>
              <Field label="Libellé du compte" placeholder="Ex. Airtel · Caisse principale" value={accountLabel} onChangeText={setAccountLabel} />
              <Field label="Solde initial" placeholder="0,00" value={accountOpening} onChangeText={setAccountOpening} keyboardType="decimal-pad" />
              <Button title="Créer le compte opérationnel" icon="credit-card" onPress={() => void saveRemoteAccount()} />
            </Card>
          ) : null}
          {accounts.map((account) => (
            <Card key={account.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ gap: 4 }}><Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{account.label}</Text><Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{account.operator} · compte {account.active ? 'actif' : 'inactif'}</Text></View>
                <Badge tone="info">Serveur</Badge>
              </Row>
              {backendAgents.length ? <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Affecter à un agent</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {backendAgents.map((agent) => <ChoiceChip key={agent.id} label={agent.name} selected={false} onPress={() => void assignRemoteAccount(account.id, agent.id)} />)}
              </View>
            </Card>
          ))}
        </>
      ) : null}
      <Card>
        <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>État des permissions</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
          {session ? 'Les opérations backend respectent le rôle, la boutique, les affectations de compte et les validations requises. Les données locales restent signalées comme hors ligne.' : 'Dans cette version autonome, tous les utilisateurs de l’appareil peuvent voir et modifier les données locales. Connecte-toi pour activer le contrôle serveur par boutique et par rôle.'}
        </Text>
      </Card>
    </Screen>
  );
}
