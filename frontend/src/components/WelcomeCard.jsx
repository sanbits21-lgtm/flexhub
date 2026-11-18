import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Check, Copy, Download, MessageCircle } from 'lucide-react';
import { tenantSettingsAPI } from '../services/api';
import { accentRgb, CARD_SIZE, drawWelcomeCard, welcomeText, whatsappLink } from '../utils/welcomeCard';

const btn = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700';
const whatsappBtn = 'inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-black hover:brightness-95';

/**
 * The welcome card for a member: gym name, who they are, username and a one-time password, and the member app's address
 * with a QR code. It can be sent as a picture on WhatsApp, saved as an image, or copied as text.
 * `access` is { memberCode, email, password } as returned once by the server.
 */
export default function WelcomeCard({ gymName, member, access, planName, validUntil, onDone }) {
  const [appUrl, setAppUrl] = useState(`${window.location.origin}/member`);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState('');
  const qrRef = useRef(null);
  const accent = useMemo(accentRgb, []);

  useEffect(() => {
    let live = true;
    tenantSettingsAPI.memberAppLink().then((res) => { if (live && res.data?.url) setAppUrl(res.data.url); }).catch(() => { /* the standard address stays */ });
    return () => { live = false; };
  }, []);

  const data = { gymName, memberName: member.name, memberCode: access.memberCode, email: access.email, password: access.password, appUrl, planName, validUntil };
  const text = welcomeText(data);
  const href = whatsappLink(member.phone, text);

  const makeImage = () => new Promise((resolve) => {
    const canvas = drawWelcomeCard(document.createElement('canvas'), data, qrRef.current, accent);
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });

  const download = async () => {
    const blob = await makeImage();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `welcome-${access.memberCode}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // On a phone the share sheet can hand WhatsApp the picture itself; on a computer WhatsApp only takes text from a link.
  const share = async () => {
    setNote('');
    try {
      const blob = await makeImage();
      const file = blob && new File([blob], `welcome-${access.memberCode}.png`, { type: 'image/png' });
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return; // the person closed the share sheet
    }
    if (href) window.open(href, '_blank', 'noopener');
    else setNote("This member's phone number cannot be used for WhatsApp. Download the card or copy the message instead.");
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setNote('Could not copy. Select the text yourself.'); }
  };

  const [r, g, b] = accent;
  const acc = `rgb(${r}, ${g}, ${b})`;
  return (
    <div className="w-full text-left">
      <div className="overflow-hidden rounded-3xl text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #0b0e05, #161b0a)', aspectRatio: `${CARD_SIZE.width} / ${CARD_SIZE.height}`, maxHeight: 520, margin: '0 auto' }}>
        <div className="relative flex h-full flex-col justify-between p-5" style={{ backgroundImage: `radial-gradient(circle at 90% 5%, rgba(${r}, ${g}, ${b}, .3), transparent 55%)` }}>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: acc }}>Member app access</p>
            <p className="mt-1 truncate text-lg font-extrabold">{gymName}</p>
            <p className="mt-3 text-xs text-white/70">Welcome,</p>
            <p className="truncate text-2xl font-extrabold">{member.name}</p>
            {planName && <p className="mt-0.5 truncate text-xs text-white/60">{planName}{validUntil ? ` · valid until ${validUntil}` : ''}</p>}
          </div>
          <div className="rounded-2xl border bg-white/[0.07] p-3" style={{ borderColor: `rgba(${r}, ${g}, ${b}, .5)` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Username (member code)</p>
            <p className="break-all font-mono text-xl font-extrabold" style={{ color: acc }}>{access.memberCode}</p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-white/60">Password</p>
            <p className="break-all font-mono text-xl font-extrabold">{access.password}</p>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Open the member app</p>
              <p className="break-all text-xs font-semibold">{appUrl.replace(/^https?:\/\//, '')}</p>
              <p className="mt-1 text-[10px] text-white/50">Sign in, then add it to your home screen.</p>
            </div>
            <div className="shrink-0 rounded-xl bg-white p-1.5"><QRCodeCanvas ref={qrRef} value={appUrl} size={84} marginSize={0} /></div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">The password is shown only now and is not emailed. The member can change it after signing in.</p>
      {note && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={share} className={whatsappBtn}><MessageCircle className="h-4 w-4" aria-hidden="true" /> Share on WhatsApp</button>
        <button type="button" onClick={download} className={btn}><Download className="h-4 w-4" aria-hidden="true" /> Download card</button>
        <button type="button" onClick={copy} className={btn}>{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} {copied ? 'Copied' : 'Copy message'}</button>
        {onDone && <button type="button" onClick={onDone} className="ml-auto rounded px-4 py-1.5 text-sm font-semibold bg-gray-900 text-white dark:bg-accent dark:text-accent-ink">Done</button>}
      </div>
    </div>
  );
}
