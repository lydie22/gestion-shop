import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button, Card, Field, Spacer } from '@/components/shopflow/ui';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function AuthScreen() {
  const colors = useColors();
  const { login, register, error } = useAuth();
  const { width: viewportWidth } = useWindowDimensions();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 10 || (isRegister && (!fullName.trim() || !shopName.trim()))) {
      Alert.alert('Informations incomplètes', isRegister ? 'Renseigne tous les champs et utilise un mot de passe d’au moins 10 caractères.' : 'Renseigne ton adresse et ton mot de passe.');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) await register({ email, password, full_name: fullName, shop_name: shopName, currency: 'USD' });
      else await login(email, password);
    } catch {
      // L'erreur détaillée est affichée dans la carte de formulaire.
    } finally {
      setLoading(false);
    }
  }

  const contentWidth = Math.min(620, Math.max(280, viewportWidth - 44));

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.content, Platform.OS === 'web' ? ({ width: 'calc(100vw - 44px)', boxSizing: 'border-box' } as any) : { width: contentWidth }]}>
        <View style={[styles.logo, { backgroundColor: colors.primary }]}><Feather name="layers" size={25} color={colors.primaryForeground} /></View>
        <Text style={[styles.kicker, { color: colors.primary }]}>SHOPFLOW</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{isRegister ? 'Créer votre boutique' : 'Connexion sécurisée'}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, width: '100%' }]}>Les données financières sont isolées par boutique et les actions sensibles sont auditées.</Text>
        <Spacer size={18} />
        <Card>
          {isRegister ? <Field label="Nom complet" placeholder="Ex. Mireille K." value={fullName} onChangeText={setFullName} autoCapitalize="words" /> : null}
          {isRegister ? <Field label="Nom de la boutique" placeholder="Ex. Boutique centrale" value={shopName} onChangeText={setShopName} autoCapitalize="words" /> : null}
          <Field label="Adresse e-mail" placeholder="vous@exemple.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Field
            label="Mot de passe"
            placeholder="10 caractères minimum"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            rightAccessory={(
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                hitSlop={10}
                onPress={() => setShowPassword((visible) => !visible)}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={19} color={colors.mutedForeground} />
              </Pressable>
            )}
          />
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <Button title={isRegister ? 'Créer et continuer' : 'Se connecter'} icon="arrow-right" onPress={submit} loading={loading} />
        </Card>
        <Pressable onPress={() => setIsRegister((value) => !value)} accessibilityRole="button">
          <Text style={[styles.switch, { color: colors.primary }]}>{isRegister ? 'J’ai déjà un compte' : 'Créer une nouvelle boutique'}</Text>
        </Pressable>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>Le mode hors ligne reste disponible après connexion. Un SMS importé ne devient jamais une confirmation opérateur sans preuve suffisante.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, maxWidth: 620, minWidth: 0, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 10 },
  logo: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  kicker: { fontSize: 12, letterSpacing: 2, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 29, lineHeight: 35, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular', maxWidth: '100%', flexShrink: 1 },
  error: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  switch: { textAlign: 'center', fontSize: 13, fontFamily: 'Inter_600SemiBold', paddingVertical: 10 },
  note: { textAlign: 'center', fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 10 },
});

