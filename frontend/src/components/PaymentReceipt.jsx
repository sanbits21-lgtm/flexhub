import { useState } from 'react';
import { amountLabel, fmtMoney, receiptRows, receiptText } from '../utils/receipt';

/**
 * `period` ({ start, end }) is the membership term this payment bought. Pass it only when it
 * is known for THIS payment: a reprint from the Payments page has only the member's current
 * term, which may be a later renewal, so it is left out there rather than shown wrongly.
 */
export default function PaymentReceipt(props) {
  const { tenantName, member, amount, status = 'paid' } = props;
  const [copied, setCopied] = useState(false);

  const rows = receiptRows(props);
  const text = receiptText(props);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappHref = member.phone
    ? `https://wa.me/${member.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
    : null;

  const btn = 'border rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700';

  return (
    <div className="w-full text-left">
      {/* The print stylesheet (index.css) forces this block to black-on-white paper. */}
      <div className="receipt-print-area bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-sm text-gray-800 dark:text-gray-100">
        <div className="text-center pb-3">
          <p className="font-bold text-lg">{tenantName}</p>
          <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">Payment Receipt</p>
        </div>
        <dl className="border-t border-dashed border-gray-300 dark:border-gray-600 pt-3 space-y-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400 shrink-0">{label}</dt>
              <dd className={`text-right break-words min-w-0 ${label === 'Invoice' ? 'font-mono' : ''} ${label === 'Valid until' ? 'font-semibold' : ''}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex justify-between items-baseline gap-4 border-t border-dashed border-gray-300 dark:border-gray-600 mt-3 pt-3">
          <span className="font-semibold">{amountLabel(status)}</span>
          <span className="font-bold text-xl">{fmtMoney(amount)}</span>
        </div>
        <p className="receipt-thanks text-center text-xs text-gray-500 dark:text-gray-400 pt-4">Thank you for choosing {tenantName}.</p>
      </div>

      <div className="no-print flex flex-wrap gap-2 justify-center pt-3">
        <button type="button" onClick={() => window.print()} className={btn}>Print / Save PDF</button>
        <button type="button" onClick={handleCopy} className={btn}>{copied ? 'Copied!' : 'Copy Receipt Text'}</button>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className={btn}>Share via WhatsApp</a>
        )}
      </div>
    </div>
  );
}
