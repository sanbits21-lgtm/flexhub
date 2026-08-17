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
