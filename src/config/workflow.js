/**
 * Workflow constants — single source of truth shared by backend and frontend.
 *
 * The frontend fetches these via GET /api/meta so labels, step→role mapping
 * and document types are never duplicated in public/js.
 *
 * @module config/workflow
 */

/**
 * Maps each workflow step_level to the required user role_level(s). Most
 * steps have exactly one owner; step 12 is a joint approval and maps to an
 * array — use `rolesForStep`/`primaryRoleForStep` below rather than reading
 * this object directly, so callers don't have to special-case the array.
 */
const STEP_TO_ROLE_MAP = Object.freeze({
  1: 1, // Coordinador/a de Territorio
  2: 2, // Director/a Programática
  3: 3, // Representante Legal (primera revisión)
  4: 4, // Encargado/a de Compras (gestión de cotizaciones)
  5: 3, // Representante Legal (selecciona cotización)
  6: 4, // Encargado/a de Compras (segunda aprobación — documentos de cierre de compra)
  7: 5, // Área Financiera (solo revisa y aprueba — no adjunta nada)
  8: 6, // Tesorería (adjunta el comprobante del anticipo y aprueba)
  9: 4, // Encargado/a de Compras (confirma el anticipo)
  10: 4, // Encargado/a de Compras (adjunta documentos de entrega y aprueba)
  11: 6, // Tesorería (adjunta el comprobante del pago final y aprueba)
  12: [1, 4], // Coordinador/a de Territorio Y Encargado/a de Compras, de forma conjunta
});

