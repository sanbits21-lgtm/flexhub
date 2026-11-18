// The welcome card a new member is sent: who they are, how to sign in, and the address of the member app. One place builds
// the wording, so the card, the WhatsApp message and the copied text can never disagree.

/** The message sent with (or instead of) the card image. WhatsApp renders *bold*. */
export const welcomeText = ({ gymName, memberName, memberCode, email, password, appUrl, planName, validUntil }) => {
  const lines = [
    `*Welcome to ${gymName || 'the gym'}, ${memberName}!* 💪`,
    '',
    'Your member app is ready. Open it, sign in, and add it to your home screen:',
    appUrl,
    '',
    `*Username:* ${memberCode}`,
    ...(email ? [`(or your email: ${email})`] : []),
    `*Password:* ${password}`,
    '',
    ...(planName ? [`Plan: ${planName}${validUntil ? `, valid until ${validUntil}` : ''}`] : []),
    'You can change your password after you sign in.',
  ];
  return lines.join('\n');
};

/** A wa.me link that opens WhatsApp with the message ready, or null when the phone is not usable. */
export const whatsappLink = (phone, text) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  // A bare 10-digit Indian number needs the country code for wa.me.
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

const rgb = (triplet, fallback) => {
  const parts = String(triplet || '').trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? parts : fallback;
};

/** The gym's accent colour as an [r, g, b] triple, read from the page's CSS variable. */
export const accentRgb = () => {
  if (typeof document === 'undefined') return [200, 248, 58];
  return rgb(getComputedStyle(document.documentElement).getPropertyValue('--accent'), [200, 248, 58]);
};

export const CARD_SIZE = { width: 900, height: 1180 };

const fit = (ctx, text, maxWidth, start, min = 20) => {
  let size = start;
  while (size > min) {
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
};

/** Paints the card on a canvas. `qr` is an already drawn QR canvas (or null). Returns the canvas. */
export const drawWelcomeCard = (canvas, data, qr, accent = accentRgb()) => {
  const { width: W, height: H } = CARD_SIZE;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const [r, g, b] = accent;
  const acc = `rgb(${r}, ${g}, ${b})`;
  const font = (weight, size) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const round = (x, y, w, h, rad) => { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); };

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0e05');
  bg.addColorStop(1, '#161b0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W - 80, 60, 20, W - 80, 60, 520);
  glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.35)`);
  glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = acc;
  ctx.font = font(800, 24);
  ctx.fillText('MEMBER APP ACCESS', 70, 100);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 56);
  fit(ctx, data.gymName || 'Your gym', W - 140, 56, 30);
  ctx.fillText(data.gymName || 'Your gym', 70, 175);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(500, 30);
  ctx.fillText('Welcome,', 70, 270);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 64);
  fit(ctx, data.memberName, W - 140, 64, 30);
  ctx.fillText(data.memberName, 70, 345);

  if (data.planName) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = font(500, 26);
    const line = `${data.planName}${data.validUntil ? `  ·  valid until ${data.validUntil}` : ''}`;
    fit(ctx, line, W - 140, 26, 18);
    ctx.fillText(line, 70, 395);
  }

  // The sign-in panel.
  round(60, 440, W - 120, 330, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = font(600, 24);
  ctx.fillText('USERNAME  (member code)', 100, 505);
  ctx.fillStyle = acc;
  ctx.font = font(800, 54);
  ctx.font = ctx.font.replace('system-ui', 'ui-monospace, Menlo, Consolas, monospace');
  fit(ctx, data.memberCode, W - 200, 54, 28);
  ctx.fillText(data.memberCode, 100, 570);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = font(600, 24);
  ctx.fillText('PASSWORD', 100, 650);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 54).replace('system-ui', 'ui-monospace, Menlo, Consolas, monospace');
  fit(ctx, data.password, W - 200, 54, 28);
  ctx.fillText(data.password, 100, 715);

  // The link and its QR code.
  if (qr) {
    round(W - 330, 810, 260, 260, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(qr, W - 320, 820, 240, 240);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = font(600, 24);
  ctx.fillText('OPEN THE MEMBER APP', 70, 850);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(600, 28);
  const url = String(data.appUrl || '').replace(/^https?:\/\//, '');
  const maxW = qr ? W - 430 : W - 140;
  // Long addresses wrap onto a second line rather than shrinking to nothing.
  const rows = [];
  let row = '';
  for (const ch of url) {
    if (ctx.measureText(row + ch).width > maxW) { rows.push(row); row = ch; } else row += ch;
  }
  rows.push(row);
  rows.slice(0, 3).forEach((text, i) => ctx.fillText(text, 70, 900 + i * 40));

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = font(500, 22);
  ctx.fillText('Sign in, then add it to your home screen.', 70, 1060);
  ctx.fillText('You can change your password after signing in.', 70, 1095);
  ctx.fillStyle = acc;
  ctx.fillRect(0, H - 14, W, 14);
  return canvas;
};
