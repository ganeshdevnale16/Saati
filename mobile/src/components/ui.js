import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { C, R } from '../theme';
import { COMPANY } from '../config';

export function Button({ title, onPress, tone = 'teal', variant = 'solid', loading, disabled, style }) {
  const color = C[tone] || C.teal;
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: solid ? color : 'transparent', borderColor: color, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
      accessibilityRole="button">
      {loading ? <ActivityIndicator color={solid ? '#fff' : color} /> : <Text style={[s.btnText, { color: solid ? '#fff' : color }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#98A0AE" style={s.input} {...props} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Chips({ options, value, onChange, tone = 'teal' }) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)}
            style={[s.chip, on && { backgroundColor: C[tone], borderColor: C[tone] }]}>
            <Text style={[s.chipText, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const DURATIONS = [
  { value: '1h', label: '1 hour' }, { value: '1d', label: '1 day' }, { value: '1w', label: '1 week' },
  { value: '1m', label: '1 month' }, { value: 'custom', label: 'Custom' }, { value: 'until_cancel', label: 'Until I stop' },
];

export function DurationPicker({ value, onChange, customHours, onCustomHours, tone }) {
  return (
    <View>
      <Chips options={DURATIONS} value={value} onChange={onChange} tone={tone} />
      {value === 'custom' && (
        <Field label="How many hours?" keyboardType="decimal-pad" value={customHours} onChangeText={onCustomHours} placeholder="e.g. 3 or 0.5" />
      )}
    </View>
  );
}

export const durationBody = (d, h) => ({ duration: d, durationMinutes: d === 'custom' ? Math.round(Number(h) * 60) : undefined });

export function Card({ children, style }) { return <View style={[s.card, style]}>{children}</View>; }

export function Footer() {
  return <Text style={s.footer}>Saathi is developed by {COMPANY}</Text>;
}

export const timeLeft = (exp) => {
  if (!exp) return 'until stopped';
  const m = Math.max(0, Math.round((new Date(exp) - Date.now()) / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h left`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m left`;
  return `${m} min left`;
};
export const ago = (t) => {
  if (!t) return 'no location yet';
  const m = Math.round((Date.now() - new Date(t)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleString();
};

const s = StyleSheet.create({
  btn: { borderWidth: 1.5, borderRadius: R.md, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: C.slate, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink },
  hint: { fontSize: 12, color: C.slate, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: C.ink, fontWeight: '600' },
  card: { backgroundColor: C.card, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: C.line, marginBottom: 12 },
  footer: { textAlign: 'center', color: C.slate, fontSize: 12, paddingVertical: 18 },
});
