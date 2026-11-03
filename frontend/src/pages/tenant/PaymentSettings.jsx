import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { tenantSettingsAPI } from '../../services/api';
import { buildUpiLink } from '../../utils/upi';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';

export default function PaymentSettings() {
  const [tenant, setTenant] = useState(null);
  const [form, setForm] = useState({ upiId: '', upiPaymentLink: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    tenantSettingsAPI.get().then((res) => {
      setTenant(res.data);
      setForm({ upiId: res.data.upiId || '', upiPaymentLink: res.data.upiPaymentLink || '' });
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    const { data } = await tenantSettingsAPI.update(form);
    setTenant(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (!tenant) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;

  const previewLink = form.upiId ? buildUpiLink({ upiId: form.upiId, payeeName: tenant.name }) : '';

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Payment Settings</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Set your UPI ID so staff can collect member payments via UPI — a QR code is generated automatically
        with each payment's amount pre-filled. No payment gateway or fees involved; staff manually confirms
        once a member has paid.
      </p>

      <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-4">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">UPI ID</label>
          <input
            placeholder="yourgym@okhdfcbank"
            value={form.upiId}
            onChange={(e) => setForm({ ...form, upiId: e.target.value })}
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Payment Link (optional fallback)</label>
          <input
            placeholder="https://... (e.g. a GPay/PhonePe business payment page)"
            value={form.upiPaymentLink}
            onChange={(e) => setForm({ ...form, upiPaymentLink: e.target.value })}
            className={`${inputClass} w-full`}
          />
        </div>

        {previewLink && (
          <div className="flex items-center gap-4 pt-2">
            <div className="bg-white p-2 rounded border dark:border-gray-600">
              <QRCodeSVG value={previewLink} size={120} />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Preview — the real QR shown during payment includes the exact amount owed.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Save</button>
          {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved.</span>}
        </div>
      </form>
    </div>
  );
}
