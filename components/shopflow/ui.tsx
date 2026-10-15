import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export function Screen({
  title,
  subtitle,
  children,
  back = false,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
  right?: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.fixedHeader,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === 'web' ? 10 : insets.top + (back ? 8 : 10),
          },
        ]}
      >
        <View style={styles.topRow}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retour"
              onPress={() => router.back()}
              style={styles.backButton}
              testID="back-button"
            >
              <Feather name="arrow-left" size={21} color={colors.foreground} />
            </Pressable>
          ) : (
            <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
              <Feather name="layers" size={18} color={colors.primaryForeground} />
            </View>
          )}
          <View style={styles.heading}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      </View>
      <KeyboardAwareScrollViewCompat
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 4,
            paddingBottom: Platform.OS === 'web' ? 118 : Math.max(insets.bottom, 18) + 78,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const colors = useColors();
  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [cardStyle, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button">
          <Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Body({ children, muted = false, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  const colors = useColors();
  return <Text style={[styles.body, { color: muted ? colors.mutedForeground : colors.foreground }, style]}>{children}</Text>;
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const colors = useColors();
  return <Text style={[styles.label, { color: colors.inkSoft }, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  icon?: React.ComponentProps<typeof Feather>['name'];
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const background =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.destructive : variant === 'secondary' ? colors.secondary : colors.card;
  const foreground =
    variant === 'primary' || variant === 'danger' ? colors.primaryForeground : variant === 'secondary' ? colors.secondaryForeground : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'outline' ? colors.border : background,
          opacity: disabled ? 0.48 : pressed ? 0.78 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : icon ? <Feather name={icon} size={17} color={foreground} /> : null}
      <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  label: string;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
      <Feather name={icon} size={20} color={colors.foreground} />
    </Pressable>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const colors = useColors();
  const palette = {
    neutral: [colors.muted, colors.mutedForeground],
    success: [colors.accent, colors.primary],
    warning: [colors.warningSurface, colors.warning],
    danger: [colors.dangerSurface, colors.destructive],
    info: [colors.infoSurface, colors.secondaryForeground],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette[0] }]}>
      <Text style={[styles.badgeText, { color: palette[1] }]}>{children}</Text>
    </View>
  );
}

export function Field({
  label,
  error,
  multiline,
  style,
  rightAccessory,
  ...inputProps
}: Omit<TextInputProps, 'style'> & { label: string; error?: string; style?: StyleProp<ViewStyle>; rightAccessory?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          multiline={multiline}
          style={[
            styles.input,
            { backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.input, color: colors.foreground, paddingRight: rightAccessory ? 48 : 13 },
            multiline && styles.multiline,
          ]}
          {...inputProps}
        />
        {rightAccessory ? <View style={styles.inputAccessory}>{rightAccessory}</View> : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.primaryForeground : colors.inkSoft }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Spacer({ size = 14 }: { size?: number }) {
  return <View style={{ height: size }} />;
}

export function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

export function EmptyState({ title, detail, icon = 'inbox' }: { title: string; detail: string; icon?: React.ComponentProps<typeof Feather>['name'] }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Feather name={icon} size={25} color={colors.mutedForeground} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyDetail, { color: colors.mutedForeground }]}>{detail}</Text>
    </View>
  );
}

export const styleSheet = StyleSheet.create({
  amount: { fontSize: 20, lineHeight: 26, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fixedHeader: { paddingHorizontal: 18, paddingBottom: 8, zIndex: 1, elevation: 2 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 15 },
  topRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 2 },
  heading: { flex: 1, minWidth: 0, gap: 2 },
  brandMark: { height: 38, width: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 23, lineHeight: 29, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  card: { minWidth: 0, borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  pressed: { opacity: 0.83, transform: [{ scale: 0.99 }] },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  sectionAction: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  label: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  button: { minHeight: 49, borderRadius: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_600SemiBold' },
  fieldWrap: { minWidth: 0, gap: 7 },
  inputWrap: { position: 'relative', minWidth: 0 },
  inputAccessory: { position: 'absolute', top: 0, right: 8, bottom: 0, justifyContent: 'center' },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  error: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  chip: { minHeight: 36, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  empty: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 25 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emptyDetail: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
