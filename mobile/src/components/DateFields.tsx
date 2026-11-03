import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Button, Field, Sheet } from './ui';
import { fmtDate } from '../lib/format';
import { colors, isDark, radius } from '../lib/theme';
import { dateInput, parseLocal } from '../lib/time';

// Pickers instead of typing "2026-11-05". Values stay plain strings ('YYYY-MM-DD' and
// 'HH:MM', 24h) so every form and API call is unchanged. On the web preview there is no
// native picker, so they fall back to a text box with the same format.

const pad = (n: number) => String(n).padStart(2, '0');
const timeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const label12 = (hhmm: string) => {
  const d = parseLocal('2000-01-01', hhmm);
  return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : hhmm;
};

function Trigger({ label, text, placeholder, icon, error, hint, onPress, onClear }: {
  label: string; text: string; placeholder: string; icon: 'calendar-outline' | 'time-outline'; error?: string | null; hint?: string; onPress: () => void; onClear?: () => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>{label}</Text>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${text || 'not set'}`}
        style={{ backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 14, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: error ? colors.danger : 'transparent' }}>
        <Ionicons name={icon} size={20} color={colors.muted} />
        <Text style={{ flex: 1, color: text ? colors.ink : colors.faint, fontSize: 16 }}>{text || placeholder}</Text>
        {onClear && text ? (
          <Pressable onPress={onClear} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable>
        ) : null}
      </Pressable>
      {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text> : hint ? <Text style={{ color: colors.faint, fontSize: 12, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

export function DateField({ label, value, onChange, minimumDate, maximumDate, error, hint, clearable }: {
  label: string; value: string; onChange: (v: string) => void; minimumDate?: Date; maximumDate?: Date; error?: string | null; hint?: string; clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return <Field label={`${label} (YYYY-MM-DD)`} value={value} onChangeText={onChange} keyboardType="numbers-and-punctuation" placeholder="2026-11-05" error={error} hint={hint} />;
  }
  const current = (value && parseLocal(value, '12:00')) || new Date();
  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current, mode: 'date', minimumDate, maximumDate, onChange: (e, d) => { if (e.type === 'set' && d) onChange(dateInput(d)); } });
    } else {
      setOpen(true);
    }
  };
  return (
    <>
      <Trigger label={label} text={value ? fmtDate(current) : ''} placeholder="Choose a date" icon="calendar-outline" error={error} hint={hint} onPress={show} onClear={clearable ? () => onChange('') : undefined} />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <DateTimePicker value={current} mode="date" display="inline" minimumDate={minimumDate} maximumDate={maximumDate} themeVariant={isDark() ? 'dark' : 'light'}
          onChange={(_e, d) => { if (d) onChange(dateInput(d)); }} />
        <View style={{ height: 12 }} />
        <Button title="Done" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

export function TimeField({ label, value, onChange, error, hint }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: string }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return <Field label={`${label} (24h)`} value={value} onChangeText={onChange} keyboardType="numbers-and-punctuation" placeholder="18:30" error={error} hint={hint} />;
  }
  const current = (value && parseLocal('2000-01-01', value)) || new Date();
  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current, mode: 'time', is24Hour: false, onChange: (e, d) => { if (e.type === 'set' && d) onChange(timeInput(d)); } });
    } else {
      setOpen(true);
    }
  };
  return (
    <>
      <Trigger label={label} text={value ? label12(value) : ''} placeholder="Choose a time" icon="time-outline" error={error} hint={hint} onPress={show} />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <DateTimePicker value={current} mode="time" display="spinner" themeVariant={isDark() ? 'dark' : 'light'} onChange={(_e, d) => { if (d) onChange(timeInput(d)); }} />
        <View style={{ height: 12 }} />
        <Button title="Done" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
