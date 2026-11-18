import { Linking } from 'react-native';
import { waNumber } from './whatsapp';

export type WelcomeAccess = { memberCode: string; email: string | null; password: string };

// The message that goes with the welcome card. WhatsApp renders *bold*. Mirrors the website's wording.
export function welcomeText(p: { gymName: string; memberName: string; access: WelcomeAccess; appUrl: string; planName?: string; validUntil?: string }): string {
  return [
    `*Welcome to ${p.gymName || 'the gym'}, ${p.memberName}!* 💪`,
    '',
    'Your member app is ready. Open it, sign in, and add it to your home screen:',
    p.appUrl,
    '',
    `*Username:* ${p.access.memberCode}`,
    ...(p.access.email ? [`(or your email: ${p.access.email})`] : []),
    `*Password:* ${p.access.password}`,
    '',
    ...(p.planName ? [`Plan: ${p.planName}${p.validUntil ? `, valid until ${p.validUntil}` : ''}`] : []),
    'You can change your password after you sign in.',
  ].join('\n');
}

/** Opens WhatsApp to the member's number with the message ready. False when the number is unusable. */
export async function openWhatsAppTo(phone: string, text: string): Promise<boolean> {
  const number = waNumber(phone);
  if (!number) return false;
  await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(text)}`);
  return true;
}
