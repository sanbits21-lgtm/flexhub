import { useEffect, useRef, useState } from 'react';
import { memberApi, errorText, setMemberToken } from '../api';
import { useMemberAuth } from '../MemberAuth';
import { useLoad } from '../useLoad';
import { useTheme } from '../../context/ThemeContext';
import Avatar from '../Avatar';
import { Btn, Card, Choice, ErrorText, Field, LoadState, Loading, Muted, Screen } from '../ui';
import { inputDate } from '../format';

const GOALS = [{ value: 'lose_fat', label: 'Lose fat' }, { value: 'build_muscle', label: 'Build muscle' }, { value: 'stay_fit', label: 'Stay fit' }, { value: 'improve_endurance', label: 'Endurance' }];
const LEVELS = [{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }];
const DIETS = [{ value: 'veg', label: 'Veg' }, { value: 'eggetarian', label: 'Egg + veg' }, { value: 'non_veg', label: 'Non-veg' }, { value: 'vegan', label: 'Vegan' }];
const GENDERS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_say', label: 'Prefer not to say' }];
const THEMES = [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Match my phone' }];

const toForm = (p) => ({
  name: p.name,
  dob: inputDate(p.dob),
  gender: p.gender ?? null,
  weightKg: p.weightKg ? String(p.weightKg) : '',
  heightCm: p.heightCm ? String(p.heightCm) : '',
  healthNotes: p.healthNotes || '',
  fitnessGoal: p.fitnessGoal ?? null,
  experienceLevel: p.experienceLevel ?? null,
  dietPreference: p.dietPreference ?? null,
  emergencyName: p.emergencyContact?.name ?? '',
  emergencyPhone: p.emergencyContact?.phone ?? '',
});

const ageOf = (dob) => {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
  return years > 0 && years < 110 ? years : null;
};

// The server accepts 1 MB at most, and a 512 px square is plenty for an avatar: centre-crop and
// shrink on the phone before sending.
const squareJpegBase64 = (file, size = 512) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const side = Math.min(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    URL.revokeObjectURL(url);
    resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
  img.src = url;
});

