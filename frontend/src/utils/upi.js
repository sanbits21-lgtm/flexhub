/**
 * The UPI account for a branch: its own when the owner gave it one, else the gym's. A branch with
 * its own ID uses its own link too, never the gym's (the backend resolves it the same way).
 * `settings` is the /tenant-settings response.
 */
export const accountForBranch = (settings, branchId) => {
  const own = branchId && settings?.branchAccounts?.[branchId];
  if (own && own.upiId) return { upiId: own.upiId, upiPaymentLink: own.upiPaymentLink || '' };
  return { upiId: settings?.upiId || '', upiPaymentLink: settings?.upiPaymentLink || '' };
};

// Standard UPI intent URI — opens directly in any UPI app (GPay, PhonePe, Paytm, BHIM)
// with amount/payee pre-filled. No gateway involved; payment confirmation is manual.
export const buildUpiLink = ({ upiId, payeeName, amount, note }) => {
  const params = new URLSearchParams();
  params.set('pa', upiId);
  if (payeeName) params.set('pn', payeeName);
  if (amount) params.set('am', String(amount));
  params.set('cu', 'INR');
  if (note) params.set('tn', note);
  return `upi://pay?${params.toString()}`;
};
