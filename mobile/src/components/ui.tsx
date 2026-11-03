import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, isDark, radius } from '../lib/theme';

export { colors };

type IconName = keyof typeof Ionicons.glyphMap;
const haptic = () => { if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

// ---------- layout ----------

export function Screen({ title, subtitle, right, onRefresh, children, scroll = true, fab }: {
  title?: string; subtitle?: string; right?: ReactNode; onRefresh?: () => Promise<unknown>; children: ReactNode; scroll?: boolean; fab?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  }, [onRefresh]);

  const header = title ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        {subtitle ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>{subtitle}</Text> : null}
        <Text style={{ color: colors.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>{title}</Text>
      </View>
      {right}
    </View>
  ) : null;

  const body = <View style={{ gap: 14 }}>{header}{children}</View>;
  if (!scroll) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: insets.top + 12 }}>{body}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: (title ? insets.top : 0) + 14, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.card} /> : undefined}
    >
      {body}
    </ScrollView>
    {fab}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const base: ViewStyle = { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.line };
  if (onPress) return <Pressable onPress={() => { haptic(); onPress(); }} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={[base, style]}>{children}</View>;
}

/** The one gradient card on a screen: the number the screen is about. */
export function Hero({ label, value, caption, right }: { label: string; value: string | number; caption?: string; right?: ReactNode }) {
  return (
    <LinearGradient colors={[colors.gradA, colors.gradB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: 22 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.gradInk, opacity: 0.7, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
          <Text style={{ color: colors.gradInk, fontSize: 44, fontWeight: '800', letterSpacing: -1.5, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
          {caption ? <Text style={{ color: colors.gradInk, opacity: 0.75, fontSize: 13, fontWeight: '600', marginTop: 2 }}>{caption}</Text> : null}
        </View>
        {right}
      </View>
    </LinearGradient>
  );
}

export function Section({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }}>{title}</Text>
      {action}
    </View>
  );
}

export const H = ({ children }: { children: ReactNode }) => (
  <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginBottom: 8, letterSpacing: -0.2 }}>{children}</Text>
);
export const Muted = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text style={[{ color: colors.muted, fontSize: 13, lineHeight: 18 }, style]}>{children}</Text>
);
export const Body = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text style={[{ color: colors.ink, fontSize: 15, lineHeight: 21 }, style]}>{children}</Text>
);

export function Divider() { return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />; }

// ---------- data display ----------

type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';
const toneColors = (tone: Tone) => ({
  success: [colors.success, colors.successSoft], warn: [colors.warn, colors.warnSoft], danger: [colors.danger, colors.dangerSoft],
  info: [colors.info, colors.infoSoft], accent: [colors.link, colors.accentSoft], neutral: [colors.muted, colors.surface2],
}[tone]);

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const [fg, bg] = toneColors(tone);
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>{label}</Text>
    </View>
  );
}

export function Stat({ label, value, tone, hint, onPress, style }: { label: string; value: string | number; tone?: Tone; hint?: string; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const fg = tone ? toneColors(tone)[0] : colors.ink;
  return (
    <Card onPress={onPress} style={[{ flexGrow: 1, flexBasis: '45%', padding: 14, gap: 4 }, style]}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: fg, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {hint ? <Text style={{ color: colors.faint, fontSize: 12 }} numberOfLines={1}>{hint}</Text> : null}
    </Card>
  );
}
export const StatGrid = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;

export function Row({ icon, title, subtitle, right, onPress, tone, last }: {
  icon?: IconName; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; tone?: Tone; last?: boolean;
}) {
  const [fg, bg] = toneColors(tone ?? 'neutral');
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      {icon ? (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: tone ? bg : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={19} color={tone ? fg : colors.muted} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 1 }} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null)}
    </View>
  );
  return onPress ? <Pressable onPress={() => { haptic(); onPress(); }} style={({ pressed }) => pressed && { opacity: 0.6 }}>{inner}</Pressable> : inner;
}