/** Always an array, even for single-owner steps — the safe way to check "can this role act here". */
const rolesForStep = (step) => {
  const value = STEP_TO_ROLE_MAP[step];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

/** A single representative role for a step, for contexts that need exactly one value (e.g. a DB column). */
const primaryRoleForStep = (step) => rolesForStep(step)[0];

const MAX_STEP_LEVEL = 12;

/** Step 1 is completed by the coordinator's upload itself; approvals start at step 2. */
const FIRST_APPROVAL_LEVEL = 2;

const STEP_LABELS = Object.freeze({
  1: 'Radicación de la Requisición',
  2: 'Aprobación Programática',
  3: 'Aprobación Legal',
  4: 'Gestión de Cotizaciones',
  5: 'Selección de Cotización',
  6: 'Segunda Aprobación de Compras',
  7: 'Aprobación Financiera',
  8: 'Aprobación de Tesorería — Anticipo',
  9: 'Confirmación de Compras — Anticipo',
  10: 'Entrega y Documentos de Compra',
  11: 'Aprobación de Tesorería — Pago Final',
  12: 'Cierre de la Requisición',
});

/** Role names with gender variants (M / F / default). */
const ROLE_NAMES = Object.freeze({
  1: { M: 'Coordinador de Territorio', F: 'Coordinadora de Territorio', default: 'Coordinador/a de Territorio' },
  2: { M: 'Director Programático', F: 'Directora Programática', default: 'Director/a Programática' },
  3: { default: 'Representante Legal' },
  4: { M: 'Encargado de Compras', F: 'Encargada de Compras', default: 'Encargado/a de Compras' },
  5: { default: 'Área Financiera' },
  6: { default: 'Tesorería' },
});

/** Role that administers users and projects alongside the coordinator. */
const ADMIN_ROLE = 3;

const REQUISITION_STATUSES = Object.freeze(['pending', 'in_review', 'approved', 'rejected', 'returned']);

const STATUS_LABELS = Object.freeze({
  pending: 'Pendiente',
  in_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  returned: 'Devuelta',
});

/** Audit log actions. */
const LOG_ACTIONS = Object.freeze({
  uploaded: 'Radicó',
  approved: 'Aprobó',
  rejected: 'Rechazó definitivamente',
  returned: 'Devolvió',
  resubmitted: 'Radicó nueva versión',
});

/** Where a reviewer can send a requisition back to. */
const RETURN_TARGETS = Object.freeze(['previous', 'start']);

const CURRENCY = 'COP';

const QUOTATION_DOC_TYPES = Object.freeze({
  rut: 'RUT',
  camara_comercio: 'Cámara de Comercio',
  cedula: 'Cédula',
});

/**
 * Extra provider attachments that only apply to some purchases (e.g. one
 * involving real estate) — unlike QUOTATION_DOC_TYPES, these never block
 * approval. `otros` is a catch-all for anything that doesn't need its own
 * slot (arriendos, refrigerios, comidas...) and stays last.
 */
const OPTIONAL_QUOTATION_DOC_TYPES = Object.freeze({
  escrituras: 'Escrituras',
  certificado_tradicion_libertad: 'Certificado de Tradición y Libertad',
  otros: 'Otros',
});

/**
 * Encargado/a de Compras' second approval step: closes out the purchase with
 * the selected provider. None of these are required to approve — including
 * `certificado_bancario`, moved here from QUOTATION_DOC_TYPES since it only
 * matters for the one provider actually chosen, not every candidate quote.
 */
const FINAL_PURCHASE_STEP = 6;
const FINAL_PURCHASE_DOC_TYPES = Object.freeze({
  orden_compra: 'Orden de Compra',
  poliza: 'Póliza',
  contrato: 'Contrato',
  factura: 'Factura',
  cuenta_cobro: 'Cuenta de Cobro',
  certificado_bancario: 'Certificado Bancario',
});

/** Step where Tesorería attaches the advance payment proof to the selected quotation. */
const PAYMENT_STEP = 8;
const PAYMENT_DOC_TYPE = 'comprobante_pago';
const PAYMENT_DOC_LABEL = 'Comprobante de Pago — Anticipo';

/**
 * Encargado/a de Compras' delivery step: the purchased items have already
 * been handed over. All three are optional — Tesorería only needs whichever
 * one it needs to process the final payment.
 */
const DELIVERY_STEP = 10;
const DELIVERY_DOC_TYPES = Object.freeze({
  factura_final: 'Factura',
  cuenta_cobro_final: 'Cuenta de Cobro',
  acta_entrega: 'Acta de Entrega',
});

/** Step where Tesorería attaches the proof of the final (balance) payment. */
const FINAL_PAYMENT_STEP = 11;
const FINAL_PAYMENT_DOC_TYPE = 'comprobante_pago_saldo';
const FINAL_PAYMENT_DOC_LABEL = 'Comprobante de Pago — Saldo Final';

/**
 * Final step: Coordinador/a de Territorio and Encargado/a de Compras must
 * both approve — independently, in either order — before the requisition
 * closes. The coordinator also attaches the closing documents; neither is
 * individually required, but at least one of the two must be present.
 */
const CLOSURE_STEP = 12;
const CLOSURE_ROLES = Object.freeze([1, 4]);
const CLOSURE_DOC_LABELS = Object.freeze({
  listing: 'Listados',
  minutes: 'Actas',
});

const ALLOWED_UPLOAD_EXTENSIONS = Object.freeze(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png']);

module.exports = {
  STEP_TO_ROLE_MAP,
  rolesForStep,
  primaryRoleForStep,
  MAX_STEP_LEVEL,
  FIRST_APPROVAL_LEVEL,
  STEP_LABELS,
  ROLE_NAMES,
  ADMIN_ROLE,
  REQUISITION_STATUSES,
  STATUS_LABELS,
  LOG_ACTIONS,
  RETURN_TARGETS,
  CURRENCY,
  QUOTATION_DOC_TYPES,
  OPTIONAL_QUOTATION_DOC_TYPES,
  FINAL_PURCHASE_STEP,
  FINAL_PURCHASE_DOC_TYPES,
  ALLOWED_UPLOAD_EXTENSIONS,
  PAYMENT_STEP,
  PAYMENT_DOC_TYPE,
  PAYMENT_DOC_LABEL,
  DELIVERY_STEP,
  DELIVERY_DOC_TYPES,
  FINAL_PAYMENT_STEP,
  FINAL_PAYMENT_DOC_TYPE,
  FINAL_PAYMENT_DOC_LABEL,
  CLOSURE_STEP,
  CLOSURE_ROLES,
  CLOSURE_DOC_LABELS,
};
