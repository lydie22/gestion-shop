import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Card, ChoiceChip, Field, Row, Screen, SectionTitle } from '@/components/shopflow/ui';
import { anomalySeverityName, anomalyTone, formatDate, formatMoney } from '@/components/shopflow/format';
import { useShopFlow } from '@/context/ShopFlowContext';
import { useColors } from '@/hooks/useColors';

const filterChoices = [
  { label: 'Tous', value: 'all' },
  { label: 'À traiter', value: 'open' },
  { label: 'En cours', value: 'in_review' },
  { label: 'Résolus', value: 'resolved' },
] as const;
const severityChoices = ['all', 'critical', 'high', 'moderate', 'low'] as const;

export default function ControlsScreen() {
  const { data } = useShopFlow();
  const colors = useColors();
  const [filter, setFilter] = useState<(typeof filterChoices)[number]['value']>('all');
  const [severity, setSeverity] = useState<(typeof severityChoices)[number]>('all');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const visible = useMemo(
    () => data.anomalies.filter((anomaly) => {
      const matchesStatus = filter === 'all' || anomaly.status === filter;
      const matchesSeverity = severity === 'all' || anomaly.severity === severity;
      const haystack = [anomaly.title, anomaly.description, anomaly.operator, anomaly.agent, anomaly.reference].filter(Boolean).join(' ').toLocaleLowerCase();
      return matchesStatus && matchesSeverity && haystack.includes(query.trim().toLocaleLowerCase());
    }),
    [data.anomalies, filter, query, severity],
  );
  const openCount = data.anomalies.filter((anomaly) => anomaly.status !== 'resolved').length;
  const activeFilters = [filter !== 'all' ? 1 : 0, severity !== 'all' ? 1 : 0, query.trim() ? 1 : 0].reduce((sum, value) => sum + value, 0);

  return (
    <Screen title="Contrôles" subtitle={`${openCount} dossier${openCount === 1 ? '' : 's'} à examiner`}>
      <Card style={{ backgroundColor: colors.hero, borderColor: colors.hero }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="shield" size={19} color={colors.primaryForeground} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: colors.primaryForeground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Des faits à vérifier, pas des accusations</Text>
            <Text style={{ color: colors.heroMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' }}>
              Un écart ou un message ambigu ne prouve pas une faute. Chaque dossier conserve les valeurs, les sources et les décisions.
            </Text>
          </View>
        </Row>
      </Card>

      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFiltersOpen((value) => !value)}
          style={{ paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_700Bold' }}>Filtres</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {activeFilters > 0 ? (
                <View style={{ backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
                  <Text style={{ color: colors.primaryForeground, fontSize: 10, fontFamily: 'Inter_700Bold' }}>{activeFilters}</Text>
                </View>
              ) : null}
              <Feather name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
            </View>
          </Row>
        </Pressable>

        {filtersOpen ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Statut</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {filterChoices.map((choice) => (
                  <ChoiceChip key={choice.value} label={choice.label} selected={filter === choice.value} onPress={() => setFilter(choice.value)} />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Gravité</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {severityChoices.map((choice) => (
                  <ChoiceChip
                    key={choice}
                    label={choice === 'all' ? 'Toutes' : anomalySeverityName(choice)}
                    selected={severity === choice}
                    onPress={() => setSeverity(choice)}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <Field label="Rechercher dans les dossiers" placeholder="Opérateur, agent, référence…" value={query} onChangeText={setQuery} />
      <SectionTitle title={`${visible.length} dossier${visible.length === 1 ? '' : 's'}`} />
      {visible.map((anomaly) => (
        <Pressable key={anomaly.id} accessibilityRole="button" onPress={() => router.push(`/controls/${anomaly.id}`)}>
          <Card>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: anomaly.severity === 'high' || anomaly.severity === 'critical' ? colors.dangerSurface : colors.warningSurface }}>
                <Feather name={anomaly.type === 'Écart de caisse' ? 'dollar-sign' : 'alert-circle'} size={17} color={anomaly.severity === 'high' || anomaly.severity === 'critical' ? colors.destructive : colors.warning} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 19, fontFamily: 'Inter_600SemiBold' }}>{anomaly.title}</Text>
                <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' }}>{anomaly.description}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                  {anomaly.operator ?? anomaly.type} · {formatDate(anomaly.createdAt)} · {anomaly.agent}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 7 }}>
                {anomaly.amountCents ? <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{formatMoney(anomaly.amountCents, data.settings.currency)}</Text> : null}
                <Badge tone={anomalyTone(anomaly.severity)}>{anomalySeverityName(anomaly.severity)}</Badge>
                <Badge tone={anomaly.status === 'resolved' ? 'success' : anomaly.status === 'in_review' ? 'info' : 'warning'}>
                  {anomaly.status === 'resolved' ? 'Résolu' : anomaly.status === 'in_review' ? 'En cours' : 'À traiter'}
                </Badge>
              </View>
            </Row>
          </Card>
        </Pressable>
      ))}
      {visible.length === 0 ? (
        <Card><Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 20, fontFamily: 'Inter_400Regular' }}>Aucun dossier dans cette vue.</Text></Card>
      ) : null}
    </Screen>
  );
}
