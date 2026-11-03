// Standard UPI intent URI: opens in any UPI app (GPay, PhonePe, Paytm, BHIM) with the
// amount and payee pre-filled. No gateway involved; payment confirmation is manual.
export const buildUpiLink = ({ upiId, payeeName, amount, note }: { upiId: string; payeeName?: string; amount?: number; note?: string }) => {
  const params: string[] = [`pa=${encodeURIComponent(upiId)}`];
  if (payeeName) params.push(`pn=${encodeURIComponent(payeeName)}`);
  if (amount) params.push(`am=${encodeURIComponent(String(amount))}`);
  params.push('cu=INR');
  if (note) params.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${params.join('&')}`;
};
