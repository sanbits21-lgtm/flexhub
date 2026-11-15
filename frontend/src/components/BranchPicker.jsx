// "Which branches?" for a plan: every branch (including ones added later), or a chosen set.
// `value` is the list of chosen branch ids; an empty list means every branch.
export default function BranchPicker({ branches, value, onChange, idPrefix = 'bp' }) {
  const all = value.length === 0;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <fieldset>
      <legend className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Offered at</legend>
      <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
        <input type="radio" name={`${idPrefix}-scope`} checked={all} onChange={() => onChange([])} />
        All branches <span className="text-xs text-gray-500 dark:text-gray-400">(including ones you add later)</span>
      </label>
      <label className="mt-1 flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
        <input type="radio" name={`${idPrefix}-scope`} checked={!all} onChange={() => onChange(branches[0] ? [branches[0]._id] : [])} disabled={branches.length === 0} />
        Only these branches
      </label>
      {!all && (
        <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700">
          {branches.map((b) => (
            <li key={b._id}>
              <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                <input type="checkbox" checked={value.includes(b._id)} onChange={() => toggle(b._id)} />
                {b.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
