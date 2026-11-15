// "Which plans does this branch offer?" A checkbox per active plan. `selected` is a Set of plan ids.
export default function PlanChecklist({ plans, selected, onToggle }) {
  if (plans === null) return <p className="text-xs text-gray-500 dark:text-gray-400">Loading plans...</p>;
  if (plans.length === 0) return <p className="text-xs text-gray-500 dark:text-gray-400">No plans yet. Add them under Membership Plans.</p>;
  return (
    <fieldset>
      <legend className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Membership plans offered at this branch</legend>
      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700">
        {plans.map((p) => (
          <li key={p._id}>
            <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input type="checkbox" checked={selected.has(p._id)} onChange={() => onToggle(p._id)} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{(p.branchIds || []).length ? `${p.branchIds.length} branch${p.branchIds.length === 1 ? '' : 'es'}` : 'All branches'}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Existing members keep their plan. Every plan needs at least one branch: to stop offering one everywhere, turn it off in Membership Plans.</p>
    </fieldset>
  );
}
