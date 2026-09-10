/**
 * Minimal CSV writer for exports. Emits a UTF-8 BOM so Excel opens accents
 * correctly, uses ; as separator (Excel default in es-CO locales) and CRLF.
 *
 * @module utils/csv
 */

const SEPARATOR = ';';

const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[";\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * @param {Array<{ key: string, header: string, format?: (row: object) => unknown }>} columns
 * @param {object[]} rows
 * @returns {string}
 */
const toCsv = (columns, rows) => {
  const lines = [columns.map((c) => escapeCell(c.header)).join(SEPARATOR)];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.format ? c.format(row) : row[c.key])).join(SEPARATOR));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
};

/** Send a CSV string as a download. */
const sendCsv = (res, filename, csv) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
};

module.exports = { toCsv, sendCsv };
