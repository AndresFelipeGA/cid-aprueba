/**
 * Workflow constants — single source of truth shared by backend and frontend.
 *
 * The frontend fetches these via GET /api/meta so labels, step→role mapping
 * and document types are never duplicated in public/js.
 *
 * @module config/workflow
 */

/** Maps each workflow step_level to the required user role_level. Roles 3 and 4 each act twice. */
const STEP_TO_ROLE_MAP = Object.freeze({
  1: 1, // Coordinador/a de Territorio
  2: 2, // Director/a Programática
  3: 3, // Representante Legal (primera revisión)
  4: 4, // Encargado/a de Compras (gestión de cotizaciones)
  5: 3, // Representante Legal (selecciona cotización)
  6: 4, // Encargado/a de Compras (segunda aprobación — documentos finales)
  7: 5, // Área Financiera
  8: 6, // Área de Compras
});

const MAX_STEP_LEVEL = 8;

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
  8: 'Aprobación Final',
});

/** Role names with gender variants (M / F / default). */
const ROLE_NAMES = Object.freeze({
  1: { M: 'Coordinador de Territorio', F: 'Coordinadora de Territorio', default: 'Coordinador/a de Territorio' },
  2: { M: 'Director Programático', F: 'Directora Programática', default: 'Director/a Programática' },
  3: { default: 'Representante Legal' },
  4: { M: 'Encargado de Compras', F: 'Encargada de Compras', default: 'Encargado/a de Compras' },
  5: { default: 'Área Financiera' },
  6: { default: 'Área de Compras' },
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

/** Step where Área Financiera can attach proof of payment to the selected quotation. */
const PAYMENT_STEP = 7;
const PAYMENT_DOC_TYPE = 'comprobante_pago';
const PAYMENT_DOC_LABEL = 'Comprobante de Pago';

const ALLOWED_UPLOAD_EXTENSIONS = Object.freeze(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png']);

module.exports = {
  STEP_TO_ROLE_MAP,
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
};
