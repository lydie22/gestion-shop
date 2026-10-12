import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

const scenarios = [
  { id: 'parse', title: 'SMS de transaction reconnu', detail: 'Vérifier le montant, la référence, le statut et le solde extraits.' },
  { id: 'dedupe', title: 'Même SMS reçu deux fois', detail: 'Un seul événement financier doit être comptabilisé.' },
  { id: 'sms-no-tx', title: 'SMS sans transaction correspondante', detail: 'Créer un dossier à examiner sans inventer les champs absents.' },
  { id: 'balance-gap', title: 'Solde annoncé différent du solde théorique', detail: 'Conserver l’écart jusqu’à sa résolution.' },
  { id: 'late-sms', title: 'SMS reçu en retard', detail: 'Recalculer sans comptabiliser deux fois le même mouvement.' },
  { id: 'failed', title: 'Échec après une tentative', detail: 'Ne pas ajouter les mouvements d’une opération échouée.' },
  { id: 'reversal', title: 'Transaction inversée', detail: 'Relier les mouvements correctifs à l’opération initiale.' },
  { id: 'offline', title: 'Coupure Internet', detail: 'Données conservées et synchronisation idempotente à la reprise.' },
  { id: 'two-devices', title: 'Même événement sur deux appareils', detail: 'Vérifier l’unicité et l’intégrité côté serveur.' },
  { id: 'permissions', title: 'Agent tente une action non autorisée', detail: 'Le serveur doit refuser et tracer l’action.' },
  { id: 'cash-gap', title: 'Clôture de caisse avec écart', detail: 'Conserver comptage, montant théorique et différence.' },
  { id: 'restore', title: 'Restauration après panne', detail: 'Récupérer puis vérifier les données sauvegardées.' },
];

export default function ChecklistScreen() {
  const { data, toggleTestCheck } = useShopFlow();
  const colors = useColors();
  const completed = scenarios.filter((item) => data.testChecks[item.id]).length;
  return (
    <Screen title="Scénarios de contrôle" subtitle={`${completed} sur ${scenarios.length} marqués comme vérifiés`} back>
      <Card style={{ backgroundColor: colors.warningSurface, borderColor: colors.warningSurface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="alert-triangle" size={17} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' }}>
            Cocher un scénario signifie uniquement que tu le marques comme vérifié. Cela ne lance pas un test technique. Plusieurs scénarios nécessitent un serveur, plusieurs appareils ou un environnement réel, absents de cette version locale.
          </Text>
        </Row>
      </Card>
      <SectionTitle title="Vérifications recommandées" />
      {scenarios.map((item, index) => {
        const checked = Boolean(data.testChecks[item.id]);
        return (
          <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggleTestCheck(item.id)}>
            <Card>
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 29, height: 29, borderRadius: 10, backgroundColor: checked ? colors.primary : colors.muted, alignItems: 'center', justifyContent: 'center' }}>
                  {checked ? <Feather name="check" size={17} color={colors.primaryForeground} /> : <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{String(index + 1).padStart(2, '0')}</Text>}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{item.title}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>{item.detail}</Text>
                </View>
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
