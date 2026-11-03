import { useState } from 'react';

export default function PaymentReceipt({ tenantName, member, planName, amount, method, invoiceNumber, paidAt, status = 'paid' }) {
  const [copied, setCopied] = useState(false);

  const dateStr = new Date(paidAt || Date.now()).toLocaleString();
  // A reprint can be of a pending or refunded payment, where "Amount Paid" would be a
  // lie — label the figure for what it actually is.
  const isPaid = status === 'paid';
  const amountLabel = isPaid ? 'Amount Paid' : status === 'refunded' ? 'Amount Refunded' : 'Amount Due';

  const receiptText = [
    `${tenantName} — Payment Receipt`,
    `Invoice: ${invoiceNumber}`,
    `Date: ${dateStr}`,
    `Member: ${member.name}${member.memberCode ? ` (${member.memberCode})` : ''}`,
    `Plan: ${planName || '—'}`,
    `Method: ${method?.toUpperCase()}`,
    ...(isPaid ? [] : [`Status: ${status?.toUpperCase()}`]),
    `${amountLabel}: ₹${amount}`,
  ].join('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(receiptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappHref = member.phone
    ? `https://wa.me/${member.phone.replace(/\D/g, '')}?text=${encodeURIComponent(receiptText)}`
    : null;

  return (
    <div className="w-full">
      <div className="receipt-print-area bg-white dark:bg-gray-800 dark:border dark:border-gray-700 border dark:border-gray-600 rounded p-4 text-sm text-gray-800 dark:text-gray-100 space-y-2">
        <div className="text-center">
          <p className="font-semibold text-base">{tenantName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Payment Receipt</p>
        </div>
        <div className="border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 space-y-1">
          <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Invoice</span><span className="font-mono">{invoiceNumber}</span></div>
          <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Date</span><span>{dateStr}</span></div>
          <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Member</span><span>{member.name}{member.memberCode ? ` (${member.memberCode})` : ''}</span></div>
          <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Plan</span><span>{planName || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Method</span><span className="uppercase">{method}</span></div>
          {!isPaid && (
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Status</span><span className="uppercase">{status}</span></div>
          )}
          <div className="flex justify-between font-semibold border-t border-dashed border-gray-300 dark:border-gray-600 pt-1"><span>{amountLabel}</span><span>₹{amount}</span></div>
        </div>
      </div>

      <div className="no-print flex flex-wrap gap-2 justify-center pt-3">
        <button type="button" onClick={() => window.print()} className="border rounded px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-100">
          Print / Save PDF
        </button>
        <button type="button" onClick={handleCopy} className="border rounded px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-100">
          {copied ? 'Copied!' : 'Copy Receipt Text'}
        </button>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="border rounded px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-100">
            Share via WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
