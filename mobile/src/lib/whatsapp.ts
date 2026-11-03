import { Linking } from 'react-native';
import { fmtDate } from './format';

// "Remind on WhatsApp" opens WhatsApp with the message already written, to the member's
// number. Nothing is sent automatically: staff read it and tap send themselves.

/** Digits only, with the country code. A bare 10-digit number is assumed to be Indian (+91). */
export function waNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function renewalMessage({ name, gym, planName, endsOn }: { name: string; gym: string; planName?: string; endsOn?: string | null }): string {
  const first = name.split(/\s+/)[0] || 'there';
  const plan = planName ? `${planName} membership` : 'membership';
  const when = endsOn
    ? (new Date(endsOn).getTime() < Date.now() ? `ended on ${fmtDate(endsOn)}` : `ends on ${fmtDate(endsOn)}`)
    : 'needs renewing';
  return `Hi ${first}, this is ${gym || 'your gym'}. Your ${plan} ${when}. Reply here or drop by the front desk to renew and keep your progress going. Thank you!`;
}

/** Opens WhatsApp. Returns false if the member has no usable number. */
export async function openWhatsApp(phone: string, message: string): Promise<boolean> {
  const number = waNumber(phone);
  if (!number) return false;
  await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(message)}`);
  return true;
}