export default function Profile() {
  const { signOut, updateName } = useMemberAuth();
  const { mode, setMode } = useTheme();
  const { data: profile, loading, error, stale, reload, setData } = useLoad('profile', () => memberApi.get('/member-app/me').then((r) => r.data));
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState({ ok: false, text: '' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoVersion, setPhotoVersion] = useState(0);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState({ ok: false, text: '' });
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState('');
  const fileRef = useRef(null);

  // Fill the form once; a later refresh must not wipe edits that are not saved yet.
  useEffect(() => { if (profile && !form) setForm(toForm(profile)); }, [profile, form]);

  if (loading || (!profile && !error)) return <Loading />;
  if (!profile || !form) return <Screen title="Profile"><LoadState error={error} onRetry={reload} /></Screen>;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setSaveMsg({ ok: false, text: '' });
    try {
      // Empty fields are left out, not sent as '': the server reads an absent field as "unchanged".
      const body = {
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
      const { data } = await memberApi.put('/member-app/me', body);
      setData(data);
      updateName(data.name);
      setSaveMsg({ ok: true, text: 'Saved. Your profile is updated.' });
    } catch (err) {
      setSaveMsg({ ok: false, text: errorText(err, 'Could not save.') });
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      await memberApi.put('/member-app/me/photo', { image: await squareJpegBase64(file) });
      setData((p) => ({ ...p, hasPhoto: true }));
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      setPhotoError(errorText(err, 'Photo not saved. Try a different picture.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePassword = async () => {
    setPwBusy(true);
    setPwMsg({ ok: false, text: '' });
    try {
      const { data } = await memberApi.put('/member-app/me/password', { currentPassword: pw.current, newPassword: pw.next });
      if (data?.token) setMemberToken(data.token); // other devices are signed out; this one stays in
      setPw({ current: '', next: '' });
      setPwMsg({ ok: true, text: 'Password changed. Use it next time you sign in.' });
    } catch (err) {
      setPwMsg({ ok: false, text: errorText(err, 'Could not change password.') });
    } finally {
      setPwBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Delete your account?\n\nYour profile, photo, health details and saved plans are erased and cannot be recovered.')) return;
    setDelBusy(true);
    setDelError('');
    try {
      await memberApi.delete('/member-app/me', { data: { password: delPw } });
      signOut();
    } catch (err) {
      setDelError(errorText(err, 'Could not delete your account.'));
      setDelBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    if (!window.confirm('Sign out of every phone and browser where you are signed in?')) return;
    try { await memberApi.post('/member-auth/logout-all'); } catch { /* sign out here regardless */ }
    signOut();
  };

  const years = form.dob ? ageOf(form.dob) : null;

  return (
    <Screen title="Profile" subtitle={profile.memberCode}>
      <LoadState error={error} stale={stale} onRetry={reload} />

      <Card className="flex flex-col items-center gap-3">
        <Avatar memberId={profile._id} hasPhoto={profile.hasPhoto} name={profile.name} size={96} version={photoVersion} />
        <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="sr-only" aria-label="Choose a profile photo" />
        <Btn kind="secondary" small busy={photoBusy} onClick={() => fileRef.current?.click()}>{profile.hasPhoto ? 'Change photo' : 'Add photo'}</Btn>
        <ErrorText>{photoError}</ErrorText>
        <Muted>{profile.email || profile.phone}</Muted>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-extrabold text-gray-900 dark:text-gray-100">About you</h2>
        <Field label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <Field label={`Date of birth${years ? `  |  ${years} years` : ''}`} type="date" max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={(e) => set('dob', e.target.value)} />
        <Choice label="Gender" value={form.gender} options={GENDERS} onChange={(v) => set('gender', v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (kg)" type="number" inputMode="decimal" min="0" step="any" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
          <Field label="Height (cm)" type="number" inputMode="decimal" min="0" step="any" value={form.heightCm} onChange={(e) => set('heightCm', e.target.value)} />
        </div>
        <Field label="Health conditions or injuries (optional)" multiline maxLength={500} placeholder="e.g. knee pain, asthma" value={form.healthNotes} onChange={(e) => set('healthNotes', e.target.value)} />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-extrabold text-gray-900 dark:text-gray-100">Your plan preferences</h2>
        <Choice label="Goal" value={form.fitnessGoal} options={GOALS} onChange={(v) => set('fitnessGoal', v)} />
        <Choice label="Experience" value={form.experienceLevel} options={LEVELS} onChange={(v) => set('experienceLevel', v)} />
        <Choice label="Food preference" value={form.dietPreference} options={DIETS} onChange={(v) => set('dietPreference', v)} />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-extrabold text-gray-900 dark:text-gray-100">Emergency contact</h2>
        <Field label="Name" value={form.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} />
        <Field label="Phone" type="tel" value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
      </Card>

      {saveMsg.text && <p role={saveMsg.ok ? 'status' : 'alert'} className={`text-sm ${saveMsg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{saveMsg.text}</p>}
      <Btn busy={saving} onClick={save} className="w-full">Save profile</Btn>

      <Card className="space-y-4">
        <h2 className="font-extrabold text-gray-900 dark:text-gray-100">Change password</h2>
        <Field label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
        <Field label="New password (8+ characters)" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
        {pwMsg.text && <p role={pwMsg.ok ? 'status' : 'alert'} className={`text-sm ${pwMsg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{pwMsg.text}</p>}
        <Btn kind="secondary" busy={pwBusy} disabled={!pw.current || pw.next.length < 8} onClick={changePassword} className="w-full">Change password</Btn>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-extrabold text-gray-900 dark:text-gray-100">Appearance</h2>
        <Choice label="Theme" value={mode} options={THEMES} onChange={(v) => v && setMode(v)} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-extrabold text-gray-900 dark:text-gray-100">Privacy</h2>
        <a href="/privacy" target="_blank" rel="noreferrer" className="block text-blue-600 dark:text-blue-400 hover:underline">Read the privacy policy</a>
        {!delOpen ? (
          <Btn kind="danger" onClick={() => setDelOpen(true)} className="w-full">Delete my account</Btn>
        ) : (
          <>
            <Muted>This erases your name, phone, email, photo, health details and plans, cancels your upcoming sessions and signs you out. Your gym keeps its payment and attendance records, without your name.</Muted>
            <Field label="Enter your password to confirm" type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
            <ErrorText>{delError}</ErrorText>
            <Btn kind="danger" busy={delBusy} disabled={!delPw} onClick={deleteAccount} className="w-full">Permanently delete my account</Btn>
            <Btn kind="ghost" onClick={() => { setDelOpen(false); setDelPw(''); setDelError(''); }}>Cancel</Btn>
          </>
        )}
      </Card>

      <Btn kind="secondary" onClick={signOut} className="w-full">Sign out</Btn>
      <button type="button" onClick={signOutEverywhere} className="w-full text-center text-sm text-gray-500 dark:text-gray-400 underline py-2">Sign out of all devices</button>
      <Muted>Your name, phone and email are managed by your gym. Ask the front desk to change them.</Muted>
    </Screen>
  );
}
