// Receipt formatting lives in one place so the on-screen receipt, the print layout and the
// WhatsApp text can never disagree. Dates and money follow the viewer's own locale (the
// gym's staff are the ones reading it); amounts are rupees.
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => new Date(d || Date.now()).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const fmtMoney = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);

const STATUS_LABEL = { paid: 'Amount Paid', refunded: 'Amount Refunded' };
export const amountLabel = (status) => STATUS_LABEL[status] || 'Amount Due';

const DURATION = { monthly: '1 month', quarterly: '3 months', half_yearly: '6 months', halfyearly: '6 months', yearly: '12 months' };
const durationLabel = (unit) => DURATION[unit] || (unit ? String(unit).replace(/_/g, ' ') : '');

/** Everything a receipt shows, as ordered label/value rows. Empty values are dropped. */
export const receiptRows = ({ member, planName, planDuration, period, method, invoiceNumber, paidAt, status, discountPercent, branchName }) => {
  const rows = [
    ['Invoice', invoiceNumber],
    ['Date', fmtDateTime(paidAt)],
    ['Member', member.name],
    ['Member ID', member.memberCode],
    ['Phone', member.phone],
    ['Branch', branchName],
    ['Plan', planName ? `${planName}${planDuration ? ` (${durationLabel(planDuration)})` : ''}` : '—'],
    ['Starts', period?.start && fmtDate(period.start)],
    ['Valid until', period?.end && fmtDate(period.end)],
    ['Discount', Number(discountPercent) > 0 ? `${discountPercent}%` : null],
    ['Payment method', method ? method.toUpperCase() : null],
    ['Status', status && status !== 'paid' ? status.toUpperCase() : null],
  ];
  return rows.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false);
};

/** WhatsApp renders *bold*; plain lines otherwise, so it stays readable if pasted elsewhere. */
export const receiptText = (props) => {
  const { tenantName, amount, status = 'paid' } = props;
  const lines = receiptRows(props).map(([k, v]) => `${k}: ${v}`);
  return [`*${tenantName || 'Payment'} — Payment Receipt*`, '', ...lines, '', `*${amountLabel(status)}: ${fmtMoney(amount)}*`, '', 'Thank you!'].join('\n');
};
