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
const { ZipArchive } = require('archiver');
const {
  STEP_LABELS, ROLE_NAMES, STATUS_LABELS, MAX_STEP_LEVEL, QUOTATION_DOC_TYPES, PAYMENT_DOC_TYPE, PAYMENT_DOC_LABEL, STEP_TO_ROLE_MAP,
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
const roleNameForStep = (step) => roleName(STEP_TO_ROLE_MAP[step]);
const formatCurrency = (n) => `$ ${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const formatDate = (d) => (d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
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

  let page = doc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;
  const width = PAGE_SIZE[0] - MARGIN * 2;

  const ensureSpace = (needed) => {
    if (y - needed < MARGIN) {
      page = doc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  };

  const draw = (text, { size = 10, useFont = font, gap = 14, color = rgb(0.1, 0.1, 0.1) } = {}) => {
    for (const line of wrapText(useFont, text, size, width)) {
      ensureSpace(gap);
      page.drawText(line, { x: MARGIN, y, size, font: useFont, color });
      y -= gap;
    }
  };

  const heading = (text) => {
    y -= 6;
    ensureSpace(24);
    draw(text, { size: 13, useFont: bold, gap: 18, color: rgb(0.24, 0.35, 0.12) });
    y -= 2;
  };

  const logo = await embedLogo(doc, 84);
  page.drawImage(logo.img, { x: MARGIN, y: y - logo.height, width: logo.width, height: logo.height });
  page.drawText('Acta de Aprobación', { x: MARGIN + logo.width + 16, y: y - 20, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(requisition.number || `#${requisition.id}`, { x: MARGIN + logo.width + 16, y: y - 40, size: 11, font: bold, color: rgb(0.79, 0.35, 0.16) });
  y -= logo.height + 14;

  heading('Datos generales');
  const projectText = requisition.project_name
    ? `${requisition.project_name}${requisition.project_code ? ` (${requisition.project_code})` : ''}`
    : 'Sin proyecto';
  draw(`Requisición: ${requisition.title}`);
  draw(`Proyecto: ${projectText}`);
  if (requisition.budget_cap) draw(`Presupuesto Máximo: ${formatCurrency(requisition.budget_cap)}`);
  draw(`Versión del documento: v${requisition.version || 1} — ${requisition.original_filename}`);
  draw(`Radicada por: ${requisition.uploader_name}${requisition.uploader_territory ? ` (${requisition.uploader_territory})` : ''}`);
  draw(`Fecha de radicación: ${formatDate(requisition.created_at)}`);
  draw(`Fecha de aprobación final: ${formatDate(finalLog ? finalLog.created_at : requisition.updated_at)}`);
  if (requisition.selected_provider_name) {
    draw(`Proveedor seleccionado: ${requisition.selected_provider_name} — ${formatCurrency(requisition.selected_amount)}`);
  }
  draw(`Estado: ${STATUS_LABELS[requisition.status] || requisition.status}`);
  if (requisition.description) draw(`Descripción: ${requisition.description}`);

  heading('Ruta de aprobación');
  for (let level = 1; level <= MAX_STEP_LEVEL; level++) {
    const step = steps.find((s) => s.step_level === level);
    const log = step ? completionLog(step) : null;
    const line = log
      ? `${level}. ${STEP_LABELS[level]} (${roleNameForStep(level)}) — ${log.user_name} · ${formatDate(log.created_at)}`
      : `${level}. ${STEP_LABELS[level]} (${roleNameForStep(level)}) — pendiente`;
    draw(line);
    if (log && log.comments) draw(`   "${log.comments}"`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
  }

  const returns = logs.filter((l) => l.action === 'returned');
  if (returns.length > 0) {
    heading('Devoluciones');
    for (const log of [...returns].reverse()) {
      const step = steps.find((s) => s.id === log.approval_step_id);
      const from = step ? STEP_LABELS[step.step_level] : '—';
      const to = log.to_level ? `Paso ${log.to_level} — ${STEP_LABELS[log.to_level]}` : '—';
      draw(`${formatDate(log.created_at)} — ${log.user_name}: de "${from}" a "${to}"`);
      if (log.comments) draw(`   Motivo: ${log.comments}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
    }
  }

  if (quotations.length > 0) {
    heading('Cotizaciones evaluadas');
    const sorted = [...quotations].sort((a, b) => Number(a.amount) - Number(b.amount));
    for (const q of sorted) {
      const selected = q.status === 'selected' || q.id === requisition.selected_quotation_id;
      draw(`${q.provider_name} — ${formatCurrency(q.amount)}${selected ? '  [Seleccionada]' : ''}`);
    }
  }

  const seen = new Set();
  const signers = [];
  for (let level = 1; level <= MAX_STEP_LEVEL; level++) {
    const step = steps.find((s) => s.step_level === level);
    const log = step ? completionLog(step) : null;
    if (!log || seen.has(log.user_id)) continue;
    seen.add(log.user_id);
    signers.push(`${log.user_name} — ${roleName(log.user_role_level)}`);
  }
  if (signers.length > 0) {
    heading('Firmas');
    for (const s of signers) draw(s);
  }

  y -= 10;
  draw(`Documento generado por CID Aprueba el ${formatDate(new Date().toISOString())}.`, { size: 8, color: rgb(0.5, 0.5, 0.5) });

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

/** Selected quotation's four required provider documents, in a stable order. */
function selectedProviderDocs(requisition) {
  const selected = (requisition.quotations || []).find((q) => q.id === requisition.selected_quotation_id);
  if (!selected) return { provider: null, docs: [] };
  const docs = Object.entries(QUOTATION_DOC_TYPES)
    .map(([key, label]) => ({ label, doc: (selected.documents || []).find((d) => d.doc_type === key) }))
    .filter((d) => d.doc);
  const payment = (selected.documents || []).find((d) => d.doc_type === PAYMENT_DOC_TYPE);
  return { provider: selected, docs, payment };
}

/** Cover + requisition file + payment proof + the winning provider's documents, merged into one PDF. */
async function buildConsolidatedActaPdf(requisition) {
  const coverBytes = await buildActaCoverPdf(requisition);
  const doc = await PDFDocument.load(coverBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  await appendFile(doc, font, bold, 'Requisición Original', requisition.file_path, requisition.original_filename);

  const { docs, payment } = selectedProviderDocs(requisition);
  if (payment) {
    await appendFile(doc, font, bold, PAYMENT_DOC_LABEL, payment.file_path, payment.original_filename);
  }
  for (const { label, doc: providerDoc } of docs) {
    await appendFile(doc, font, bold, `Proveedor — ${label}`, providerDoc.file_path, providerDoc.original_filename);
  }

  return Buffer.from(await doc.save());
}

/** Same documents as the consolidated PDF, but kept as separate files inside a ZIP. */
function buildActaZipStream(requisition, coverPdfBuffer) {
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

  const { docs, payment } = selectedProviderDocs(requisition);
  if (payment) addIfExists('02', 'comprobante-pago', payment.file_path, payment.original_filename);
  docs.forEach(({ label, doc: providerDoc }, i) => {
    addIfExists(String(3 + i).padStart(2, '0'), label, providerDoc.file_path, providerDoc.original_filename);
  });

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
