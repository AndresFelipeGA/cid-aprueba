/* ============================================
   CID Aprueba — Acta de aprobación (printable)
   #/requisitions/:id/acta
   ============================================ */
import { useEffect, useState } from 'react';
import Loading from '../components/Loading.jsx';
import { useNavigate, useParams } from 'react-router-dom';
import * as API from '../api.js';
import { useMeta } from '../context/MetaContext.jsx';
import { usePageTitle } from '../context/PageTitleContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate, formatCurrency } from '../utils/format.js';

const COMPLETION_ACTIONS = new Set(['approved', 'uploaded', 'resubmitted']);

function completionLog(step, logs) {
  return logs.find((l) => l.approval_step_id === step.id && COMPLETION_ACTIONS.has(l.action)) || null;
}

function StepsTable({ steps, logs }) {
  const { stepLabel, roleNameForStep, maxStep } = useMeta();
  const rows = [];
  for (let level = 1; level <= maxStep(); level++) {
    const step = steps.find((s) => s.step_level === level);
    const log = step ? completionLog(step, logs) : null;
    rows.push(
      <tr key={level}>
        <td className="acta__step-no">{level}</td>
        <td>{stepLabel(level)}</td>
        <td>{roleNameForStep(level, log ? log.user_gender : null)}</td>
        <td>{log ? log.user_name : '—'}</td>
        <td>{log ? formatDate(log.created_at) : '—'}</td>
        <td className="acta__comments">{log && log.comments ? log.comments : ''}</td>
      </tr>,
    );
  }
  return (
    <table className="acta__table">
      <thead><tr><th>#</th><th>Paso</th><th>Rol</th><th>Aprobado por</th><th>Fecha</th><th>Comentarios</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

function Returns({ steps, logs }) {
  const { stepLabel } = useMeta();
  const returns = logs.filter((l) => l.action === 'returned');
  if (returns.length === 0) return null;
  const ordered = [...returns].reverse();
  return (
    <section className="acta__section">
      <h3 className="acta__section-title">Devoluciones</h3>
      <table className="acta__table">
        <thead><tr><th>Fecha</th><th>Devuelta desde</th><th>Hacia</th><th>Por</th><th>Motivo</th></tr></thead>
        <tbody>
          {ordered.map((log, i) => {
            const step = steps.find((s) => s.id === log.approval_step_id);
            const from = step ? stepLabel(step.step_level) : '—';
            return (
              <tr key={i}>
                <td>{formatDate(log.created_at)}</td>
                <td>{from}</td>
                <td>{log.to_level ? `Paso ${log.to_level} — ${stepLabel(log.to_level)}` : '—'}</td>
                <td>{log.user_name}</td>
                <td className="acta__comments">{log.comments || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Quotations({ requisition, quotations }) {
  const { docTypes } = useMeta();
  if (quotations.length === 0) return null;
  const sorted = [...quotations].sort((a, b) => Number(a.amount) - Number(b.amount));
  return (
    <section className="acta__section">
      <h3 className="acta__section-title">Cotizaciones evaluadas</h3>
      <table className="acta__table">
        <thead><tr><th>Proveedor</th><th>Monto</th><th>Documentación</th><th>Notas</th></tr></thead>
        <tbody>
          {sorted.map((q) => {
            const selected = q.status === 'selected' || q.id === requisition.selected_quotation_id;
            const docs = q.documents || [];
            const complete = docTypes().every((dt) => docs.some((d) => d.doc_type === dt.key));
            return (
              <tr key={q.id} className={selected ? 'acta__row--selected' : ''}>
                <td>{q.provider_name}{selected && <span className="acta__selected-tag"> Seleccionada</span>}</td>
                <td className="acta__amount">{formatCurrency(q.amount)}</td>
                <td>{complete ? 'Completa' : 'Incompleta'}</td>
                <td className="acta__comments">{q.notes || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Signatures({ steps, logs }) {
  const { roleName, maxStep } = useMeta();
  const seen = new Set();
  const signers = [];
  for (let level = 1; level <= maxStep(); level++) {
    const step = steps.find((s) => s.step_level === level);
    const log = step ? completionLog(step, logs) : null;
    if (!log || seen.has(log.user_id)) continue;
    seen.add(log.user_id);
    signers.push({ name: log.user_name, role: roleName(log.user_role_level, log.user_gender) });
  }
  if (signers.length === 0) return null;
  return (
    <section className="acta__section acta__section--signatures">
      <h3 className="acta__section-title">Firmas</h3>
      <div className="acta__signatures">
        {signers.map((s, i) => (
          <div className="acta__signature" key={i}>
            <div className="acta__signature-line" />
            <div className="acta__signature-name">{s.name}</div>
            <div className="acta__signature-role">{s.role}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function downloadWith(setBusy, busyLabel, fn, id, showToast) {
  setBusy(busyLabel);
  try {
    await fn(id);
  } catch (err) {
    showToast(err.message || 'No se pudo generar el archivo', 'error');
  } finally {
    setBusy(null);
  }
}

export default function Acta() {
  usePageTitle('Acta de aprobación');
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { statusLabel } = useMeta();
  const [requisition, setRequisition] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  useEffect(() => {
    let cancelled = false;
    API.getRequisition(id).then((result) => {
      if (!cancelled) setRequisition(result.data.requisition);
    });
    return () => { cancelled = true; };
  }, [id]);

  if (!requisition) return <Loading />;

  const backHref = `/requisitions/${requisition.id}`;
  const number = requisition.number || `#${requisition.id}`;

  if (requisition.status !== 'approved') {
    return (
      <>
        <a href={`/#${backHref}`} className="back-link" onClick={(e) => { e.preventDefault(); navigate(backHref); }}>&larr; Volver a la requisición</a>
        <div className="alert alert--warning acta-notice">
          El acta de aprobación solo está disponible para requisiciones aprobadas.
          La requisición <strong>{number}</strong> se encuentra en estado <strong>{statusLabel(requisition.status)}</strong>.
        </div>
      </>
    );
  }

  const steps = requisition.approval_steps || [];
  const logs = requisition.approval_logs || [];
  const quotations = requisition.quotations || [];
  const finalLog = logs.find((l) => l.action === 'approved') || null;
  const approvedAt = finalLog ? finalLog.created_at : requisition.updated_at;
  const projectText = requisition.project_name
    ? `${requisition.project_name}${requisition.project_code ? ` (${requisition.project_code})` : ''}`
    : 'Sin proyecto';

  return (
    <>
      <div className="acta-toolbar">
        <a href={`/#${backHref}`} className="back-link" onClick={(e) => { e.preventDefault(); navigate(backHref); }}>&larr; Volver a la requisición</a>
        <div className="acta-toolbar__actions">
          <button className="btn btn--outline" onClick={() => navigate(backHref)}>Volver</button>
          <button className="btn btn--primary" id="btn-print-acta" onClick={() => window.print()}>Imprimir / Guardar como PDF</button>
          <button
            className="btn btn--secondary"
            id="btn-acta-consolidada"
            title="Un solo PDF: acta + requisición + comprobante de pago + documentos del proveedor"
            disabled={busyAction === 'consolidada'}
            onClick={() => downloadWith(setBusyAction, 'consolidada', API.downloadActaConsolidada, requisition.id, showToast)}
          >
            {busyAction === 'consolidada' ? 'Generando...' : '📎 Acta Consolidada'}
          </button>
          <button
            className="btn btn--outline"
            id="btn-expediente"
            title="Los mismos documentos, cada uno por separado, en un .zip"
            disabled={busyAction === 'expediente'}
            onClick={() => downloadWith(setBusyAction, 'expediente', API.downloadExpediente, requisition.id, showToast)}
          >
            {busyAction === 'expediente' ? 'Comprimiendo...' : '🗂️ Expediente Completo'}
          </button>
        </div>
      </div>

      <article className="acta" id="acta">
        <header className="acta__header">
          <img src="/assets/logo-LA-CID.svg" alt="CID - Corporación Infancia y Desarrollo" className="acta__logo" />
          <div className="acta__heading">
            <h2 className="acta__title">Acta de aprobación</h2>
            <div className="acta__number">{number}</div>
          </div>
        </header>

        <section className="acta__section">
          <dl className="acta__facts">
            <div><dt>Requisición</dt><dd>{requisition.title}</dd></div>
            <div><dt>Proyecto</dt><dd>{projectText}</dd></div>
            {requisition.budget_cap && <div><dt>Presupuesto Máximo</dt><dd>{formatCurrency(requisition.budget_cap)}</dd></div>}
            <div><dt>Versión del documento</dt><dd>v{requisition.version || 1} — {requisition.original_filename}</dd></div>
            <div><dt>Radicada por</dt><dd>{requisition.uploader_name}{requisition.uploader_territory ? ` (${requisition.uploader_territory})` : ''}</dd></div>
            <div><dt>Fecha de radicación</dt><dd>{formatDate(requisition.created_at)}</dd></div>
            <div><dt>Fecha de aprobación final</dt><dd>{formatDate(approvedAt)}</dd></div>
            {requisition.selected_provider_name && (
              <div><dt>Proveedor seleccionado</dt><dd>{requisition.selected_provider_name} — {formatCurrency(requisition.selected_amount)}</dd></div>
            )}
            <div><dt>Estado</dt><dd>{statusLabel(requisition.status)}</dd></div>
          </dl>
          {requisition.description && <p className="acta__description">{requisition.description}</p>}
        </section>

        <section className="acta__section">
          <h3 className="acta__section-title">Ruta de aprobación</h3>
          <StepsTable steps={steps} logs={logs} />
        </section>

        <Returns steps={steps} logs={logs} />
        <Quotations requisition={requisition} quotations={quotations} />
        <Signatures steps={steps} logs={logs} />

        <footer className="acta__footer">
          Documento generado por CID Aprueba el {formatDate(new Date().toISOString())}.
        </footer>
      </article>
    </>
  );
}
