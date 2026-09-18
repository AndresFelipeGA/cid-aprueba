/* ============================================
   CID Aprueba — Filterable table
   Renders a search + select/date filter bar and a table; filters client-side
   as the user types/selects, and reports the currently-visible rows.
   ============================================ */
import { useEffect, useMemo, useState } from 'react';

/**
 * @param {Object} props
 * @param {string} props.filtersId  id for the filter bar wrapper
 * @param {string} props.tableId    id for the table wrapper
 * @param {Array<{header: string, render: (row: Object) => import('react').ReactNode}>} props.columns
 * @param {Object[]} props.rows
 * @param {string} props.emptyText
 * @param {Object} [props.filters]
 * @param {{id: string, placeholder: string, label: string, fields: (row: Object) => string[]}} [props.filters.search]
 * @param {Array<{id: string, label: string, allLabel: string, options: {value:string,label:string}[], matches: (row: Object, value: string) => boolean}>} [props.filters.selects]
 * @param {{fromId: string, toId: string, fromLabel: string, toLabel: string, field: (row: Object) => string}} [props.filters.dateRange]
 * @param {(row: Object) => Object} [props.rowProps]  Extra props for each <tr>
 * @param {(visibleRows: Object[]) => void} [props.onFilterChange]
 * @param {import('react').ReactNode} [props.extraFilterContent]  Extra controls appended to the filter bar (e.g. export buttons)
 */
export default function FilterableTable({
  filtersId, tableId, columns, rows, emptyText, filters = {}, rowProps, onFilterChange, extraFilterContent,
}) {
  const [search, setSearch] = useState('');
  const [selectValues, setSelectValues] = useState({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const selects = filters.selects || [];
  const dateRange = filters.dateRange || null;

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && filters.search) {
        const haystack = filters.search.fields(row).map((v) => (v || '').toLowerCase());
        if (!haystack.some((v) => v.includes(term))) return false;
      }
      for (const sel of selects) {
        const value = selectValues[sel.id] || '';
        if (value !== '' && !sel.matches(row, value)) return false;
      }
      if (dateRange && (dateFrom || dateTo)) {
        const raw = dateRange.field(row);
        const rowDate = raw ? String(raw).slice(0, 10) : null;
        if (!rowDate) return false;
        if (dateFrom && rowDate < dateFrom) return false;
        if (dateTo && rowDate > dateTo) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, selectValues, dateFrom, dateTo]);

  useEffect(() => {
    if (onFilterChange) onFilterChange(visibleRows);
  }, [visibleRows, onFilterChange]);

  return (
    <>
      <div id={filtersId}>
        <div className="search-filters">
          {filters.search && (
            <input
              type="text"
              className="search-filters__input"
              id={filters.search.id}
              placeholder={filters.search.placeholder}
              aria-label={filters.search.label}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {selects.map((sel) => (
            <select
              key={sel.id}
              className="search-filters__select"
              id={sel.id}
              aria-label={sel.label}
              value={selectValues[sel.id] || ''}
              onChange={(e) => setSelectValues((v) => ({ ...v, [sel.id]: e.target.value }))}
            >
              <option value="">{sel.allLabel}</option>
              {sel.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
          {dateRange && (
            <div className="search-filters__date-range">
              <label className="search-filters__date-label" htmlFor={dateRange.fromId}>{dateRange.fromLabel || 'Desde'}</label>
              <input
                type="date"
                className="search-filters__date"
                id={dateRange.fromId}
                aria-label={dateRange.fromLabel || 'Desde'}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <label className="search-filters__date-label" htmlFor={dateRange.toId}>{dateRange.toLabel || 'Hasta'}</label>
              <input
                type="date"
                className="search-filters__date"
                id={dateRange.toId}
                aria-label={dateRange.toLabel || 'Hasta'}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          )}
          {extraFilterContent}
        </div>
      </div>

      <div id={tableId}>
        {visibleRows.length === 0 ? (
          <div className="table-wrap"><div className="empty empty--neutral">{emptyText}</div></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>{columns.map((c) => <th key={c.header}>{c.header}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr key={row.id ?? i} {...(rowProps ? rowProps(row) : {})}>
                    {columns.map((c) => <td key={c.header}>{c.render(row)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
