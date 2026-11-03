import { useContext } from 'react';
import { createPortal } from 'react-dom';
import ColumnPicker, { useColumnPrefs } from './ColumnPicker';
import { WidgetSlotContext } from './Widget';

// `embedded` is for a table that lives inside a scrolling <Widget>: no card chrome of its
// own, and no overflow wrapper — a nested scroll container would stop the header sticking
// to the widget body's scroll.
//
// `tableId` makes the columns user-configurable (a "Columns" picker, remembered per
// browser). It must be unique per table. Columns with no label, or `required: true`, are
// always shown.
export default function DataTable({ columns, rows, rowKey = '_id', embedded = false, tableId = null }) {
  const prefs = useColumnPrefs(tableId, columns);
  const slot = useContext(WidgetSlotContext);
  const shown = tableId ? prefs.visible : columns;

  const colClass = (col) => `${embedded ? 'px-3 py-1.5' : 'px-4 py-2'}${col.hideOnMobile ? ' max-[400px]:hidden' : ''}`;
  const table = (
    <table className="w-full text-sm text-left">
      <thead className={`${embedded ? 'sticky top-0 bg-gray-50 dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900/40'} text-gray-500 dark:text-gray-400`}>
        <tr>
          {shown.map((col) => (
            <th key={col.key} className={`${colClass(col)} font-medium whitespace-nowrap`}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody className="text-gray-700 dark:text-gray-200">
        {rows.map((row) => (
          <tr key={row[rowKey]} className="border-t border-gray-200 dark:border-gray-700">
            {shown.map((col) => (
              <td key={col.key} className={colClass(col)}>
                {col.render ? col.render(row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td className="px-4 py-6 text-center text-gray-400 dark:text-gray-500" colSpan={shown.length}>No data</td></tr>
        )}
      </tbody>
    </table>
  );

  if (embedded) {
    return (
      <>
        {tableId && slot && createPortal(<ColumnPicker prefs={prefs} />, slot)}
        {table}
      </>
    );
  }
  return (
    <div>
      {tableId && (
        <div className="flex justify-end mb-2">
          <ColumnPicker prefs={prefs} />
        </div>
      )}
      <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow overflow-x-auto">{table}</div>
    </div>
  );
}
