import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tenantsAPI } from '../../services/api';

const CATEGORY_LABELS = { page: 'Pages', feature: 'Features', rule: 'Rules', field: 'Fields' };
const CATEGORY_ORDER = ['page', 'feature', 'rule', 'field'];

export default function Workspace() {
  const { id } = useParams();
  const [tenantName, setTenantName] = useState('');
  const [registry, setRegistry] = useState({});
  const [resolved, setResolved] = useState({});
  // Pending edits, applied to `resolved` on save — kept separate so Save/Cancel is a
  // single obvious action instead of every checkbox writing through immediately.
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => tenantsAPI.getFeatures(id).then((res) => {
    setTenantName(res.data.tenantName);
    setRegistry(res.data.registry);
    setResolved(res.data.resolved);
    setDraft(res.data.resolved);
  });
  useEffect(() => { load(); }, [id]);

  const handleSave = async (e) => {
    e.preventDefault();
    // Only send keys that actually changed — matches how the backend's audit diff
    // works, and avoids restamping every flag as an "override" when most weren't touched.
    const changes = Object.fromEntries(
      Object.keys(draft).filter((key) => draft[key] !== resolved[key]).map((key) => [key, draft[key]])
    );
    if (Object.keys(changes).length === 0) return;
    setSaving(true);
    try {
      const { data } = await tenantsAPI.updateFeatures(id, changes);
      setResolved(data.resolved);
      setDraft(data.resolved);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(draft).some((key) => draft[key] !== resolved[key]);
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    keys: Object.keys(registry).filter((key) => registry[key].category === category),
  })).filter((g) => g.keys.length > 0);

  if (!tenantName) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <Link to="/tenants" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">← Tenants</Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1">Workspace — {tenantName}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Turn pages, features and fields on or off for this gym specifically. Unchanged
          items stay at their default — this never affects any other tenant.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {grouped.map(({ category, keys }) => (
          <div key={category} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {CATEGORY_LABELS[category]}
            </h2>
            {keys.map((key) => (
              <label key={key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={!!draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm text-gray-900 dark:text-gray-100">{registry[key].label}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{registry[key].description}</span>
                </span>
              </label>
            ))}
          </div>
        ))}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !hasChanges}
            className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {hasChanges && !saving && (
            <button type="button" onClick={() => setDraft(resolved)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
              Discard changes
            </button>
          )}
          {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved.</span>}
        </div>
      </form>
    </div>
  );
}
