/**
 * Server-side acta generation: a standalone cover PDF (facts, approval route,
 * signatures) and two derived artifacts —
 *   - a consolidated PDF: cover + requisition file + payment proof + the
 *     selected provider's documents, all merged into one file.
 *   - a ZIP with the same documents kept as separate files.
 *
 * Pure-JS (pdf-lib + archiver): no native deps, no headless browser.
 *
 * @module utils/actaPdf
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const {
  STEP_LABELS, ROLE_NAMES, STATUS_LABELS, MAX_STEP_LEVEL, QUOTATION_DOC_TYPES, OPTIONAL_QUOTATION_DOC_TYPES,
  FINAL_PURCHASE_DOC_TYPES, DELIVERY_DOC_TYPES, PAYMENT_DOC_TYPE, PAYMENT_DOC_LABEL,
  FINAL_PAYMENT_DOC_TYPE, FINAL_PAYMENT_DOC_LABEL, rolesForStep,
} = require('../config/workflow');

const PAGE_SIZE = [595.28, 841.89]; // A4 in points
const PAGE_SIZE_LANDSCAPE = [841.89, 595.28];
const MARGIN = 50;
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png']);
const LOGO_BYTES = fs.readFileSync(path.join(__dirname, '../assets/logo-cid.png'));

/** Embeds the CID logo and returns it sized to `width` points wide. */
async function embedLogo(doc, width = 90) {
  const img = await doc.embedPng(LOGO_BYTES);
  const scale = width / img.width;
  return { img, width, height: img.height * scale };
}

