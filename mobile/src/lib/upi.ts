/**
 * The UPI account for a branch: its own when the owner gave it one, else the gym's. A branch with its own ID uses
 * its own link too, never the gym's (the backend resolves it the same way). `settings` is the /tenant-settings response.
 */
export const accountForBranch = (
  settings: { upiId?: string; upiPaymentLink?: string; branchAccounts?: Record<string, { upiId: string; upiPaymentLink?: string }> } | null | undefined,
  branchId?: string,
): { upiId: string; upiPaymentLink: string } => {
  const own = branchId ? settings?.branchAccounts?.[branchId] : undefined;
  if (own?.upiId) return { upiId: own.upiId, upiPaymentLink: own.upiPaymentLink ?? '' };
  return { upiId: settings?.upiId ?? '', upiPaymentLink: settings?.upiPaymentLink ?? '' };
};

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
