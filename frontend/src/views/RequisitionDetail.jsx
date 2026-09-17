/* ============================================
   CID Aprueba — Requisition detail view
   (approval / return / reject actions, resubmission, versions,
   quotations panel, comparison table, timeline)
   ============================================ */
import { useEffect, useRef, useState } from 'react';
import Loading from '../components/Loading.jsx';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as API from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { usePageTitle } from '../context/PageTitleContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useDocumentModal } from '../context/DocumentModalContext.jsx';
import { formatDate, formatDateShort, formatCurrency, formatPercent } from '../utils/format.js';
import StatusBadge from '../components/StatusBadge.jsx';

const OPEN_STATUSES = new Set(['pending', 'in_review', 'returned']);
const isOpen = (req) => OPEN_STATUSES.has(req.status);
const QUOTATION_STEP = 4;
const SELECTION_STEP = 5;

const APPROVAL_OPTIONS = {
  approve: {
    label: 'Aprobar',
    btnClass: 'btn--secondary',
    busy: 'Aprobando...',
    placeholder: 'Comentarios opcionales para la aprobación',
  },
  return_previous: {
    label: 'Devolver al paso anterior',
    btnClass: 'btn--warning',
    busy: 'Devolviendo...',
    placeholder: 'Explique el motivo de la devolución (obligatorio)',
    confirm: 'La requisición volverá al paso anterior para que sea revisada nuevamente. ¿Desea continuar?',
  },
  return_start: {
    label: 'Devolver al inicio (nueva versión del documento)',
    shortLabel: 'Devolver al inicio',
    btnClass: 'btn--warning',
    busy: 'Devolviendo...',
    placeholder: 'Explique qué debe corregirse en la nueva versión (obligatorio)',
    confirm: 'La requisición volverá al inicio y el/la coordinador/a deberá radicar una nueva versión del documento. ¿Desea continuar?',
  },
  reject: {
    label: 'Rechazar definitivamente',
    btnClass: 'btn--danger',
    busy: 'Rechazando...',
    placeholder: 'Explique el motivo del rechazo (obligatorio)',
    confirm: 'El rechazo es definitivo: la requisición quedará cerrada y no podrá continuar. ¿Desea continuar?',
  },
};

function hasAllDocs(quotation, docTypes) {
  const docs = quotation.documents || [];
  return docTypes().every((dt) => docs.some((d) => d.doc_type === dt.key));
}

/** Quotations sorted by amount (ascending) with the % difference vs. the lowest. */
export function compareQuotations(quotations) {
  const sorted = [...quotations].sort((a, b) => Number(a.amount) - Number(b.amount));
  const lowest = sorted.length ? Number(sorted[0].amount) : 0;
  return sorted.map((q, i) => ({
    quotation: q,
    isLowest: i === 0,
    diffPercent: lowest > 0 ? ((Number(q.amount) - lowest) / lowest) * 100 : 0,
  }));
}

// --- Quotation card ---

/** "Anticipo 30% · Contra entrega 70%", collapsing to a single phrase at the 0/100 extremes. */
function paymentTermsLabel(advancePercent) {
  if (advancePercent === null || advancePercent === undefined) return null;
  const advance = Number(advancePercent);
  const remainder = 100 - advance;
  if (advance === 100) return '100% anticipado';
  if (advance === 0) return '100% contra entrega';
  return `Anticipo ${advance}% · Contra entrega ${remainder}%`;
}