/** Trims text with an ellipsis so it fits `maxWidth` at `size`. */
function truncate(font, text, size, maxWidth) {
  const str = String(text);
  if (font.widthOfTextAtSize(str, size) <= maxWidth) return str;
  let t = str;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

const roleName = (roleLevel) => (ROLE_NAMES[roleLevel] || {}).default || `Nivel ${roleLevel}`;
const roleNameForStep = (step) => rolesForStep(step).map(roleName).join(' y ');
const formatCurrency = (n) => `$ ${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const formatDate = (d) => (d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
/** For plain calendar dates (no time component), e.g. when a quotation was actually issued. */
const formatDateOnly = (d) => (d ? new Date(d).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : '—');
const COMPLETION_ACTIONS = new Set(['approved', 'uploaded', 'resubmitted']);

/** Minimal word-wrap for a fixed-width text block. */
function wrapText(font, text, size, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(attempt, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const HEADING_COLOR = rgb(0.24, 0.35, 0.12);
const MUTED_COLOR = rgb(0.45, 0.45, 0.45);
const TEXT_COLOR = rgb(0.15, 0.15, 0.15);
const BORDER_COLOR = rgb(0.87, 0.84, 0.78);
const HEADER_FILL = rgb(0.95, 0.93, 0.88);

/** Builds the acta cover document (facts, approval route, returns, quotations, signatures). */
async function buildActaCoverPdf(requisition) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const steps = requisition.approval_steps || [];
  const logs = requisition.approval_logs || [];
  const quotations = requisition.quotations || [];
  const finalLog = logs.find((l) => l.action === 'approved') || null;
  const completionLog = (step) => logs.find((l) => l.approval_step_id === step.id && COMPLETION_ACTIONS.has(l.action)) || null;
  // Step 12 (closure) can have two completion logs — one per approver — where every other step has at most one.
  const completionLogs = (step) => logs.filter((l) => l.approval_step_id === step.id && COMPLETION_ACTIONS.has(l.action));

  let page = doc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;
  const width = PAGE_SIZE[0] - MARGIN * 2;

  const ensureSpace = (needed) => {
    if (y - needed < MARGIN) {
      page = doc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  };

  const heading = (text) => {
    y -= 8;
    ensureSpace(20);
    page.drawText(text.toUpperCase(), { x: MARGIN, y, size: 11, font: bold, color: HEADING_COLOR });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.75, color: HEADING_COLOR });
    y -= 14;
  };

  /** Two-column label/value grid, like the HTML acta's <dl class="acta__facts">. */
  const factsGrid = (pairs) => {
    const colWidth = width / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      const rowPairs = pairs.slice(i, i + 2);
      ensureSpace(30);
      rowPairs.forEach(([label], col) => {
        page.drawText(label, { x: MARGIN + col * colWidth, y, size: 8, font: bold, color: MUTED_COLOR });
      });
      y -= 12;
      rowPairs.forEach(([, value], col) => {
        const text = truncate(font, value, 10, colWidth - 14);
        page.drawText(text, { x: MARGIN + col * colWidth, y, size: 10, font, color: TEXT_COLOR });
      });
      y -= 18;
    }
  };

  const paragraph = (text, { size = 9.5, color = TEXT_COLOR } = {}) => {
    for (const line of wrapText(font, text, size, width)) {
      ensureSpace(14);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= 13;
    }
  };

  /** A simple bordered table: header row + body rows, columns sized in points. */
  const table = (columns, rows) => {
    const rowHeight = 20;
    ensureSpace(rowHeight + 4);
    let x = MARGIN;
    page.drawRectangle({ x: MARGIN, y: y - rowHeight + 6, width, height: rowHeight, color: HEADER_FILL });
    for (const col of columns) {
      page.drawText(col.label, { x: x + 5, y: y - 8, size: 8, font: bold, color: rgb(0.2, 0.2, 0.2) });
      x += col.width;
    }
    y -= rowHeight;

    for (const row of rows) {
      const lines = columns.map((col) => wrapText(font, col.get(row) ?? '—', 8, col.width - 10));
      const lineCount = Math.max(1, ...lines.map((l) => l.length));
      const cellHeight = Math.max(rowHeight, lineCount * 11 + 8);
      ensureSpace(cellHeight);
      x = MARGIN;
      columns.forEach((col, i) => {
        lines[i].forEach((line, li) => {
          page.drawText(line, { x: x + 5, y: y - 9 - li * 11, size: 8, font, color: TEXT_COLOR });
        });
        x += col.width;
      });
      page.drawLine({ start: { x: MARGIN, y: y - cellHeight + 6 }, end: { x: MARGIN + width, y: y - cellHeight + 6 }, thickness: 0.5, color: BORDER_COLOR });
      y -= cellHeight;
    }
    y -= 12;
  };

  const logo = await embedLogo(doc, 84);
  page.drawImage(logo.img, { x: MARGIN, y: y - logo.height, width: logo.width, height: logo.height });
  page.drawText('Acta de Aprobación', { x: MARGIN + logo.width + 16, y: y - 22, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(requisition.number || `#${requisition.id}`, { x: MARGIN + logo.width + 16, y: y - 42, size: 11, font: bold, color: rgb(0.79, 0.35, 0.16) });
  y -= Math.max(logo.height, 50);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 1.25, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;

  const projectText = requisition.project_name
    ? `${requisition.project_name}${requisition.project_code ? ` (${requisition.project_code})` : ''}`
    : 'Sin proyecto';
  const facts = [['Requisición', requisition.title], ['Proyecto', projectText]];
  if (requisition.budget_cap) facts.push(['Presupuesto Máximo', formatCurrency(requisition.budget_cap)]);
  facts.push(['Versión del documento', `v${requisition.version || 1} — ${requisition.original_filename}`]);
  facts.push(['Radicada por', `${requisition.uploader_name}${requisition.uploader_territory ? ` (${requisition.uploader_territory})` : ''}`]);
  facts.push(['Fecha de radicación', formatDate(requisition.created_at)]);
  facts.push(['Fecha de aprobación final', formatDate(finalLog ? finalLog.created_at : requisition.updated_at)]);
  if (requisition.selected_provider_name) {
    facts.push(['Proveedor seleccionado', `${requisition.selected_provider_name} — ${formatCurrency(requisition.selected_amount)}`]);
  }
  facts.push(['Estado', STATUS_LABELS[requisition.status] || requisition.status]);
  factsGrid(facts);
  if (requisition.description) paragraph(requisition.description);

  heading('Ruta de aprobación');
  table(
    [
      { label: '#', width: 20, get: (r) => String(r.level) },
      { label: 'Paso', width: 110, get: (r) => r.paso },
      { label: 'Rol', width: 90, get: (r) => r.rol },
      { label: 'Aprobado por', width: 100, get: (r) => r.por },
      { label: 'Fecha', width: 100, get: (r) => r.fecha },
      { label: 'Comentarios', width: width - 420, get: (r) => r.comentarios },
    ],
    Array.from({ length: MAX_STEP_LEVEL }, (_, i) => {
      const level = i + 1;
      const step = steps.find((s) => s.step_level === level);
      const stepLogs = step ? completionLogs(step) : [];
      return {
        level,
        paso: STEP_LABELS[level],
        rol: roleNameForStep(level),
        por: stepLogs.length ? stepLogs.map((l) => l.user_name).join(' y ') : '—',
        fecha: stepLogs.length ? formatDate(stepLogs[0].created_at) : '—',
        comentarios: stepLogs.map((l) => l.comments).filter(Boolean).join(' / '),
      };
    }),
  );

  const returns = logs.filter((l) => l.action === 'returned');
  if (returns.length > 0) {
    heading('Devoluciones');
    table(
      [
        { label: 'Fecha', width: 100, get: (r) => r.fecha },
        { label: 'Devuelta desde', width: 120, get: (r) => r.desde },
        { label: 'Hacia', width: 120, get: (r) => r.hacia },
        { label: 'Por', width: 90, get: (r) => r.por },
        { label: 'Motivo', width: width - 430, get: (r) => r.motivo },
      ],
      [...returns].reverse().map((log) => {
        const step = steps.find((s) => s.id === log.approval_step_id);
        return {
          fecha: formatDate(log.created_at),
          desde: step ? STEP_LABELS[step.step_level] : '—',
          hacia: log.to_level ? `Paso ${log.to_level} — ${STEP_LABELS[log.to_level]}` : '—',
          por: log.user_name,
          motivo: log.comments || '',
        };
      }),
    );
  }

  if (quotations.length > 0) {
    heading('Cotizaciones evaluadas');
    const requiredDocs = Object.keys(QUOTATION_DOC_TYPES);
    const sorted = [...quotations].sort((a, b) => Number(a.amount) - Number(b.amount));
    table(
      [
        { label: 'Proveedor', width: 140, get: (r) => r.proveedor },
        { label: 'Fecha cotización', width: 85, get: (r) => r.fecha },
        { label: 'Monto', width: 90, get: (r) => r.monto },
        { label: 'Documentación', width: 90, get: (r) => r.docs },
        { label: 'Notas', width: width - 405, get: (r) => r.notas },
      ],
      sorted.map((q) => {
        const isSelected = q.status === 'selected' || q.id === requisition.selected_quotation_id;
        const complete = requiredDocs.every((dt) => (q.documents || []).some((d) => d.doc_type === dt));
        return {
          proveedor: `${q.provider_name}${isSelected ? ' (Seleccionada)' : ''}`,
          fecha: formatDateOnly(q.quotation_date),
          monto: formatCurrency(q.amount),
          docs: complete ? 'Completa' : 'Incompleta',
          notas: q.notes || '',
        };
      }),
    );
  }

  const seen = new Set();
  const signers = [];
  for (let level = 1; level <= MAX_STEP_LEVEL; level++) {
    const step = steps.find((s) => s.step_level === level);
    if (!step) continue;
    for (const log of completionLogs(step)) {
      if (seen.has(log.user_id)) continue;
      seen.add(log.user_id);
      signers.push({ name: log.user_name, role: roleName(log.user_role_level) });
    }
  }
  if (signers.length > 0) {
    heading('Firmas');
    const perRow = 3;
    const colWidth = width / perRow;
    const rowHeight = 58;
    for (let i = 0; i < signers.length; i += perRow) {
      const rowSigners = signers.slice(i, i + perRow);
      ensureSpace(rowHeight);
      const lineY = y - 24;
      rowSigners.forEach((signer, col) => {
        const x = MARGIN + col * colWidth;
        page.drawLine({ start: { x, y: lineY }, end: { x: x + colWidth - 20, y: lineY }, thickness: 0.75, color: rgb(0.3, 0.3, 0.3) });
        page.drawText(truncate(bold, signer.name, 9.5, colWidth - 24), { x, y: lineY - 12, size: 9.5, font: bold, color: TEXT_COLOR });
        page.drawText(truncate(font, signer.role, 8.5, colWidth - 24), { x, y: lineY - 24, size: 8.5, font, color: MUTED_COLOR });
      });
      y -= rowHeight;
    }
  }

  y -= 10;
  ensureSpace(14);
  page.drawText(`Documento generado por CID Aprueba el ${formatDate(new Date().toISOString())}.`, { x: MARGIN, y, size: 8, font, color: rgb(0.55, 0.55, 0.55) });

  return Buffer.from(await doc.save());
}

