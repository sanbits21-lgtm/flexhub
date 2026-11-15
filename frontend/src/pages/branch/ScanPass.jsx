import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, LogOut, XCircle } from 'lucide-react';
import { attendanceAPI } from '../../services/api';
import { primaryBtn, toolBtn } from '../../components/ListToolbar';
import { cameraProblem, looksLikePass, shouldHandle } from '../../utils/scanGuard';

const SHOW_RESULT_MS = 3000;
const READS_PER_SECOND = 8;
const MAX_SIDE = 640; // the camera frame is shrunk to this before it is read: plenty for a QR code, and much faster
const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const time = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const errorText = (err) => err?.response?.data?.message || (err?.response ? 'That did not work.' : 'Could not reach the server. Check the connection and scan again.');

// The front desk scanning a member's pass with the computer's or phone's camera: the same thing the Scan screen in the staff app
// does. One scan checks the member in; scanning again while they are inside checks them out.
export default function ScanPass() {
  const video = useRef(null);
  const canvas = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null); // the read loop: a plain timer, eight reads a second
  const running = useRef(false); // false once the camera is stopped, so a read already scheduled does nothing and the loop ends
  const busy = useRef(false); // a read is being sent, or its result is on screen: look at nothing meanwhile
  const last = useRef(null); // the previous handled code: { token, at }
  const [phase, setPhase] = useState('idle'); // idle | starting | scanning
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState(null); // { kind: 'in' | 'out' | 'refused', title, detail }
  const [history, setHistory] = useState([]);

  const stop = useCallback(() => {
    running.current = false;
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setPhase('idle');
  }, []);
  useEffect(() => stop, [stop]); // the camera must not stay on after leaving the page

  const show = (r) => {
    setResult(r);
    setHistory((h) => [{ ...r, at: Date.now() }, ...h].slice(0, 8));
    setTimeout(() => { setResult(null); busy.current = false; }, SHOW_RESULT_MS);
  };

  const handle = async (token) => {
    busy.current = true;
    last.current = { token, at: Date.now(), seenAt: Date.now() };
    try {
      const { data } = await attendanceAPI.scan(token);
      const m = data.member;
      if (data.action === 'checked-in') show({ kind: 'in', title: `${m.name} checked in`, detail: `${m.memberCode}${m.membershipEnd ? ` · plan ends ${date(m.membershipEnd)}` : ''}` });
      else show({ kind: 'out', title: `${m.name} checked out`, detail: m.memberCode });
    } catch (err) {
      const m = err?.response?.data?.member;
      show({ kind: 'refused', title: m ? `${m.name}: not checked in` : 'Not accepted', detail: errorText(err) });
    }
  };

  const tick = useCallback(() => {
    if (!running.current) return;
    const v = video.current;
    const c = canvas.current;
    if (v && c && v.readyState >= 2 && !busy.current) {
      const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const found = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
      if (found?.data) {
        const now = Date.now();
        const handleIt = shouldHandle({ last: last.current, token: found.data, now });
        if (last.current?.token === found.data) last.current.seenAt = now; // still in front of the camera
        if (handleIt) {
          if (looksLikePass(found.data)) {
            handle(found.data);
          } else {
            busy.current = true;
            last.current = { token: found.data, at: now, seenAt: now };
            show({ kind: 'refused', title: 'Not a FitzyClub pass', detail: 'That QR code is something else. Ask the member to open My pass in the member app.' });
          }
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setProblem('');
    setPhase('starting');
    const secure = window.isSecureContext;
    if (!secure || !navigator.mediaDevices?.getUserMedia) { setProblem(cameraProblem(null, { secure: false })); setPhase('idle'); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.current.srcObject = stream.current;
      await video.current.play();
      running.current = true;
      setPhase('scanning');
      timer.current = setInterval(tick, 1000 / READS_PER_SECOND);
    } catch (err) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setProblem(cameraProblem(err));
      setPhase('idle');
    }
  };

  const tone = { in: 'bg-green-600/15 text-green-800 dark:bg-accent/15 dark:text-accent', out: 'bg-blue-500/15 text-blue-800 dark:text-blue-300', refused: 'bg-red-500/15 text-red-800 dark:text-red-300' };
  const Icon = { in: CheckCircle2, out: LogOut, refused: XCircle };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Scan pass</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Point the camera at the QR code on the member's phone (My pass in the member app). The first scan checks them in; scanning again while they are inside checks them out.</p>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-gray-200/80 bg-black dark:border-white/5">
        <video ref={video} playsInline muted className={`aspect-[4/3] w-full object-cover ${phase === 'scanning' ? '' : 'hidden'}`} aria-label="Camera" />
        <canvas ref={canvas} className="hidden" />
        {phase !== 'scanning' && (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 p-6 text-center text-gray-300">
            {problem ? <CameraOff className="h-10 w-10 text-red-400" aria-hidden="true" /> : <Camera className="h-10 w-10" aria-hidden="true" />}
            <p className="text-sm">{problem || 'The camera is off.'}</p>
            <button type="button" onClick={start} disabled={phase === 'starting'} className={primaryBtn}>{phase === 'starting' ? 'Starting...' : problem ? 'Try again' : 'Start scanning'}</button>
          </div>
        )}
        {phase === 'scanning' && (
          <>
            <div aria-hidden="true" className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-accent/80" />
            {result && (
              <div role="status" className={`absolute inset-x-3 bottom-3 flex items-start gap-3 rounded-2xl p-3 backdrop-blur ${tone[result.kind]} bg-white/90 dark:bg-gray-900/90`}>
                {(() => { const I = Icon[result.kind]; return <I className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />; })()}
                <div className="min-w-0"><p className="font-bold">{result.title}</p><p className="text-sm">{result.detail}</p></div>
              </div>
            )}
          </>
        )}
      </div>

      {phase === 'scanning' && <div className="flex justify-between gap-2"><button type="button" onClick={stop} className={toolBtn}>Stop camera</button><Link to="/attendance" className={`${toolBtn} inline-flex items-center`}>Check in by member ID instead</Link></div>}

      {history.length > 0 && (
        <section className="rounded-3xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-gray-800/80">
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Recent scans</h2>
          <ul className="space-y-1.5 text-sm">
            {history.map((h) => (
              <li key={h.at} className="flex items-center justify-between gap-3">
                <span className={`min-w-0 truncate ${h.kind === 'refused' ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{h.title}</span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{time(h.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
