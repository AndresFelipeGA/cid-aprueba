/* ============================================
   CID Aprueba — Workflow metadata (from /api/meta)
   Roles, steps, statuses and document types come from the backend so
   they are never duplicated here.
   ============================================ */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as API from '../api.js';

const MetaContext = createContext(null);

export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    API.getMeta()
      .then((result) => setMeta(result.data))
      .catch((err) => setError(err));
  }, []);

  const helpers = useMemo(() => {
    const m = meta || {};

    const roleName = (level, gender) => {
      const entry = (m.role_names || {})[level];
      if (!entry) return `Nivel ${level}`;
      if (gender && entry[gender]) return entry[gender];
      return entry.default;
    };
    const stepLabel = (step) => (m.step_labels || {})[step] || `Paso ${step}`;
    /** Always an array, even for single-owner steps — the safe way to check "does this role own this step". */
    const stepRoles = (step) => {
      const map = m.step_to_role || {};
      const value = map[step];
      if (value === undefined) return [];
      return Array.isArray(value) ? value : [value];
    };
    /** A single representative role, for contexts that only make sense with one (e.g. a gendered pronoun). */
    const stepRole = (step) => {
      const roles = stepRoles(step);
      return roles.length ? roles[0] : null;
    };
    const roleNameForStep = (step, gender) => stepRoles(step).map((role) => roleName(role, gender)).join(' y ');
    const maxStep = () => m.max_step || 12;
    const firstApprovalLevel = () => m.first_approval_level || 2;
    const currency = () => m.currency || 'COP';
    const docTypes = () => Object.entries(m.doc_types || {}).map(([key, label]) => ({ key, label }));
    const optionalDocTypes = () => Object.entries(m.optional_doc_types || {}).map(([key, label]) => ({ key, label }));
    const finalPurchaseStep = () => m.final_purchase_step || 6;
    const finalPurchaseDocTypes = () => Object.entries(m.final_purchase_doc_types || {}).map(([key, label]) => ({ key, label }));
    const paymentStep = () => m.payment_step || 8;
    const paymentDocType = () => m.payment_doc_type || 'comprobante_pago';
    const paymentDocLabel = () => m.payment_doc_label || 'Comprobante de Pago — Anticipo';
    const deliveryStep = () => m.delivery_step || 10;
    const deliveryDocTypes = () => Object.entries(m.delivery_doc_types || {}).map(([key, label]) => ({ key, label }));
    const finalPaymentStep = () => m.final_payment_step || 11;
    const finalPaymentDocType = () => m.final_payment_doc_type || 'comprobante_pago_saldo';
    const finalPaymentDocLabel = () => m.final_payment_doc_label || 'Comprobante de Pago — Saldo Final';
    const closureStep = () => m.closure_step || 12;
    const closureRoles = () => m.closure_roles || [1, 4];
    const closureDocLabels = () => m.closure_doc_labels || { listing: 'Listados', minutes: 'Actas' };
    const acceptAttr = () => (m.allowed_extensions || ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png']).join(',');
    const statusLabels = () => m.status_labels || {};
    const statusLabel = (status) => statusLabels()[status] || status;
    const actionLabel = (action) => (m.log_actions || {})[action] || action;

    const roleOptions = () => Object.keys(m.role_names || {}).map((level) => ({ value: level, label: roleName(level) }));
    const stepOptions = () => Object.keys(m.step_labels || {}).map((step) => ({ value: step, label: stepLabel(step) }));
    const statusOptions = () => {
      const labels = statusLabels();
      const statuses = m.statuses || Object.keys(labels);
      return statuses.map((status) => ({ value: status, label: labels[status] || status }));
    };
    const GENDER_OPTIONS = [
      { value: '', label: 'Prefiero no decir' },
      { value: 'M', label: 'Masculino' },
      { value: 'F', label: 'Femenino' },
    ];

    return {
      meta: m,
      loaded: Boolean(meta),
      roleName,
      stepLabel,
      stepRole,
      stepRoles,
      roleNameForStep,
      maxStep,
      firstApprovalLevel,
      currency,
      docTypes,
      optionalDocTypes,
      finalPurchaseStep,
      finalPurchaseDocTypes,
      paymentStep,
      paymentDocType,
      paymentDocLabel,
      deliveryStep,
      deliveryDocTypes,
      finalPaymentStep,
      finalPaymentDocType,
      finalPaymentDocLabel,
      closureStep,
      closureRoles,
      closureDocLabels,
      acceptAttr,
      statusLabels,
      statusLabel,
      actionLabel,
      roleOptions,
      stepOptions,
      statusOptions,
      genderOptions: GENDER_OPTIONS,
    };
  }, [meta]);

  return <MetaContext.Provider value={{ ...helpers, error }}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  return useContext(MetaContext);
}
