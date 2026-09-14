const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { getPagination } = require('../middleware/validators');
const Requisition = require('../models/Requisition');
const ApprovalStep = require('../models/ApprovalStep');
const ApprovalLog = require('../models/ApprovalLog');
const Project = require('../models/Project');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { toCsv, sendCsv } = require('../utils/csv');
const { buildConsolidatedActaPdf, buildActaCoverPdf, buildActaZipStream, buildRequisitionsReportPdf } = require('../utils/actaPdf');
const { STEP_LABELS, STATUS_LABELS, FIRST_APPROVAL_LEVEL } = require('../config/workflow');

/**
 * Load a requisition and enforce the visibility rule for the requesting user.
 * @throws {AppError} 404 if missing, 403 if the user may not see it yet
 */
const loadVisibleRequisition = (id, user) => {
  const requisition = Requisition.findById(id);
  if (!requisition) {
    throw new AppError('Requisición no encontrada', 404, 'REQUISITION_NOT_FOUND');
  }
  if (!Requisition.isVisibleTo(requisition, user)) {
    throw new AppError('No autorizado para ver esta requisición', 403, 'FORBIDDEN');
  }
  return requisition;
};

const sendFile = (res, filePath, downloadName) => {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new AppError('Archivo no encontrado en el servidor', 404, 'FILE_NOT_FOUND');
  }
  res.download(resolved, downloadName);
};

const paginated = (res, { items, total, page, limit }) => {
  res.json({ success: true, data: { items, total, page, limit }, message: null });
};