export function Initials({ name, size = 44 }: { name: string; size?: number }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.link, fontWeight: '800', fontSize: size * 0.38 }}>{letters}</Text>
    </View>
  );
}

export function EmptyState({ icon = 'sparkles-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={26} color={colors.muted} />
      </View>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      {text ? <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function Banner({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const [fg, bg] = toneColors(tone);
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: 12 }}>
      <Text style={{ color: fg, fontSize: 13, lineHeight: 18, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  return children ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>{children}</Text> : null;
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, minHeight: 200 }}><ActivityIndicator size="large" color={colors.accent} /></View>;
}

/** Vertical bars drawn with plain Views (no chart library). */
export function BarChart({ data, height = 120, color = colors.accent, format }: { data: { label: string; value: number }[]; height?: number; color?: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: height + 34 }}>
      {data.map((d) => (
        <View key={d.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{d.value ? (format ? format(d.value) : d.value) : ''}</Text>
          <View style={{ width: '100%', height: Math.max(3, (d.value / max) * height), borderRadius: 8, backgroundColor: d.value ? color : colors.surface2 }} />
          <Text style={{ color: colors.faint, fontSize: 10 }} numberOfLines={1}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------- actions ----------

export function Button({ title, onPress, busy, kind = 'primary', disabled, icon, small }: {
  title: string; onPress: () => void; busy?: boolean; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; icon?: IconName; small?: boolean;
}) {
  const off = busy || disabled;
  const fg = kind === 'primary' ? colors.accentInk : kind === 'danger' ? colors.danger : colors.ink;
  const bg = kind === 'primary' ? colors.accent : kind === 'danger' ? colors.dangerSoft : kind === 'secondary' ? colors.surface2 : 'transparent';
  return (
    <Pressable
      onPress={() => { haptic(); onPress(); }}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [{
        height: small ? 40 : 52, borderRadius: small ? 12 : radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
        paddingHorizontal: 18, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: colors.lineStrong, opacity: off ? 0.5 : pressed ? 0.85 : 1,
      }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : (<>
        {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
        <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16, letterSpacing: -0.1 }}>{title}</Text>
      </>)}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={() => { haptic(); onPress(); }} accessibilityLabel={label} accessibilityRole="button"
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={20} color={colors.ink} />
    </Pressable>
  );
}

/** Extended floating button, bottom-right. */
export function Fab({ title, icon = 'add', onPress }: { title: string; icon?: IconName; onPress: () => void }) {
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 20, bottom: 24 }}>
      <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="button" style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 8, height: 54, paddingHorizontal: 20, borderRadius: 27, backgroundColor: colors.accent,
        opacity: pressed ? 0.9 : 1, shadowColor: '#000', shadowOpacity: isDark() ? 0.5 : 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
      })}>
        <Ionicons name={icon} size={22} color={colors.accentInk} />
        <Text style={{ color: colors.accentInk, fontWeight: '800', fontSize: 15 }}>{title}</Text>
      </Pressable>
    </View>
  );
}

// ---------- forms ----------

export function Field({ label, error, hint, ...props }: { label: string; error?: string | null; hint?: string } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.faint}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={[{
          backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.ink,
          borderWidth: 1.5, borderColor: error ? colors.danger : focused ? colors.accent : 'transparent',
        }, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, props.style]}
        {...props}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text> : hint ? <Text style={{ color: colors.faint, fontSize: 12, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

/** A short list of mutually exclusive options shown as chips. */
export function Choice<T extends string>({ label, value, options, onChange }: {
  label?: string; value: T | null; options: readonly { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <Pressable key={o.value} onPress={() => { haptic(); onChange(o.value); }} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ selected: on }}
              style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: on ? colors.accent : colors.surface2, borderWidth: 1, borderColor: on ? colors.accent : colors.line }}>
              <Text style={{ color: on ? colors.accentInk : colors.ink, fontWeight: on ? '800' : '600', fontSize: 14 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '82%', paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderColor: colors.line }}>
        <View style={{ alignItems: 'center', paddingTop: 10 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong }} /></View>
        {title ? <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }}>{title}</Text> : null}
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export type Option<T extends string = string> = { value: T; label: string; hint?: string };

