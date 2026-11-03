export default function StatCard({ label, value, compact = false }) {
  return (
    <div className={`bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow ${compact ? 'px-3 py-2' : 'p-4'}`}>
      <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{label}</div>
      <div className={`${compact ? 'text-xl' : 'text-2xl'} font-extrabold tracking-tight text-gray-900 dark:text-gray-100`}>{value}</div>
    </div>
  );
}
