import { toInputValue } from '../utils/memberFields';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 w-full';

/** One input per custom field, typed (text / number / date). `values` is { key: value }. */
export default function CustomFieldInputs({ fields, values, onChange, className = 'grid grid-cols-2 gap-3' }) {
  if (!fields.length) return null;
  return (
    <div className={className}>
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1" htmlFor={`cf-${f.key}`}>{f.label}</label>
          <input
            id={`cf-${f.key}`}
            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            step={f.type === 'number' ? 'any' : undefined}
            maxLength={f.type === 'text' ? 200 : undefined}
            value={toInputValue(f, values?.[f.key])}
            onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            className={inputClass}
          />
        </div>
      ))}
    </div>
  );
}
