/**
 * Reusable express-validator chains so every route validates params and
 * query strings the same way (STANDARDS.md §3: validate all incoming data).
 *
 * @module middleware/validators
 */

const { param, query } = require('express-validator');
const { REQUISITION_STATUSES } = require('../config/workflow');

const MAX_PAGE_SIZE = 100;

/** Positive-integer route parameter, e.g. idParam('requisitionId'). */
const idParam = (name = 'id') => param(name)
  .isInt({ min: 1 }).withMessage(`El parámetro ${name} debe ser un entero positivo`)
  .toInt();

/** ?page=&limit= with sane bounds. Values are coerced to integers. */
const pagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('page debe ser un entero ≥ 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: MAX_PAGE_SIZE })
    .withMessage(`limit debe estar entre 1 y ${MAX_PAGE_SIZE}`).toInt(),
];

/** :status route parameter restricted to known requisition statuses. */
const statusParam = param('status')
  .isIn(REQUISITION_STATUSES)
  .withMessage(`Estado inválido. Debe ser uno de: ${REQUISITION_STATUSES.join(', ')}`);

/**
 * Read validated pagination from req.query.
 * @returns {{ page: number, limit: number, offset: number }}
 */
const getPagination = (req, defaultLimit = 20) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
};

module.exports = { idParam, pagination, statusParam, getPagination, MAX_PAGE_SIZE };