/** Appends a section title page, then the file's pages/image (or a placeholder note if not renderable). */
async function appendFile(doc, font, bold, sectionTitle, filePath, originalFilename) {
  const page = doc.addPage(PAGE_SIZE);
  page.drawText(sectionTitle, { x: MARGIN, y: PAGE_SIZE[1] - MARGIN - 20, size: 14, font: bold, color: rgb(0.24, 0.35, 0.12) });
  page.drawText(originalFilename || '', { x: MARGIN, y: PAGE_SIZE[1] - MARGIN - 42, size: 10, font, color: rgb(0.4, 0.4, 0.4) });

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    page.drawText('(Archivo no encontrado en el servidor)', { x: MARGIN, y: PAGE_SIZE[1] - MARGIN - 64, size: 10, font, color: rgb(0.7, 0.2, 0.2) });
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  try {
    if (ext === '.pdf') {
      const bytes = fs.readFileSync(resolved);
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copied = await doc.copyPages(src, src.getPageIndices());
      copied.forEach((p) => doc.addPage(p));
    } else if (IMAGE_EXTS.has(ext)) {
      const bytes = fs.readFileSync(resolved);
      const img = ext === '.png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const maxW = PAGE_SIZE[0] - MARGIN * 2;
      const maxH = PAGE_SIZE[1] - MARGIN * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      const imgPage = doc.addPage(PAGE_SIZE);
      imgPage.drawImage(img, { x: (PAGE_SIZE[0] - w) / 2, y: (PAGE_SIZE[1] - h) / 2, width: w, height: h });
    } else {
      page.drawText('Este formato no se puede incrustar en el PDF combinado.', { x: MARGIN, y: PAGE_SIZE[1] - MARGIN - 64, size: 10, font });
      page.drawText('El archivo original está disponible en el expediente (.zip).', { x: MARGIN, y: PAGE_SIZE[1] - MARGIN - 80, size: 10, font });
    }
  } catch (_err) {
    page.drawText('No se pudo leer este archivo para incluirlo en el PDF combinado.', { x: MARGIN, y: PAGE_SIZE[1] - MARGIN - 64, size: 10, font, color: rgb(0.7, 0.2, 0.2) });
  }
}

