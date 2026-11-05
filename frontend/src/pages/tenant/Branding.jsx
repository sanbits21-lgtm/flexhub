import { useEffect, useState } from 'react';
import { tenantSettingsAPI } from '../../services/api';
import { useBrand } from '../../context/BrandContext';
import BrandMark from '../../components/BrandMark';
import { accentGradientCss, inkFor, DEFAULT_ACCENT } from '../../utils/brand';

const inputClass = 'border rounded-xl px-3 py-2.5 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 w-full';
const labelClass = 'block text-sm text-gray-600 dark:text-gray-300 mb-1';
const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');
const DIRECTIONS = [
  { angle: 90, label: 'Left to right' },
  { angle: 135, label: 'Diagonal' },
  { angle: 180, label: 'Top to bottom' },
];

export default function Branding() {
  const { setBrand } = useBrand();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ color: '', color2: '', gradientAngle: 135, logoUrl: '', tagline: '', slug: '' });
  const [message, setMessage] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  const load = (data) => {
    setInfo(data);
    setForm({ color: data.brand.color, color2: data.brand.color2 || '', gradientAngle: data.brand.gradientAngle || 135, logoUrl: data.brand.logoUrl, tagline: data.brand.tagline, slug: data.slug });
  };
  useEffect(() => { tenantSettingsAPI.getBranding().then((r) => load(r.data)); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload = { color: form.color, color2: form.color2, gradientAngle: form.gradientAngle, logoUrl: form.logoUrl, tagline: form.tagline };
      if (info.canChangeAddress && form.slug !== info.slug) payload.slug = form.slug;
      const { data } = await tenantSettingsAPI.updateBranding(payload);
      load(data);
      setBrand({ name: data.name, slug: data.slug, ...data.brand });
      const moved = payload.slug ? ` Your new address is ${data.slug}.${data.baseDomain || ''}. The old one keeps working for ${data.redirectDays} days.` : '';
      setMessage({ ok: true, text: `Saved.${moved}` });
    } catch (err) {
      setMessage({ ok: false, text: err.response?.data?.message || 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  if (!info) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;
  const preview = { name: info.name, ...form };
  const previewFill = accentGradientCss(form.color || DEFAULT_ACCENT, form.color2, form.gradientAngle);
  const origin = info.baseDomain ? `https://${form.slug || 'your-gym'}.${info.baseDomain}` : null;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Branding &amp; Address</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">Make the website your own: your logo, colour and tagline appear on your login page and in the menu.</p>

      <form onSubmit={save} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-4">
        <div>
          <label htmlFor="b-color" className={labelClass}>Accent colour</label>
          <div className="flex items-center gap-3">
            <input type="color" aria-label="Pick colour" value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#C8F83A'} onChange={(e) => setForm({ ...form, color: e.target.value.toUpperCase() })} className="h-11 w-14 rounded-lg bg-transparent" />
            <input id="b-color" placeholder="#C8F83A" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className={inputClass} />
            {form.color && <button type="button" onClick={() => setForm({ ...form, color: '' })} className="text-sm text-gray-600 dark:text-gray-300 underline whitespace-nowrap">Use default</button>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used for buttons and the selected menu item. Bright colours work best on the dark theme.</p>
        </div>
        <div>
          <label htmlFor="b-color2" className={labelClass}>Second colour <span className="text-gray-500">(optional, makes a gradient)</span></label>
          <div className="flex items-center gap-3">
            <input type="color" aria-label="Pick second colour" disabled={!isHex(form.color)} value={isHex(form.color2) ? form.color2 : '#37D67A'} onChange={(e) => setForm({ ...form, color2: e.target.value.toUpperCase() })} className="h-11 w-14 rounded-lg bg-transparent disabled:opacity-40" />
            <input id="b-color2" placeholder="#37D67A" disabled={!isHex(form.color)} value={form.color2} onChange={(e) => setForm({ ...form, color2: e.target.value })} className={`${inputClass} disabled:opacity-60`} />
            {form.color2 && <button type="button" onClick={() => setForm({ ...form, color2: '' })} className="text-sm text-gray-600 dark:text-gray-300 underline whitespace-nowrap">Flat colour</button>}
          </div>
          {!isHex(form.color) && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pick the first colour above to add a gradient.</p>}
          {isHex(form.color2) && (
            <div className="mt-3 space-y-2">
              <div role="radiogroup" aria-label="Gradient direction" className="flex flex-wrap gap-2">
                {DIRECTIONS.map((d) => (
                  <button key={d.angle} type="button" role="radio" aria-checked={form.gradientAngle === d.angle} onClick={() => setForm({ ...form, gradientAngle: d.angle })} className={`rounded-lg border px-3 py-1.5 text-sm ${form.gradientAngle === d.angle ? 'border-accent text-gray-900 dark:text-gray-100 font-semibold' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              <div aria-hidden="true" className="h-10 rounded-xl" style={{ backgroundImage: accentGradientCss(form.color, form.color2, form.gradientAngle) }} />
            </div>
          )}
        </div>
        <div>
          <label htmlFor="b-logo" className={labelClass}>Logo link (https)</label>
          <input id="b-logo" placeholder="https://yourgym.com/logo.png" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="b-tag" className={labelClass}>Tagline <span className="text-gray-500">(max 80)</span></label>
          <input id="b-tag" maxLength={80} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className={inputClass} />
        </div>

        <div>
          <label htmlFor="b-slug" className={labelClass}>Web address</label>
          {info.baseDomain ? (
            <div className="flex items-center gap-2">
              <input id="b-slug" value={form.slug} disabled={!info.canChangeAddress} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} className={`${inputClass} ${!info.canChangeAddress ? 'opacity-60' : ''}`} />
              <span className="text-gray-600 dark:text-gray-300 whitespace-nowrap">.{info.baseDomain}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">Gym addresses are not switched on for this installation.</p>
          )}
          {!info.canChangeAddress && info.baseDomain && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Changing your address is not enabled for your gym. Ask your platform administrator.</p>}
          {info.canChangeAddress && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Lowercase letters, numbers and hyphens. After a change, the old address keeps working for {info.redirectDays} days. Tell your staff and members the new link.</p>}
          {info.previousAddresses.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Still redirecting: {info.previousAddresses.map((p) => `${p.slug}.${info.baseDomain} (until ${new Date(p.until).toLocaleDateString()})`).join(', ')}</p>}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <BrandMark brand={preview} size={40} />
          <div className="min-w-0">
            <div className="font-extrabold text-gray-900 dark:text-gray-100 truncate">{info.name}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300 truncate">{form.tagline || 'Your tagline here'}</div>
            {origin && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{origin}</div>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-xl px-4 py-2 font-semibold text-sm" style={{ backgroundImage: previewFill, color: `rgb(${inkFor(form.color || DEFAULT_ACCENT, form.color2)})` }}>Button preview</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">How buttons and the selected menu item will look.</span>
        </div>

        {message && <div role="status" className={`text-sm ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{message.text}</div>}
        <button type="submit" disabled={busy} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50">{busy ? 'Saving...' : 'Save'}</button>
      </form>
    </div>
  );
}
