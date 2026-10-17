import React, { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Check, ChevronRight, Plus, X, type LucideIcon } from 'lucide-react-native';
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { font, useTheme } from '../theme/ThemeProvider';

export function Txt({ children, size = 14, color, weight = 'regular', style, ...rest }: React.ComponentProps<typeof Text> & { size?: number; color?: string; weight?: keyof typeof font }) {
  const t = useTheme();
  return <Text {...rest} style={[{ fontFamily: font[weight], fontSize: size, color: color ?? t.ink, lineHeight: size * 1.5 }, style]}>{children}</Text>;
}
export function Row({ children, style, ...rest }: React.ComponentProps<typeof View>) {
  return <View {...rest} style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}
export function Card({ children, style, ...rest }: React.ComponentProps<typeof View>) {
  const t = useTheme();
  return <View {...rest} style={[{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, padding: 24 }, style]}>{children}</View>;
}
export function Entrance({ children, delay = 0, style }: React.PropsWithChildren<{ delay?: number; style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion();
  return <Animated.View entering={reduced ? undefined : FadeInDown.duration(450).delay(delay).springify().damping(22)} style={style}>{children}</Animated.View>;
}
export function Button({ title, onPress, icon: Icon, variant = 'primary', small, disabled, style, loading }: { title: string; onPress: () => void; icon?: LucideIcon; variant?: 'primary' | 'secondary' | 'ghost' | 'white' | 'danger'; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; loading?: boolean }) {
  const t = useTheme();
  const background = variant === 'primary' ? t.accent : variant === 'white' ? '#FFFFFF' : variant === 'danger' ? t.redSoft : variant === 'secondary' ? t.surface : 'transparent';
  const color = variant === 'primary' ? '#FFFFFF' : variant === 'white' ? '#292D42' : variant === 'danger' ? t.red : t.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || loading} onPress={onPress} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{ minHeight: small ? 36 : 46, borderRadius: 10, paddingHorizontal: small ? 12 : 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: background, borderWidth: variant === 'secondary' ? 1 : 0, borderColor: t.border, opacity: disabled ? 0.4 : pressed ? 0.75 : hovered ? 0.88 : 1 }, style]}>
    {loading ? <ActivityIndicator size="small" color={color} /> : Icon && <Icon size={small ? 15 : 17} color={color} strokeWidth={1.8} />}
    <Txt weight="semibold" color={color} size={small ? 12 : 13}>{title}</Txt>
  </Pressable>;
}
export function IconButton({ icon: Icon, onPress, label, color, style }: { icon: LucideIcon; onPress: () => void; label: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed || hovered ? t.surfaceAlt : 'transparent' }, style]}><Icon color={color ?? t.secondary} size={18} strokeWidth={1.6} /></Pressable>;
}
export function Tag({ children, tone = 'purple', dot = false }: React.PropsWithChildren<{ tone?: 'purple' | 'green' | 'gray' | 'red'; dot?: boolean }>) {
  const t = useTheme();
  const color = tone === 'purple' ? t.accent : tone === 'green' ? t.green : tone === 'red' ? t.red : t.secondary;
  return <Row style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, backgroundColor: tone === 'purple' ? t.accentSoft : tone === 'green' ? t.greenSoft : tone === 'red' ? t.redSoft : t.surfaceAlt, gap: 5 }}>{dot && <View style={{ width: 5, height: 5, backgroundColor: color, borderRadius: 3 }} />}<Txt size={10} weight="medium" color={color}>{children}</Txt></Row>;
}
export function SectionTitle({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return <Row style={{ justifyContent: 'space-between', gap: 12, marginBottom: 20 }}><View style={{ flex: 1 }}><Txt size={16} weight="bold">{title}</Txt>{subtitle && <Txt color={t.muted} size={12} style={{ marginTop: 3 }}>{subtitle}</Txt>}</View>{action && <Pressable onPress={onAction} accessibilityRole="button" style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 5 }}><Txt size={12} color={t.secondary} weight="medium">{action}</Txt><ChevronRight size={14} color={t.muted} /></Pressable>}</Row>;
}
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (value: T) => void }) {
  const t = useTheme();
  return <Row style={{ backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.border, padding: 3, borderRadius: 9, gap: 2 }}>{options.map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: value === option }} onPress={() => onChange(option)} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ paddingVertical: 6, paddingHorizontal: 13, borderRadius: 6, backgroundColor: value === option ? t.surface : hovered ? t.border : 'transparent', boxShadow: value === option ? '0 1px 4px #00000009' : undefined })}><Txt size={11} weight={value === option ? 'semibold' : 'regular'} color={value === option ? t.ink : t.muted}>{option}</Txt></Pressable>)}</Row>;
}
export function AppIcon({ id, size = 40 }: { id: string; size?: number }) {
  const color = id === 'youtube' ? '#E75960' : id === 'instagram' ? '#C16F9A' : id === 'facebook' ? '#5F87CF' : '#343A4A';
  const background = id === 'youtube' ? '#FFF0F1' : id === 'instagram' ? '#F9EDF5' : id === 'facebook' ? '#EEF3FF' : '#EEF0F4';
  return <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}><Svg width={size*0.52} height={size*0.52} viewBox="0 0 24 24">{id==='youtube'?<><Path d="M21 7.3c-.2-1.3-1-2.2-2.3-2.4a48 48 0 0 0-13.4 0C4 5.1 3.2 6 3 7.3a28 28 0 0 0 0 9.4c.2 1.3 1 2.2 2.3 2.4a48 48 0 0 0 13.4 0c1.3-.2 2.1-1.1 2.3-2.4a28 28 0 0 0 0-9.4Z" fill={color}/><Path d="m10 8.5 5 3.5-5 3.5Z" fill="#fff"/></>:id==='instagram'?<><Path d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Z" fill="none" stroke={color} strokeWidth="1.8"/><Circle cx="12" cy="12" r="4" fill="none" stroke={color} strokeWidth="1.8"/><Circle cx="17.3" cy="6.8" r="1" fill={color}/></>:id==='facebook'?<Path d="M14.5 22V13h3l.5-3.5h-3.5V7.3c0-1 .4-1.7 1.8-1.7H18V2.5a23 23 0 0 0-2.5-.2c-2.5 0-4.5 1.6-4.5 4.6v2.6H8V13h3v9Z" fill={color}/>:<Path d="M14 3h3c.3 2.5 1.8 4 4 4.3v3a9 9 0 0 1-4-1.3v7.2a6 6 0 1 1-5.2-6V13a3 3 0 1 0 2.2 2.8Z" fill={color}/>}</Svg></View>;
}
export function OrbitMark({ size = 36, light = false }: { size?: number; light?: boolean }) {
  const t = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 40 40"><Ellipse cx="20" cy="20" rx="17" ry="10" rotation="-45" origin="20,20" fill="none" stroke={light ? '#CAC0F3' : t.accent} strokeWidth="2.8" /><Circle cx="20" cy="20" r="5.8" fill={light ? '#CAC0F3' : t.accent}/><Circle cx="31.5" cy="8.5" r="3.6" fill={light ? '#F3F1FF' : t.ink}/></Svg>;
}
export function OrbitArt({ size = 180 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 200 200"><G origin="100,100" rotation="-25">{[0,30,60,90,120,150].map(angle => <Ellipse key={angle} cx="100" cy="100" rx="77" ry="26" rotation={angle} origin="100,100" stroke="#C6B9F1" strokeWidth="0.8" fill="none" opacity={0.6}/>)}</G><Circle cx="100" cy="100" r="24" fill="#C5B8ED"/><Circle cx="100" cy="100" r="17" fill="#D6CDF4"/><Circle cx="160" cy="62" r="5" fill="#E6DFF9"/><Path d="M35 35v10M30 40h10M165 145v8M161 149h8" stroke="#BEB3DF" strokeWidth="1"/></Svg>;
}
export function ProgressRing({ value, size = 176, children }: React.PropsWithChildren<{ value: number; size?: number }>) {
  const t = useTheme();
  const radius = 73; const circumference = 2 * Math.PI * radius;
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}><Svg width={size} height={size} viewBox="0 0 180 180" style={StyleSheet.absoluteFill}><Circle cx="90" cy="90" r={radius} stroke={t.track} strokeWidth="13" fill="none"/>
    <Circle cx="90" cy="90" r={radius} stroke={t.accent} strokeWidth="13" strokeLinecap="round" strokeDasharray={`${circumference * Math.min(Math.max(value,0),1)} ${circumference}`} fill="none" rotation="-90" origin="90,90"/>
    {Array.from({length: 40},(_,i) => { const angle=i*Math.PI/20; return <Line key={i} x1={90+Math.sin(angle)*56} y1={90-Math.cos(angle)*56} x2={90+Math.sin(angle)*59} y2={90-Math.cos(angle)*59} stroke={t.border} strokeWidth="1"/>; })}</Svg>{children}</View>;
}
export function Field({ label, value, onChangeText, placeholder, numeric, hint, style }: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; numeric?: boolean; hint?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ gap: 7 }, style]}><Txt size={12} weight="semibold">{label}</Txt><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'numeric' : 'default'} placeholder={placeholder} placeholderTextColor={t.muted} style={{ height: 46, backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.border, paddingHorizontal: 14, borderRadius: 10, color: t.ink, fontFamily: font.regular, fontSize: 14 }} />{hint && <Txt size={11} color={t.muted}>{hint}</Txt>}</View>;
}
export function Sheet({ visible, onClose, title, subtitle, children }: React.PropsWithChildren<{ visible: boolean; onClose: () => void; title: string; subtitle?: string }>) {
  const t = useTheme(); const { width } = useWindowDimensions();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={{ flex: 1, justifyContent: width < 650 ? 'flex-end' : 'center', alignItems: 'center', padding: width < 650 ? 0 : 24 }}><Pressable accessibilityLabel="Close dialog" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: '#11152680' }]} /><View accessibilityViewIsModal role="dialog" style={{ width: '100%', maxWidth: 490, maxHeight: '90%', backgroundColor: t.surface, borderRadius: 24, padding: 28, boxShadow: '0 24px 100px #11152625' }}><Row style={{ justifyContent: 'space-between', marginBottom: 5 }}><Txt size={23} weight="bold">{title}</Txt><IconButton icon={X} label="Close dialog" onPress={onClose}/></Row>{subtitle && <Txt size={13} color={t.secondary} style={{ marginBottom: 24 }}>{subtitle}</Txt>}<ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 20, paddingBottom: 3 }}>{children}</ScrollView></View></View></Modal>;
}
export function EmptyState({ title, description, icon: Icon = Plus, action, onAction }: { title: string; description: string; icon?: LucideIcon; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return <View style={{ paddingVertical: 36, paddingHorizontal: 16, alignItems: 'center', gap: 10 }}><View style={{ width: 48, height: 48, backgroundColor: t.accentSoft, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}><Icon size={23} color={t.accent}/></View><Txt size={16} weight="semibold">{title}</Txt><Txt size={12} color={t.muted} style={{ textAlign: 'center', maxWidth: 320 }}>{description}</Txt>{action && onAction && <Button title={action} onPress={onAction} variant="secondary" small style={{ marginTop: 6 }}/>}</View>;
}
export function Selection({ selected, onPress, children }: React.PropsWithChildren<{ selected: boolean; onPress: () => void }>) {
  const t = useTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 12, borderWidth: 1, borderColor: selected ? t.accent : t.border, gap: 12, backgroundColor: selected ? t.accentSoft : t.surface }}>{children}<View style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: 6, borderWidth: selected ? 0 : 1, borderColor: t.border, backgroundColor: selected ? t.accent : t.surface, alignItems: 'center', justifyContent: 'center' }}>{selected && <Check size={14} color="#fff"/>}</View></Pressable>;
}
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  const t = useTheme();
  useEffect(() => { if (!message) return; AccessibilityInfo.announceForAccessibility(message); const id=setTimeout(onClose,6500); return ()=>clearTimeout(id); }, [message,onClose]);
  if (!message) return null;
  return <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 88, left: 20, right: 20, alignItems: 'center', zIndex: 100 }}><Row accessibilityLiveRegion="polite" style={{ backgroundColor: t.ink, borderRadius: 13, paddingLeft: 18, paddingRight: 7, paddingVertical: 9, maxWidth: 560, gap: 12, boxShadow: '0 5px 30px #00000022' }}><Txt color={t.surface} size={12} style={{ flexShrink: 1 }}>{message}</Txt><IconButton icon={X} label="Dismiss message" onPress={onClose} color={t.surface}/></Row></View>;
}
export function Page({ children }: React.PropsWithChildren) {
  const t=useTheme(); const {width}=useWindowDimensions();
  return <ScrollView style={{ flex: 1, backgroundColor:t.background }} contentContainerStyle={{ padding: width < 700 ? 20 : 36, paddingTop: width < 700 ? 24 : 31, paddingBottom: 36, maxWidth: 1450, width: '100%', alignSelf: 'center', gap: 24 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>;
}
export function PageHeading({ eyebrow, title, subtitle, children }: React.PropsWithChildren<{ eyebrow?: string; title: string; subtitle: string }>) {
  const t = useTheme(); const {width}=useWindowDimensions();
  return <Row style={{ justifyContent:'space-between', flexWrap:'wrap', gap:18, marginBottom:4 }}><View style={{ gap: 5 }}>{eyebrow && <Txt size={10} weight="semibold" color={t.muted} style={{ letterSpacing: 1.6, marginBottom: 4 }}>{eyebrow}</Txt>}<Txt size={width < 700 ? 27 : 32} weight="display" style={{ letterSpacing:-1.2, lineHeight: width < 700 ? 36 : 43 }}>{title}</Txt><Txt size={13} color={t.muted}>{subtitle}</Txt></View>{children}</Row>;
}