/** Selected quotation's required + optional provider documents that were actually attached, in a stable order. */
function selectedProviderDocs(requisition) {
  const selected = (requisition.quotations || []).find((q) => q.id === requisition.selected_quotation_id);
  if (!selected) return { provider: null, docs: [], payment: null, finalPayment: null };
  const docs = Object.entries({
    ...QUOTATION_DOC_TYPES, ...OPTIONAL_QUOTATION_DOC_TYPES, ...FINAL_PURCHASE_DOC_TYPES, ...DELIVERY_DOC_TYPES,
  })
    .map(([key, label]) => ({ label, doc: (selected.documents || []).find((d) => d.doc_type === key) }))
    .filter((d) => d.doc);
  const payment = (selected.documents || []).find((d) => d.doc_type === PAYMENT_DOC_TYPE);
  const finalPayment = (selected.documents || []).find((d) => d.doc_type === FINAL_PAYMENT_DOC_TYPE);
  return { provider: selected, docs, payment, finalPayment };
}

/** Cover + requisition file + payment proof + the winning provider's documents, merged into one PDF. */
async function buildConsolidatedActaPdf(requisition) {
  const coverBytes = await buildActaCoverPdf(requisition);
  const doc = await PDFDocument.load(coverBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  await appendFile(doc, font, bold, 'Requisición Original', requisition.file_path, requisition.original_filename);

  const { docs, payment, finalPayment } = selectedProviderDocs(requisition);
  if (payment) {
    await appendFile(doc, font, bold, PAYMENT_DOC_LABEL, payment.file_path, payment.original_filename);
  }
  for (const { label, doc: providerDoc } of docs) {
    await appendFile(doc, font, bold, `Proveedor — ${label}`, providerDoc.file_path, providerDoc.original_filename);
  }
  if (finalPayment) {
    await appendFile(doc, font, bold, FINAL_PAYMENT_DOC_LABEL, finalPayment.file_path, finalPayment.original_filename);
  }
  if (requisition.closure_listing_file_path) {
    await appendFile(doc, font, bold, 'Listado de Cierre', requisition.closure_listing_file_path, requisition.closure_listing_original_filename);
  }
  if (requisition.closure_minutes_file_path) {
    await appendFile(doc, font, bold, 'Acta de Cierre', requisition.closure_minutes_file_path, requisition.closure_minutes_original_filename);
  }

  return Buffer.from(await doc.save());
}

/** Same documents as the consolidated PDF, but kept as separate files inside a ZIP. */
async function buildActaZipStream(requisition, coverPdfBuffer) {
  // archiver v8 ships ESM-only; this file is CommonJS, so it must be loaded lazily.
  const { ZipArchive } = await import('archiver');
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const number = requisition.number || `req-${requisition.id}`;
  const safe = (name) => String(name).replace(/[/\\?%*:|"<>]/g, '-');

  archive.append(coverPdfBuffer, { name: `00-acta-${safe(number)}.pdf` });

  const addIfExists = (index, label, filePath, originalFilename) => {
    if (!filePath || !fs.existsSync(path.resolve(filePath))) return;
    const ext = path.extname(originalFilename || filePath) || '';
    archive.file(path.resolve(filePath), { name: `${index}-${safe(label)}${ext}` });
  };

  addIfExists('01', 'requisicion', requisition.file_path, requisition.original_filename);

  const { docs, payment, finalPayment } = selectedProviderDocs(requisition);
  if (payment) addIfExists('02', 'comprobante-pago-anticipo', payment.file_path, payment.original_filename);
  docs.forEach(({ label, doc: providerDoc }, i) => {
    addIfExists(String(3 + i).padStart(2, '0'), label, providerDoc.file_path, providerDoc.original_filename);
  });
  if (finalPayment) addIfExists('90', 'comprobante-pago-saldo-final', finalPayment.file_path, finalPayment.original_filename);
  if (requisition.closure_listing_file_path) {
    addIfExists('91', 'listado-cierre', requisition.closure_listing_file_path, requisition.closure_listing_original_filename);
  }
  if (requisition.closure_minutes_file_path) {
    addIfExists('92', 'acta-cierre', requisition.closure_minutes_file_path, requisition.closure_minutes_original_filename);
  }

  archive.finalize();
  return archive;
}

const REPORT_COLUMNS = [
  { label: 'Número', width: 68, get: (r) => r.number || `#${r.id}` },
  { label: 'Título', width: 150, get: (r) => r.title },
  { label: 'Proyecto', width: 90, get: (r) => r.project_name || '—' },
  { label: 'Estado', width: 65, get: (r) => STATUS_LABELS[r.status] || r.status },
  { label: 'Etapa', width: 118, get: (r) => STEP_LABELS[r.current_approval_level] || (r.status === 'approved' ? 'Finalizada' : String(r.current_approval_level)) },
  { label: 'Territorio', width: 62, get: (r) => r.uploader_territory || '—' },
  { label: 'Proveedor', width: 90, get: (r) => r.selected_provider_name || '—' },
  { label: 'Monto', width: 70, get: (r) => (r.selected_amount ? formatCurrency(r.selected_amount) : '—') },
  { label: 'Radicada', width: 68, get: (r) => formatDate(r.created_at).split(',')[0] },
];

/** A branded, paginated report of requisitions — same row set as the CSV export, styled like the acta. */
async function buildRequisitionsReportPdf(rows) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, 84);

  const [pageW, pageH] = PAGE_SIZE_LANDSCAPE;
  const tableWidth = REPORT_COLUMNS.reduce((sum, c) => sum + c.width, 0);
  const rowHeight = 18;
  let page;
  let y;

  const drawHeader = () => {
    page.drawImage(logo.img, { x: MARGIN, y: pageH - MARGIN - logo.height, width: logo.width, height: logo.height });
    const textX = MARGIN + logo.width + 16;
    page.drawText('Reporte de Requisiciones', { x: textX, y: pageH - MARGIN - 20, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(
      `Generado el ${formatDate(new Date().toISOString())} · ${rows.length} requisición(es)`,
      { x: textX, y: pageH - MARGIN - 38, size: 9, font, color: rgb(0.45, 0.45, 0.45) },
    );
    y = pageH - MARGIN - logo.height - 16;

    let x = MARGIN;
    page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: tableWidth, height: rowHeight, color: rgb(0.95, 0.93, 0.88) });
    for (const col of REPORT_COLUMNS) {
      page.drawText(col.label, { x: x + 4, y: y - 10, size: 8.5, font: bold, color: rgb(0.2, 0.2, 0.2) });
      x += col.width;
    }
    y -= rowHeight;
  };

  const newPage = () => {
    page = doc.addPage([pageW, pageH]);
    drawHeader();
  };

  newPage();

  for (const row of rows) {
    if (y - rowHeight < MARGIN) newPage();

    let x = MARGIN;
    for (const col of REPORT_COLUMNS) {
      const text = truncate(font, col.get(row) ?? '—', 8, col.width - 8);
      page.drawText(text, { x: x + 4, y: y - 11, size: 8, font, color: rgb(0.15, 0.15, 0.15) });
      x += col.width;
    }
    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight + 4 },
      end: { x: MARGIN + tableWidth, y: y - rowHeight + 4 },
      thickness: 0.5,
      color: rgb(0.87, 0.84, 0.78),
    });
    y -= rowHeight;
  }

  if (rows.length === 0) {
    page.drawText('No hay requisiciones que coincidan con los filtros aplicados.', { x: MARGIN, y: y - 4, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  }

  return Buffer.from(await doc.save());
}

module.exports = { buildActaCoverPdf, buildConsolidatedActaPdf, buildActaZipStream, buildRequisitionsReportPdf };