/** Parses `?ids=1,2,3` into an array of positive integers, or undefined if the param is absent. */
const parseIds = (req) => {
  if (req.query.ids === undefined) return undefined;
  return req.query.ids
    .split(',')
    .map((v) => parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
};

const requisitionController = {
  loadVisibleRequisition,

  list(req, res) {
    const { page, limit, offset } = getPagination(req);
    const { items, total } = Requisition.findAll({ limit, offset, user: req.user });
    paginated(res, { items, total, page, limit });
  },

  getByStatus(req, res) {
    const { status } = req.params; // validated by statusParam
    const { page, limit, offset } = getPagination(req);
    const { items, total } = Requisition.findByStatus(status, { limit, offset, user: req.user });
    paginated(res, { items, total, page, limit });
  },

  getById(req, res) {
    loadVisibleRequisition(req.params.id, req.user);
    res.json({ success: true, data: { requisition: Requisition.getWithApprovals(req.params.id) }, message: null });
  },

  /**
   * Radicar: the coordinator's upload completes step 1, so the requisition is
   * created in review at FIRST_APPROVAL_LEVEL. Row + steps + log are atomic.
   */
  create(req, res) {
    const { title, description, project_id, budget_cap } = req.body;

    if (!req.file) {
      throw new AppError('El archivo es requerido', 400, 'FILE_REQUIRED');
    }
    if (project_id && !Project.findById(project_id)) {
      throw new AppError('El proyecto seleccionado no existe', 400, 'PROJECT_NOT_FOUND');
    }

    const requisition = db.transaction(() => {
      const created = Requisition.create({
        title,
        description: description || null,
        filePath: req.file.path,
        originalFilename: req.file.originalname,
        uploadedBy: req.user.id,
        projectId: project_id || null,
        budgetCap: budget_cap,
      });
      ApprovalStep.createAll(created.id);
      ApprovalLog.create({
        requisitionId: created.id,
        approvalStepId: ApprovalStep.findByRequisitionAndLevel(created.id, 1).id,
        userId: req.user.id,
        action: 'uploaded',
      });
      return created;
    })();

    logger.info(`Requisition uploaded: reqId=${requisition.id}, number=${requisition.number}, userId=${req.user.id}`);

    res.status(201).json({
      success: true,
      data: { requisition: Requisition.getWithApprovals(requisition.id) },
      message: `Requisición ${requisition.number} radicada exitosamente`,
    });
  },

  /**
   * Radicar nueva versión after a return to step 1. Only the original uploader
   * or a coordinator of the same territory may do it.
   */
  resubmit(req, res) {
    const { id } = req.params;
    const { title, description, comments } = req.body;
    const requisition = loadVisibleRequisition(id, req.user);

    if (requisition.status !== 'returned' || requisition.current_approval_level >= FIRST_APPROVAL_LEVEL) {
      throw new AppError('Solo se puede radicar una nueva versión cuando la requisición fue devuelta al inicio', 400, 'NOT_RETURNED_TO_START');
    }
    const sameTerritory = requisition.uploader_territory && requisition.uploader_territory === req.user.territory;
    if (requisition.uploaded_by !== req.user.id && !sameTerritory) {
      throw new AppError('Solo quien radicó la requisición (o un/a coordinador/a de su territorio) puede radicar la nueva versión', 403, 'FORBIDDEN');
    }
    if (!req.file) {
      throw new AppError('El archivo de la nueva versión es requerido', 400, 'FILE_REQUIRED');
    }

    const updated = db.transaction(() => {
      const result = Requisition.resubmit(id, {
        title: title || requisition.title,
        description: description !== undefined ? description : requisition.description,
        filePath: req.file.path,
        originalFilename: req.file.originalname,
        comments,
        userId: req.user.id,
      });
      ApprovalStep.resetFromLevel(id, 1);
      ApprovalStep.approveRadicacion(id);
      ApprovalLog.create({
        requisitionId: Number(id),
        approvalStepId: ApprovalStep.findByRequisitionAndLevel(id, 1).id,
        userId: req.user.id,
        action: 'resubmitted',
        comments,
      });
      return result;
    })();

    logger.info(`Requisition resubmitted: reqId=${id}, version=${updated.version}, userId=${req.user.id}`);

    res.json({
      success: true,
      data: { requisition: Requisition.getWithApprovals(id) },
      message: `Versión ${updated.version} de ${updated.number} radicada exitosamente`,
    });
  },

  download(req, res) {
    const requisition = loadVisibleRequisition(req.params.id, req.user);
    sendFile(res, requisition.file_path, requisition.original_filename);
  },

  downloadVersion(req, res) {
    const { id, versionId } = req.params;
    loadVisibleRequisition(id, req.user);
    const version = Requisition.findVersion(id, versionId);
    if (!version) {
      throw new AppError('Versión no encontrada', 404, 'VERSION_NOT_FOUND');
    }
    sendFile(res, version.file_path, version.original_filename);
  },

  /** GET /api/requisitions/:id/acta-consolidada.pdf — cover + every attached document merged into one PDF. */
  async downloadActaPdf(req, res) {
    const requisition = loadVisibleRequisition(req.params.id, req.user);
    if (requisition.status !== 'approved') {
      throw new AppError('El acta consolidada solo está disponible para requisiciones aprobadas', 400, 'NOT_APPROVED');
    }
    const full = Requisition.getWithApprovals(requisition.id);
    const pdf = await buildConsolidatedActaPdf(full);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="acta-consolidada-${full.number || full.id}.pdf"`);
    res.send(pdf);
  },

  /** GET /api/requisitions/:id/expediente.zip — the same documents, kept as separate files. */
  async downloadActaZip(req, res) {
    const requisition = loadVisibleRequisition(req.params.id, req.user);
    if (requisition.status !== 'approved') {
      throw new AppError('El expediente solo está disponible para requisiciones aprobadas', 400, 'NOT_APPROVED');
    }
    const full = Requisition.getWithApprovals(requisition.id);
    const coverPdf = await buildActaCoverPdf(full);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="expediente-${full.number || full.id}.zip"`);
    const archive = buildActaZipStream(full, coverPdf);
    archive.pipe(res);
  },

  /** GET /api/requisitions/export.csv?ids=1,2,3 — visible requisitions, optionally restricted to the given ids (e.g. the caller's current filtered view). */
  exportCsv(req, res) {
    const rows = Requisition.findAllForExport(req.user, parseIds(req));
    const csv = toCsv([
      { key: 'number', header: 'Número' },
      { key: 'title', header: 'Título' },
      { key: 'project_code', header: 'Código proyecto' },
      { key: 'project_name', header: 'Proyecto' },
      { key: 'budget_cap', header: 'Presupuesto Máximo (COP)' },
      { header: 'Estado', format: (r) => STATUS_LABELS[r.status] || r.status },
      { header: 'Etapa actual', format: (r) => (STEP_LABELS[r.current_approval_level] || (r.status === 'approved' ? 'Finalizada' : r.current_approval_level)) },
      { key: 'version', header: 'Versión' },
      { key: 'uploader_name', header: 'Radicada por' },
      { key: 'uploader_territory', header: 'Territorio' },
      { key: 'selected_provider_name', header: 'Proveedor seleccionado' },
      { key: 'selected_amount', header: 'Monto seleccionado (COP)' },
      { key: 'return_reason', header: 'Motivo de devolución' },
      { key: 'created_at', header: 'Creada' },
      { key: 'updated_at', header: 'Actualizada' },
    ], rows);

    sendCsv(res, `requisiciones-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  },

  /** GET /api/requisitions/export.pdf?ids=1,2,3 — a branded report, same row set as the CSV export. */
  async downloadReportPdf(req, res) {
    const rows = Requisition.findAllForExport(req.user, parseIds(req));
    const pdf = await buildRequisitionsReportPdf(rows);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="requisiciones-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  },
};

module.exports = requisitionController;
