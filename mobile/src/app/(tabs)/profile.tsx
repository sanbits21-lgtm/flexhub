import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Avatar } from '../../components/Avatar';
import { AppearanceCard } from '../../components/AppearanceCard';
import { DeleteAccountCard } from '../../components/DeleteAccountCard';
import { Button, Card, Choice, ErrorText, Field, H, Loading, Muted, Screen } from '../../components/ui';
import { api, type Profile } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';

const GOALS = [
  { value: 'lose_fat', label: 'Lose fat' }, { value: 'build_muscle', label: 'Build muscle' },
  { value: 'stay_fit', label: 'Stay fit' }, { value: 'improve_endurance', label: 'Endurance' },
] as const;
const LEVELS = [{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }] as const;
const DIETS = [{ value: 'veg', label: 'Veg' }, { value: 'eggetarian', label: 'Egg + veg' }, { value: 'non_veg', label: 'Non-veg' }, { value: 'vegan', label: 'Vegan' }] as const;
const GENDERS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_say', label: 'Prefer not to say' }] as const;

type Form = {
  name: string; dob: string; gender: Profile['gender'] | null; weightKg: string; heightCm: string;
  healthNotes: string; fitnessGoal: Profile['fitnessGoal']; experienceLevel: Profile['experienceLevel'];
  dietPreference: Profile['dietPreference']; emergencyName: string; emergencyPhone: string;
};

const toForm = (p: Profile): Form => ({
  name: p.name,
  dob: p.dob ? p.dob.slice(0, 10) : '',
  gender: p.gender ?? null,
  weightKg: p.weightKg ? String(p.weightKg) : '',
  heightCm: p.heightCm ? String(p.heightCm) : '',
  healthNotes: p.healthNotes,
  fitnessGoal: p.fitnessGoal,
  experienceLevel: p.experienceLevel,
  dietPreference: p.dietPreference,
  emergencyName: p.emergencyContact?.name ?? '',
  emergencyPhone: p.emergencyContact?.phone ?? '',
});

const age = (dob: string) => {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
  return years > 0 && years < 110 ? years : null;
};

const say = (title: string, msg: string) => (Platform.OS === 'web' ? window.alert(`${title}\n${msg}`) : Alert.alert(title, msg));

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { data: profile, loading, error, reload, setData } = useLoad(() => api.get<Profile>('/member-app/me'));
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Fill the form once; later refreshes must not wipe edits the member has not saved yet.
  useEffect(() => { if (profile && !form) setForm(toForm(profile)); }, [profile, form]);
  if (loading || !profile || !form) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Empty fields are left out, not sent as '' — the server treats an absent field as "unchanged".
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        healthNotes: form.healthNotes.trim(),
        emergencyContact: { name: form.emergencyName.trim(), phone: form.emergencyPhone.trim() },
      };
      if (form.dob) body.dob = form.dob;
      if (form.gender) body.gender = form.gender;
      if (form.weightKg) body.weightKg = Number(form.weightKg);
      if (form.heightCm) body.heightCm = Number(form.heightCm);
      if (form.fitnessGoal) body.fitnessGoal = form.fitnessGoal;
      if (form.experienceLevel) body.experienceLevel = form.experienceLevel;
      if (form.dietPreference) body.dietPreference = form.dietPreference;
      setData(await api.put<Profile>('/member-app/me', body));
      say('Saved', 'Your profile is updated.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { say('Permission needed', 'Allow photo access in Settings to choose a profile picture.'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    setPhotoBusy(true);
    try {
      // Shrink on the phone: the server accepts 1 MB at most, and a 512 px square is plenty for an avatar.
      const ref = await ImageManipulator.manipulate(picked.assets[0].uri).resize({ width: 512 }).renderAsync();
      const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
      if (!out.base64) throw new Error('Could not read that image.');
      await api.put('/member-app/me/photo', { image: out.base64 });
      setData({ ...profile, hasPhoto: true });
      setPhotoVersion((v) => v + 1);
    } catch (e) {
      say('Photo not saved', e instanceof Error ? e.message : 'Try a different picture.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePassword = async () => {
    setPwBusy(true);
    setPwError(null);
    try {
      await api.put('/member-app/me/password', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '' });
      say('Password changed', 'Use your new password next time you sign in.');
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Could not change password.');
    } finally {
      setPwBusy(false);
    }
  };

  const years = form.dob ? age(form.dob) : null;

  return (
    <Screen title="Profile" subtitle={profile.memberCode} onRefresh={reload}>
      <Card style={{ alignItems: 'center', gap: 10 }}>
        <Avatar memberId={profile._id} hasPhoto={profile.hasPhoto} name={profile.name} version={photoVersion} size={96} />
        <Button title={profile.hasPhoto ? 'Change photo' : 'Add photo'} kind="secondary" small icon="camera" onPress={pickPhoto} busy={photoBusy} />
        <Muted>{profile.email || profile.phone}</Muted>
      </Card>

      <Card>
        <H>About you</H>
        <Field label="Name" value={form.name} onChangeText={(v) => set('name', v)} />
        <Field label={`Date of birth (YYYY-MM-DD)${years ? `  |  ${years} years` : ''}`} value={form.dob} onChangeText={(v) => set('dob', v)} placeholder="1995-04-02" keyboardType="numbers-and-punctuation" />
        <Choice label="Gender" value={form.gender ?? null} options={[...GENDERS]} onChange={(v) => set('gender', v)} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Weight (kg)" value={form.weightKg} onChangeText={(v) => set('weightKg', v)} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Height (cm)" value={form.heightCm} onChangeText={(v) => set('heightCm', v)} keyboardType="decimal-pad" /></View>
        </View>
        <Field label="Health conditions or injuries (optional)" value={form.healthNotes} onChangeText={(v) => set('healthNotes', v)} multiline numberOfLines={3} maxLength={500} placeholder="e.g. knee pain, asthma" />
      </Card>

      <Card>
        <H>Your plan preferences</H>
        <Choice label="Goal" value={form.fitnessGoal} options={[...GOALS]} onChange={(v) => set('fitnessGoal', v)} />
        <Choice label="Experience" value={form.experienceLevel} options={[...LEVELS]} onChange={(v) => set('experienceLevel', v)} />
        <Choice label="Food preference" value={form.dietPreference} options={[...DIETS]} onChange={(v) => set('dietPreference', v)} />
      </Card>

      <Card>
        <H>Emergency contact</H>
        <Field label="Name" value={form.emergencyName} onChangeText={(v) => set('emergencyName', v)} />
        <Field label="Phone" value={form.emergencyPhone} onChangeText={(v) => set('emergencyPhone', v)} keyboardType="phone-pad" />
      </Card>

      <ErrorText>{saveError}</ErrorText>
      <Button title="Save profile" onPress={save} busy={saving} />

      <Card>
        <H>Change password</H>
        <Field label="Current password" value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} secureTextEntry autoCapitalize="none" />
        <Field label="New password (8+ characters)" value={pw.next} onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} secureTextEntry autoCapitalize="none" />
        <ErrorText>{pwError}</ErrorText>
        <Button title="Change password" kind="ghost" onPress={changePassword} busy={pwBusy} disabled={!pw.current || pw.next.length < 8} />
      </Card>

      <AppearanceCard />

      <DeleteAccountCard />

      <Button title="Sign out" kind="ghost" onPress={signOut} />
      <Muted>Your name, phone and email are managed by your gym. Ask the front desk to change them.</Muted>
    </Screen>
  );
}
