export default function DataTable({ columns, rows, rowKey = '_id' }) {
  const colClass = (col) => `px-4 py-2${col.hideOnMobile ? ' max-[400px]:hidden' : ''}`;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`${colClass(col)} font-medium`}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-gray-700 dark:text-gray-200">
          {rows.map((row) => (
            <tr key={row[rowKey]} className="border-t border-gray-200 dark:border-gray-700">
              {columns.map((col) => (
                <td key={col.key} className={colClass(col)}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className="px-4 py-6 text-center text-gray-400 dark:text-gray-500" colSpan={columns.length}>No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