function QuotationCard({ requisition, quotation, canEdit, onPreview, onDelete, onAttachDoc, onDeleteDoc }) {
  const { docTypes, paymentStep, paymentDocType, paymentDocLabel } = useMeta();
  const docs = quotation.documents || [];
  const isSelected = quotation.status === 'selected';
  const isAtPaymentStep = requisition.current_approval_level === paymentStep() && isOpen(requisition);
  const paymentDoc = docs.find((d) => d.doc_type === paymentDocType());
  const paymentTerms = paymentTermsLabel(quotation.advance_percent);

  return (
    <div className={`quotation-card${isSelected ? ' quotation-card--selected' : ''}`}>
      <div className="quotation-card__header">
        <span className="quotation-card__provider">Cotización: {quotation.provider_name}</span>
        <span className="quotation-card__price">
          <span className="quotation-card__amount">{formatCurrency(quotation.amount)}</span>
          {isSelected && <span className="tag tag--success">Seleccionada</span>}
        </span>
      </div>
      {paymentTerms && <div className="quotation-card__payment-terms">{paymentTerms}</div>}
      {quotation.notes && <div className="quotation-card__notes">{quotation.notes}</div>}
      <div className="quotation-card__file">
        <span className="quotation-card__filename" role="button" tabIndex={0} title="Clic para vista previa" onClick={() => onPreview(quotation.original_filename)}>
          📄 {quotation.original_filename}
        </span>
        <div className="quotation-card__actions">
          <button className="btn btn--outline btn--sm" onClick={() => onPreview(quotation.original_filename)}>Ver</button>
          {canEdit && <button className="btn btn--danger btn--sm" onClick={() => onDelete(quotation.id)}>Eliminar</button>}
        </div>
      </div>
      <div className="quotation-card__documents">
        <div className="quotation-card__documents-title">Documentos del proveedor:</div>
        {docTypes().map((docType) => {
          const doc = docs.find((d) => d.doc_type === docType.key);
          if (doc) {
            return (
              <div className="quotation-card__doc-item" key={docType.key}>
                <span
                  className="quotation-card__doc-status quotation-card__doc-status--complete quotation-card__doc-filename"
                  role="button"
                  tabIndex={0}
                  title="Clic para vista previa"
                  onClick={() => onPreview(doc.original_filename, doc.id, quotation.id)}
                >
                  ✅ {docType.label}: {doc.original_filename}
                </span>
                <div className="quotation-card__actions">
                  <button className="btn btn--outline btn--sm" onClick={() => onPreview(doc.original_filename, doc.id, quotation.id)}>Ver</button>
                  {canEdit && <button className="btn btn--danger btn--sm" onClick={() => onDeleteDoc(quotation.id, doc.id)}>Eliminar</button>}
                </div>
              </div>
            );
          }
          return (
            <div className="quotation-card__doc-item" key={docType.key}>
              <span className="quotation-card__doc-status quotation-card__doc-status--missing">❌ {docType.label}: (sin adjuntar)</span>
              <div className="quotation-card__actions">
                {canEdit && (
                  <label className="btn btn--outline btn--sm quotation-card__attach-btn">
                    Adjuntar
                    <input type="file" className="hidden" onChange={(e) => onAttachDoc(quotation.id, docType.key, e.target)} />
                  </label>
                )}
              </div>
            </div>
          );
        })}
        {paymentDoc && !isAtPaymentStep && (
          <div className="quotation-card__doc-item">
            <span
              className="quotation-card__doc-status quotation-card__doc-status--complete quotation-card__doc-filename"
              role="button"
              tabIndex={0}
              title="Clic para vista previa"
              onClick={() => onPreview(paymentDoc.original_filename, paymentDoc.id, quotation.id)}
            >
              ✅ {paymentDocLabel()}: {paymentDoc.original_filename}
            </span>
            <div className="quotation-card__actions">
              <button className="btn btn--outline btn--sm" onClick={() => onPreview(paymentDoc.original_filename, paymentDoc.id, quotation.id)}>Ver</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Quotations panel ---

function QuotationForm({ requisitionId, budgetCap, onSubmitted, onCancel }) {
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState('');
  const [advancePercent, setAdvancePercent] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const remainderPercent = advancePercent.trim() === '' ? '' : String(Math.max(0, 100 - Number(advancePercent)));

  const handleSubmit = async () => {
    const providerName = provider.trim();
    if (!providerName) {
      setFeedback({ type: 'error', message: 'El nombre del proveedor es obligatorio' });
      return;
    }
    const amountNum = Number(amount);
    if (amount.trim() === '' || Number.isNaN(amountNum) || amountNum <= 0) {
      setFeedback({ type: 'error', message: 'El monto de la cotización es obligatorio y debe ser mayor a cero' });
      return;
    }
    if (budgetCap && amountNum > budgetCap) {
      setFeedback({ type: 'error', message: `El monto no puede superar el presupuesto máximo de ${formatCurrency(budgetCap)}` });
      return;
    }
    const advanceNum = Number(advancePercent);
    if (advancePercent.trim() === '' || Number.isNaN(advanceNum) || advanceNum < 0 || advanceNum > 100) {
      setFeedback({ type: 'error', message: 'El anticipo es obligatorio y debe ser un porcentaje entre 0 y 100' });
      return;
    }
    if (!file) {
      setFeedback({ type: 'error', message: 'Debe seleccionar un archivo de cotización' });
      return;
    }
    const formData = new FormData();
    formData.append('provider_name', providerName);
    formData.append('amount', String(amountNum));
    formData.append('advance_percent', String(advanceNum));
    if (notes.trim()) formData.append('notes', notes.trim());
    formData.append('file', file);

    setBusy(true);
    setFeedback(null);
    try {
      await API.createQuotation(requisitionId, formData);
      onSubmitted();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Error al crear la cotización' });
      setBusy(false);
    }
  };

  return (
    <div className="quotation-form" id="quotation-form">
      <div className="quotation-form__field">
        <label className="form__label" htmlFor="quotation-provider">Nombre del proveedor</label>
        <input className="form__input" type="text" id="quotation-provider" required placeholder="Ej: Proveedor ABC" maxLength={255} value={provider} onChange={(e) => setProvider(e.target.value)} />
      </div>
      <div className="quotation-form__field">
        <label className="form__label" htmlFor="quotation-amount">Monto (COP)</label>
        <input className="form__input" type="number" id="quotation-amount" required min="1" max={budgetCap || undefined} step="1" inputMode="numeric" placeholder="Ej: 1250000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {budgetCap ? <p className="form__hint">No puede superar el presupuesto máximo de {formatCurrency(budgetCap)}.</p> : null}
      </div>
      <div className="quotation-form__field quotation-form__payment-terms">
        <div className="quotation-form__payment-terms-col">
          <label className="form__label" htmlFor="quotation-advance">Anticipo (%)</label>
          <input
            className="form__input"
            type="number"
            id="quotation-advance"
            required
            min="0"
            max="100"
            step="1"
            inputMode="numeric"
            placeholder="Ej: 30"
            value={advancePercent}
            onChange={(e) => setAdvancePercent(e.target.value)}
          />
        </div>
        <div className="quotation-form__payment-terms-col">
          <label className="form__label" htmlFor="quotation-remainder">Contra entrega (%)</label>
          <input className="form__input" type="text" id="quotation-remainder" disabled value={remainderPercent ? `${remainderPercent}%` : '—'} />
        </div>
      </div>
      <div className="quotation-form__field">
        <label className="form__label" htmlFor="quotation-notes">Notas (opcional)</label>
        <textarea className="form__input" id="quotation-notes" rows={2} maxLength={500} placeholder="Condiciones, tiempos de entrega, garantías..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="quotation-form__field">
        <label className="form__label" htmlFor="quotation-file">Archivo de cotización</label>
        <input className="form__input form__input--file" type="file" id="quotation-file" required ref={fileInputRef} onChange={(e) => setFile(e.target.files[0] || null)} />
      </div>
      <div id="quotation-form-feedback">
        {feedback && <div className={`alert alert--${feedback.type}`}>{feedback.message}</div>}
      </div>
      <div className="quotation-form__actions">
        <button className="btn btn--primary btn--sm" id="btn-submit-quotation" disabled={busy} onClick={handleSubmit}>Subir Cotización</button>
        <button className="btn btn--outline btn--sm" type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function QuotationsPanel({ requisition, quotations, user, onPreview, onReload }) {
  const { stepRole, docTypes } = useMeta();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  const isAtQuotationStep = requisition.current_approval_level === QUOTATION_STEP && isOpen(requisition);
  const canEdit = Boolean(user && user.role_level === stepRole(QUOTATION_STEP) && isAtQuotationStep);
  const canAdd = canEdit && quotations.length < 3;

  if (!isAtQuotationStep && quotations.length === 0) return null;

  const handleDelete = async (quotationId) => {
    if (!(await confirm('¿Está seguro de eliminar esta cotización y todos sus documentos?'))) return;
    try {
      await API.deleteQuotation(requisition.id, quotationId);
      onReload();
    } catch (err) {
      showToast(err.message || 'Error al eliminar la cotización', 'error');
    }
  };

  const handleAttachDoc = async (quotationId, docType, inputEl) => {
    if (!inputEl.files || inputEl.files.length === 0) return;
    const formData = new FormData();
    formData.append('doc_type', docType);
    formData.append('file', inputEl.files[0]);
    try {
      await API.uploadQuotationDocument(requisition.id, quotationId, formData);
      onReload();
    } catch (err) {
      showToast(err.message || 'Error al adjuntar el documento', 'error');
    }
  };

  const handleDeleteDoc = async (quotationId, docId) => {
    if (!(await confirm('¿Está seguro de eliminar este documento?'))) return;
    try {
      await API.deleteQuotationDocument(requisition.id, quotationId, docId);
      onReload();
    } catch (err) {
      showToast(err.message || 'Error al eliminar el documento', 'error');
    }
  };

  const selected = quotations.find((q) => q.status === 'selected');
  const others = quotations.filter((q) => q.id !== (selected && selected.id));

  const card = (q) => (
    <QuotationCard
      key={q.id}
      requisition={requisition}
      quotation={q}
      canEdit={canEdit}
      onPreview={(filename, docId, quotationId) => (docId
        ? onPreview(() => API.downloadQuotationDocument(requisition.id, quotationId, docId), filename)
        : onPreview(() => API.downloadQuotationFile(requisition.id, q.id), filename))}
      onDelete={handleDelete}
      onAttachDoc={handleAttachDoc}
      onDeleteDoc={handleDeleteDoc}
    />
  );

  return (
    <div className="quotations-panel" id="quotations-panel">
      <div className="quotations-panel__header">
        <h3 className="quotations-panel__title">Cotizaciones de Proveedores</h3>
        {canAdd && (
          <button className="btn btn--primary btn--sm quotations-panel__add-btn" id="btn-add-quotation" onClick={() => setFormOpen((o) => !o)}>
            + Agregar Cotización
          </button>
        )}
      </div>

      {canAdd && formOpen && (
        <QuotationForm
          requisitionId={requisition.id}
          budgetCap={requisition.budget_cap}
          onSubmitted={() => { setFormOpen(false); onReload(); }}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {quotations.length === 0 ? (
        <div className="empty" style={{ padding: 24 }}>No hay cotizaciones adjuntas aún.</div>
      ) : selected ? (
        <>
          {card(selected)}
          {others.length > 0 && (
            <>
              <button className="btn btn--outline btn--sm" id="btn-toggle-other-quotations" onClick={() => setShowOthers((s) => !s)}>
                {showOthers ? 'Ocultar otras cotizaciones' : `Ver otras cotizaciones (${others.length})`}
              </button>
              <div className={showOthers ? '' : 'hidden'} id="other-quotations">
                {others.map(card)}
              </div>
            </>
          )}
        </>
      ) : (
        quotations.map(card)
      )}

      {isAtQuotationStep && !quotations.some((q) => hasAllDocs(q, docTypes)) && (
        <div className="quotation-warning">
          <span>⚠️</span>
          <span>Debe completar al menos una cotización con todos los documentos para poder aprobar.</span>
        </div>
      )}
    </div>
  );
}

// --- Step 5: comparison table ---

function ComparisonTable({ quotations, selectedId, onSelect }) {
  const { docTypes } = useMeta();
  return (
    <div className="quotation-selection" id="quotation-selection">
      <label className="form__label">Seleccione la cotización ganadora</label>
      <div className="table-wrap quotation-compare">
        <table className="table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Monto</th>
              <th>Diferencia vs. menor (%)</th>
              <th>Documentación</th>
              <th>Seleccionar</th>
            </tr>
          </thead>
          <tbody>
            {compareQuotations(quotations).map(({ quotation, isLowest, diffPercent }) => {
              const complete = hasAllDocs(quotation, docTypes);
              return (
                <tr key={quotation.id} className={`quotation-compare__row${isLowest ? ' quotation-compare__row--lowest' : ''}${complete ? '' : ' quotation-compare__row--incomplete'}`}>
                  <td>
                    <span className="quotation-compare__provider">{quotation.provider_name}</span>
                    {isLowest && <span className="tag tag--success">Menor precio</span>}
                    {quotation.notes && <div className="quotation-compare__notes">{quotation.notes}</div>}
                  </td>
                  <td className="quotation-compare__amount">{formatCurrency(quotation.amount)}</td>
                  <td className="quotation-compare__diff">{isLowest ? '—' : formatPercent(diffPercent)}</td>
                  <td>{complete
                    ? <span className="quotation-selection__complete">✅ Completa</span>
                    : <span className="quotation-selection__warning">⚠️ Incompleta</span>}</td>
                  <td className="quotation-compare__select">
                    <input
                      type="radio"
                      name="selected_quotation"
                      value={quotation.id}
                      className="quotation-selection__radio"
                      aria-label={`Seleccionar ${quotation.provider_name}`}
                      disabled={!complete}
                      checked={String(selectedId) === String(quotation.id)}
                      onChange={() => onSelect(quotation.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Step 6: payment panel ---

function PaymentPanel({ requisition, quotations, onPreview, onReload }) {
  const { paymentDocType, paymentDocLabel } = useMeta();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const selected = quotations.find((q) => q.id === requisition.selected_quotation_id);
  if (!selected) {
    return <div className="alert alert--error">No hay una cotización seleccionada para esta requisición.</div>;
  }
  const doc = (selected.documents || []).find((d) => d.doc_type === paymentDocType());

  const handleAttach = async (inputEl) => {
    if (!inputEl.files || inputEl.files.length === 0) return;
    const formData = new FormData();
    formData.append('file', inputEl.files[0]);
    try {
      await API.uploadPaymentDocument(requisition.id, formData);
      onReload();
    } catch (err) {
      showToast(err.message || 'Error al adjuntar el comprobante de pago', 'error');
    }
  };

  const handleDelete = async () => {
    if (!(await confirm('¿Está seguro de eliminar el comprobante de pago?'))) return;
    try {
      await API.deletePaymentDocument(requisition.id, doc.id);
      onReload();
    } catch (err) {
      showToast(err.message || 'Error al eliminar el comprobante de pago', 'error');
    }
  };

  return (
    <div className="payment-document" id="payment-document" data-doc-missing={doc ? 'false' : 'true'} style={{ marginBottom: 16 }}>
      <label className="form__label">{paymentDocLabel()} — {selected.provider_name} ({formatCurrency(selected.amount)})</label>
      {doc ? (
        <div className="quotation-card__doc-item">
          <span
            className="quotation-card__doc-status quotation-card__doc-status--complete quotation-card__doc-filename"
            role="button"
            tabIndex={0}
            title="Clic para vista previa"
            onClick={() => onPreview(() => API.downloadQuotationDocument(requisition.id, selected.id, doc.id), doc.original_filename)}
          >
            ✅ {doc.original_filename}
          </span>
          <div className="quotation-card__actions">
            <button className="btn btn--outline btn--sm" onClick={() => onPreview(() => API.downloadQuotationDocument(requisition.id, selected.id, doc.id), doc.original_filename)}>Ver</button>
            <button className="btn btn--danger btn--sm" onClick={handleDelete}>Eliminar</button>
          </div>
        </div>
      ) : (
        <div className="quotation-card__doc-item">
          <span className="quotation-card__doc-status quotation-card__doc-status--missing">❌ Sin comprobante adjunto</span>
          <label className="btn btn--outline btn--sm quotation-card__attach-btn">
            Adjuntar
            <input type="file" className="hidden" onChange={(e) => handleAttach(e.target)} />
          </label>
        </div>
      )}
      {!doc && (
        <div className="quotation-warning">
          <span>⚠️</span>
          <span>Debe adjuntar el comprobante de pago antes de poder aprobar.</span>
        </div>
      )}
    </div>
  );
}

// --- Approval panel ---

function ApprovalPanel({ requisition, quotations, onPreview, onReload }) {
  const { user } = useAuth();
  const { stepLabel, roleNameForStep, firstApprovalLevel, paymentStep, paymentDocType } = useMeta();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const level = requisition.current_approval_level;
  const isSelectionStep = level === SELECTION_STEP;
  const showPrevious = level > firstApprovalLevel();

  const [option, setOption] = useState('approve');
  const [comments, setComments] = useState('');
  const [selectedQuotationId, setSelectedQuotationId] = useState(
    quotations.length === 1 ? quotations[0].id : (quotations.find((q) => q.status === 'selected') || {}).id || null,
  );
  const [feedback, setFeedback] = useState(null);
  const [commentsInvalid, setCommentsInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  const opt = APPROVAL_OPTIONS[option] || APPROVAL_OPTIONS.approve;

  const handleSubmit = async () => {
    setFeedback(null);
    const trimmedComments = comments.trim();

    if (option !== 'approve' && !trimmedComments) {
      setCommentsInvalid(true);
      return;
    }
    setCommentsInvalid(false);

    let finalSelectedQuotationId = null;
    if (option === 'approve' && isSelectionStep && quotations.length > 1) {
      if (!selectedQuotationId) {
        setFeedback({ type: 'error', message: 'Debe seleccionar una cotización antes de aprobar.' });
        return;
      }
      finalSelectedQuotationId = selectedQuotationId;
    }
    if (option === 'approve' && level === paymentStep()) {
      const selected = quotations.find((q) => q.id === requisition.selected_quotation_id);
      const doc = selected && (selected.documents || []).find((d) => d.doc_type === paymentDocType());
      if (selected && !doc) {
        setFeedback({ type: 'error', message: 'Debe adjuntar el comprobante de pago antes de aprobar.' });
        return;
      }
    }

    if (opt.confirm && !(await confirm(opt.confirm))) return;

    setBusy(true);
    try {
      let result;
      if (option === 'approve') {
        result = await API.approveRequisition(requisition.id, trimmedComments, finalSelectedQuotationId);
      } else if (option === 'reject') {
        result = await API.rejectRequisition(requisition.id, trimmedComments);
      } else {
        result = await API.returnRequisition(requisition.id, option === 'return_start' ? 'start' : 'previous', trimmedComments);
      }
      const message = result.message || 'Acción registrada';
      setFeedback({ type: 'success', message });
      showToast(message, option === 'approve' ? 'success' : 'warning');
      setTimeout(() => onReload(), 800);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Error al registrar la acción' });
      setBusy(false);
    }
  };

  const optionRow = (key) => (
    <label className={`approval-options__option approval-options__option--${key}`} key={key}>
      <input
        type="radio"
        name="approval-action"
        value={key}
        checked={option === key}
        onChange={() => { setOption(key); setCommentsInvalid(false); }}
      />
      <span>{APPROVAL_OPTIONS[key].label}</span>
    </label>
  );

  return (
    <div className="approval-panel" id="approval-panel">
      <h3 className="approval-panel__title">Acción de aprobación — {stepLabel(level)} ({roleNameForStep(level, user.gender)})</h3>

      {isSelectionStep && quotations.length > 1 && (
        <ComparisonTable quotations={quotations} selectedId={selectedQuotationId} onSelect={setSelectedQuotationId} />
      )}
      {isSelectionStep && quotations.length === 1 && (
        <div className="alert alert--info" style={{ marginBottom: 12 }}>
          Se aprobará automáticamente la única cotización: <strong>{quotations[0].provider_name}</strong> ({formatCurrency(quotations[0].amount)})
        </div>
      )}
      {isSelectionStep && quotations.length === 0 && (
        <div className="alert alert--error">No hay cotizaciones disponibles para seleccionar. El paso anterior debe agregar cotizaciones.</div>
      )}
      {!isSelectionStep && level === paymentStep() && (
        <PaymentPanel requisition={requisition} quotations={quotations} onPreview={onPreview} onReload={onReload} />
      )}

      <fieldset className="approval-options" id="approval-options">
        <legend className="form__label">Decisión</legend>
        {optionRow('approve')}
        {showPrevious && optionRow('return_previous')}
        {optionRow('return_start')}
        {optionRow('reject')}
      </fieldset>
      <div className="form__group">
        <label className="form__label" htmlFor="approval-comments">
          Comentarios <span className={`approval-panel__required${option === 'approve' ? ' hidden' : ''}`}>(obligatorios)</span>
        </label>
        <textarea
          className={`form__input${commentsInvalid ? ' form__input--invalid' : ''}`}
          id="approval-comments"
          rows={3}
          placeholder={opt.placeholder}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
        <div className={`form__error${commentsInvalid ? '' : ' hidden'}`} id="approval-comments-error">
          Los comentarios son obligatorios para devolver o rechazar una requisición.
        </div>
      </div>
      <div id="approval-feedback">
        {feedback && <div className={`alert alert--${feedback.type}`}>{feedback.message}</div>}
      </div>
      <div className="approval-panel__actions">
        <button className={`btn ${opt.btnClass}`} id="btn-approval-submit" disabled={busy} onClick={handleSubmit}>
          {opt.shortLabel || opt.label}
        </button>
      </div>
    </div>
  );
}

// --- Resubmit panel ---

function ResubmitPanel({ requisition, onDone }) {
  const { firstApprovalLevel, stepLabel } = useMeta();
  const { showToast } = useToast();
  const [title, setTitle] = useState(requisition.title);
  const [description, setDescription] = useState(requisition.description || '');
  const [comments, setComments] = useState('');
  const [file, setFile] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newTitle = title.trim();
    if (!newTitle) {
      setFeedback({ type: 'error', message: 'El título es obligatorio' });
      return;
    }
    if (!file) {
      setFeedback({ type: 'error', message: 'Debe seleccionar el archivo de la nueva versión' });
      return;
    }
    const formData = new FormData();
    formData.append('title', newTitle);
    formData.append('description', description.trim());
    if (comments.trim()) formData.append('comments', comments.trim());
    formData.append('file', file);

    setBusy(true);
    setFeedback(null);
    try {
      const result = await API.resubmitRequisition(requisition.id, formData);
      const message = result.message || 'Nueva versión radicada exitosamente';
      showToast(message, 'success');
      onDone();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Error al radicar la nueva versión' });
      setBusy(false);
    }
  };

  return (
    <div className="approval-panel resubmit-panel" id="resubmit-panel">
      <h3 className="approval-panel__title">Radicar nueva versión</h3>
      <p className="resubmit-panel__hint">
        Corrija el documento según los comentarios de la devolución y radique la nueva versión (v{(requisition.version || 1) + 1}).
        La requisición volverá a la {stepLabel(firstApprovalLevel())}.
      </p>
      <div id="resubmit-feedback">
        {feedback && <div className={`alert alert--${feedback.type}`}>{feedback.message}</div>}
      </div>
      <form id="resubmit-form" noValidate onSubmit={handleSubmit}>
        <div className="form__group">
          <label className="form__label" htmlFor="resubmit-title">Título</label>
          <input className="form__input" type="text" id="resubmit-title" required maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form__group">
          <label className="form__label" htmlFor="resubmit-description">Descripción</label>
          <textarea className="form__input" id="resubmit-description" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form__group">
          <label className="form__label" htmlFor="resubmit-file">Nuevo archivo</label>
          <div
            className={`upload-form__file-area${active ? ' upload-form__file-area--active' : ''}`}
            id="resubmit-drop-area"
            role="button"
            tabIndex={0}
            aria-label="Seleccionar archivo de la nueva versión"
            onClick={() => inputRef.current && inputRef.current.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setActive(true); }}
            onDragLeave={() => setActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setActive(false);
              if (e.dataTransfer.files.length > 0) setFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="upload-form__file-text">Haz clic o arrastra el nuevo archivo aquí</div>
            <input type="file" id="resubmit-file" style={{ display: 'none' }} ref={inputRef} onChange={(e) => { if (e.target.files.length > 0) setFile(e.target.files[0]); }} />
            <div className="upload-form__file-name" id="resubmit-file-name">{file ? file.name : ''}</div>
          </div>
        </div>
        <div className="form__group">
          <label className="form__label" htmlFor="resubmit-comments">Comentarios</label>
          <textarea className="form__input" id="resubmit-comments" rows={2} maxLength={1000} placeholder="Qué cambió en esta versión (opcional)" value={comments} onChange={(e) => setComments(e.target.value)} />
        </div>
        <button className="btn btn--primary" type="submit" id="btn-resubmit" disabled={busy}>Radicar nueva versión</button>
      </form>
    </div>
  );
}

// --- Versions ---

function VersionsPanel({ requisition, versions, onPreview }) {
  if (!versions || versions.length < 2) return null;
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return (
    <div className="versions-panel" id="versions-panel">
      <h3 className="versions-panel__title">Versiones del documento</h3>
      <ul className="versions-panel__list">
        {sorted.map((v) => {
          const isCurrent = v.version === requisition.version;
          return (
            <li className={`version-item${isCurrent ? ' version-item--current' : ''}`} key={v.id}>
              <div className="version-item__main">
                <span className="version-badge">v{v.version}</span>
                <span className="version-item__file">{v.original_filename}</span>
                {isCurrent && <span className="tag tag--success">Actual</span>}
              </div>
              <div className="version-item__meta">{v.created_by_name} — {formatDate(v.created_at)}</div>
              {v.comments && <div className="version-item__comment">"{v.comments}"</div>}
              <div className="version-item__actions">
                <button
                  className="btn btn--outline btn--sm"
                  onClick={() => onPreview(() => API.downloadRequisitionVersion(requisition.id, v.id), v.original_filename)}
                >
                  Ver
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Timeline ---

function Timeline({ requisition, steps, logs }) {
  const { user } = useAuth();
  const { stepRole, stepLabel, roleNameForStep, statusLabel, actionLabel } = useMeta();

  const isCurrentStep = (step) => step.step_level === requisition.current_approval_level && isOpen(requisition);

  return (
    <>
      <div className="timeline">
        <h3 className="timeline__title">Línea de aprobación</h3>
        <ul className="timeline__list">
          {steps.map((step) => {
            const stepLog = step.status === 'pending' ? null : logs.find((l) => l.approval_step_id === step.id && l.action !== 'returned');
            let itemClass = 'timeline__item--pending';
            if (step.status === 'approved') itemClass = 'timeline__item--approved';
            else if (step.status === 'rejected') itemClass = 'timeline__item--rejected';
            else if (isCurrentStep(step)) itemClass = requisition.status === 'returned' ? 'timeline__item--current timeline__item--returned' : 'timeline__item--current';

            const stepRoleLevel = stepRole(step.step_level) ?? step.step_level;
            let stepGender = null;
            if (stepLog && stepLog.user_gender) stepGender = stepLog.user_gender;
            else if (user && stepRoleLevel === user.role_level) stepGender = user.gender;

            const statusText = isCurrentStep(step) && requisition.status === 'returned' && step.status !== 'approved'
              ? statusLabel('returned')
              : statusLabel(step.status);

            return (
              <li className={`timeline__item ${itemClass}`} title={roleNameForStep(step.step_level, stepGender)} key={step.id}>
                <div className="timeline__dot" />
                <div className="timeline__level">{stepLabel(step.step_level)}</div>
                {!stepLog && <div className="timeline__step-role">{roleNameForStep(step.step_level, stepGender)}</div>}
                <div className="timeline__status">
                  {stepLog ? `${statusText} — ${stepLog.user_name} · ${formatDateShort(stepLog.created_at)}` : statusText}
                </div>
                {stepLog && stepLog.comments && <div className="timeline__comment">"{stepLog.comments}"</div>}
              </li>
            );
          })}
        </ul>
      </div>

      {logs.length > 0 && (
        <div className="timeline">
          <h3 className="timeline__title">Historial de acciones</h3>
          <div className="activity-list" style={{ border: 'none', boxShadow: 'none' }}>
            {logs.map((log) => {
              const isReturn = log.action === 'returned';
              return (
                <div className={`activity-item${isReturn ? ' activity-item--returned' : ''}`} key={log.id}>
                  <div className="activity-item__text">
                    <strong>{log.user_name}</strong> {actionLabel(log.action)}
                    {isReturn && log.to_level && <span className="activity-item__target"> → paso {log.to_level} ({stepLabel(log.to_level)})</span>}
                    {log.comments && <><br /><em>"{log.comments}"</em></>}
                  </div>
                  <div className="activity-item__time">{formatDateShort(log.created_at)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// --- Returned banner ---

function ReturnedBanner({ requisition, logs }) {
  const { firstApprovalLevel, stepLabel } = useMeta();
  const lastReturn = logs.find((l) => l.action === 'returned');
  const fromLevel = requisition.returned_from_level;
  const by = lastReturn ? lastReturn.user_name : null;
  const reason = requisition.return_reason || (lastReturn && lastReturn.comments) || '';
  const needsResubmission = requisition.current_approval_level < firstApprovalLevel();

  return (
    <div className="alert alert--warning returned-banner" role="status">
      <div className="returned-banner__title">
        Devuelta{fromLevel ? ` desde ${stepLabel(fromLevel)}` : ''}{by ? ` por ${by}` : ''}
      </div>
      {reason && <blockquote className="returned-banner__reason">"{reason}"</blockquote>}
      <div className="returned-banner__hint">
        {needsResubmission
          ? 'El/la coordinador/a debe radicar una nueva versión del documento.'
          : `Debe ser revisada nuevamente en ${stepLabel(requisition.current_approval_level)}.`}
      </div>
    </div>
  );
}

// --- Main view ---

export default function RequisitionDetail() {
  usePageTitle('Detalle de la Requisición');
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stepRole, stepLabel, roleNameForStep, firstApprovalLevel } = useMeta();
  const openDocumentModal = useDocumentModal();

  const [requisition, setRequisition] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const approvalPanelRef = useRef(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    API.getRequisition(id).then((result) => {
      if (!cancelled) setRequisition(result.data.requisition);
    });
    return () => { cancelled = true; };
  }, [id, reloadToken]);

  const reload = () => setReloadToken((t) => t + 1);

  const level = requisition ? requisition.current_approval_level : null;
  const canAct = Boolean(requisition && user && user.role_level === stepRole(level) && level >= firstApprovalLevel() && isOpen(requisition));

  useEffect(() => {
    if (!focusedRef.current && canAct && searchParams.get('focus') === 'approve' && approvalPanelRef.current) {
      focusedRef.current = true;
      approvalPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const comments = document.getElementById('approval-comments');
      if (comments) comments.focus({ preventScroll: true });
    }
  }, [canAct, searchParams]);

  if (!requisition) return <Loading />;

  const steps = requisition.approval_steps || [];
  const logs = requisition.approval_logs || [];
  const quotations = requisition.quotations || [];
  const versions = requisition.versions || [];
  const canResubmit = Boolean(user && user.role_level === 1 && requisition.status === 'returned' && level < firstApprovalLevel());
  const version = requisition.version || 1;

  const preview = (fetchFn, filename) => openDocumentModal(fetchFn, filename);

  return (
    <>
      <a href="/#/requisitions" className="back-link" onClick={(e) => { e.preventDefault(); navigate('/requisitions'); }}>&larr; Volver a requisiciones</a>

      <div className="req-detail">
        <div className="req-detail__left">
          {requisition.status === 'returned' && <ReturnedBanner requisition={requisition} logs={logs} />}
          <div className="req-detail__info">
            <div className="req-detail__heading">
              <span className="req-detail__number">{requisition.number || `#${requisition.id}`}</span>
              {version > 1 && <span className="version-badge" title={`Versión ${version} del documento`}>v{version}</span>}
              <StatusBadge status={requisition.status} />
            </div>
            <h2 className="req-detail__title">{requisition.title}</h2>
            <ul className="req-detail__meta">
              <li>
                <span className="req-detail__meta-label">Estado</span>
                <span className="req-detail__meta-value"><StatusBadge status={requisition.status} /></span>
              </li>
              <li>
                <span className="req-detail__meta-label">Nivel actual</span>
                <span className="req-detail__meta-value">
                  {requisition.status === 'approved' ? 'Finalizada' : `${stepLabel(level)} (${roleNameForStep(level)})`}
                </span>
              </li>
              <li>
                <span className="req-detail__meta-label">Proyecto</span>
                <span className="req-detail__meta-value">
                  {requisition.project_name
                    ? requisition.project_name + (requisition.project_code ? ` (${requisition.project_code})` : '')
                    : <span style={{ color: 'var(--color-text-light)' }}>Sin proyecto</span>}
                </span>
              </li>
              {requisition.budget_cap && (
                <li>
                  <span className="req-detail__meta-label">Presupuesto Máximo</span>
                  <span className="req-detail__meta-value">{formatCurrency(requisition.budget_cap)}</span>
                </li>
              )}
              <li>
                <span className="req-detail__meta-label">Radicada por</span>
                <span className="req-detail__meta-value">
                  {requisition.uploader_name}{requisition.uploader_territory ? ` — ${requisition.uploader_territory}` : ''}
                </span>
              </li>
              <li>
                <span className="req-detail__meta-label">Archivo{version > 1 ? ` (v${version})` : ''}</span>
                <span
                  className="req-detail__meta-value req-detail__file-link"
                  role="button"
                  tabIndex={0}
                  title="Clic para vista previa"
                  onClick={() => preview(() => API.downloadRequisition(requisition.id), requisition.original_filename)}
                >
                  {requisition.original_filename}
                </span>
              </li>
              {requisition.selected_provider_name && (
                <li>
                  <span className="req-detail__meta-label">Cotización seleccionada</span>
                  <span className="req-detail__meta-value">{requisition.selected_provider_name} — {formatCurrency(requisition.selected_amount)}</span>
                </li>
              )}
              <li>
                <span className="req-detail__meta-label">Fecha de creación</span>
                <span className="req-detail__meta-value">{formatDate(requisition.created_at)}</span>
              </li>
              <li>
                <span className="req-detail__meta-label">Última actualización</span>
                <span className="req-detail__meta-value">{formatDate(requisition.updated_at)}</span>
              </li>
            </ul>
            {requisition.description && <div className="req-detail__description">{requisition.description}</div>}
            <div className="req-detail__actions">
              <button className="btn btn--outline btn--sm" onClick={() => preview(() => API.downloadRequisition(requisition.id), requisition.original_filename)}>Ver documento</button>
              {requisition.status === 'approved' && (
                <button className="btn btn--secondary btn--sm" id="btn-generate-acta" onClick={() => navigate(`/requisitions/${requisition.id}/acta`)}>Generar acta</button>
              )}
            </div>
          </div>

          {canResubmit && <ResubmitPanel requisition={requisition} onDone={reload} />}
          <VersionsPanel requisition={requisition} versions={versions} onPreview={preview} />
          <QuotationsPanel requisition={requisition} quotations={quotations} user={user} onPreview={preview} onReload={reload} />
          {canAct && (
            <div ref={approvalPanelRef}>
              <ApprovalPanel requisition={requisition} quotations={quotations} onPreview={preview} onReload={reload} />
            </div>
          )}
        </div>

        <div className="req-detail__right">
          <Timeline requisition={requisition} steps={steps} logs={logs} />
        </div>
      </div>
    </>
  );
}