/** A dropdown that opens a searchable bottom sheet: for members, plans, trainers, branches. */
export function Select<T extends string = string>({ label, value, options, onChange, placeholder = 'Select', searchable, clearLabel }: {
  label: string; value: T | ''; options: Option<T>[]; onChange: (v: T | '') => void; placeholder?: string; searchable?: boolean; clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const chosen = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !s || o.label.toLowerCase().includes(s) || (o.hint ?? '').toLowerCase().includes(s)).slice(0, 80);
  }, [options, q]);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>{label}</Text>
      <Pressable onPress={() => { setQ(''); setOpen(true); }} accessibilityRole="button" accessibilityLabel={`${label}: ${chosen ? chosen.label : 'nothing selected'}`}
        style={{ backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: chosen ? colors.ink : colors.faint, fontSize: 16, flexShrink: 1 }} numberOfLines={1}>{chosen ? chosen.label : placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {searchable || options.length > 8 ? <Field label="Search" value={q} onChangeText={setQ} autoCapitalize="none" placeholder="Type to filter" /> : null}
        {clearLabel ? <Row title={clearLabel} onPress={() => { onChange(''); setOpen(false); }} right={value === '' ? <Ionicons name="checkmark" size={20} color={colors.link} /> : <View />} /> : null}
        {shown.map((o, i) => (
          <Row key={o.value} title={o.label} subtitle={o.hint} last={i === shown.length - 1}
            onPress={() => { onChange(o.value); setOpen(false); }}
            right={o.value === value ? <Ionicons name="checkmark" size={20} color={colors.link} /> : <View />} />
        ))}
        {shown.length === 0 ? <Muted>Nothing matches.</Muted> : null}
      </Sheet>
    </View>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.surface2 }} thumbColor={value ? colors.accentInk : colors.muted} />
    </View>
  );
}

export const styles = StyleSheet.create({ flex1: { flex: 1 } });

// ---------- loading and failure states ----------

/** A pulsing placeholder block. Shows the shape of what is coming instead of a bare spinner. */
export function Skeleton({ height = 16, width = '100%', radius: r = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, width, borderRadius: r, backgroundColor: colors.surface2, opacity: pulse }, style]} />;
}

/** Placeholder for a list of rows while the first load is in flight. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card style={{ gap: 18, paddingVertical: 18 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton width={38} height={38} radius={12} />
          <View style={{ flex: 1, gap: 8 }}><Skeleton width="55%" height={14} /><Skeleton width="80%" height={11} /></View>
          <Skeleton width={56} height={22} radius={11} />
        </View>
      ))}
    </Card>
  );
}

/** A load failure with a way out: says what happened and offers a retry. */
export function LoadError({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <Card style={{ borderColor: colors.danger, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Ionicons name="cloud-offline" size={22} color={colors.danger} />
        <Text accessibilityRole="alert" style={{ color: colors.ink, fontSize: 14, flex: 1, lineHeight: 20 }}>{message}</Text>
      </View>
      {onRetry ? <Button title="Try again" kind="secondary" small icon="refresh" onPress={onRetry} /> : null}
    </Card>
  );
}

/** What a dashboard looks like before its numbers arrive. */
export function HomeSkeleton() {
  return (
    <View style={{ gap: 14 }}>
      <Skeleton height={150} radius={28} />
      <View style={{ flexDirection: 'row', gap: 10 }}><Skeleton height={86} radius={20} style={{ flex: 1 }} width="48%" /><Skeleton height={86} radius={20} style={{ flex: 1 }} width="48%" /></View>
      <Skeleton width="40%" height={20} />
      <ListSkeleton rows={4} />
    </View>
  );
}
