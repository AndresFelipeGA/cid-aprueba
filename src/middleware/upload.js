/**
 * Shared multer configuration. Both requisition and quotation uploads use the
 * same extension whitelist, size limit and filename scheme.
 *
 * @module middleware/upload
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const { ALLOWED_UPLOAD_EXTENSIONS } = require('../config/workflow');

/**
 * Build a multer instance that stores files under UPLOAD_DIR/<subdir>.
 * @param {string} [subdir=''] - Sub-folder inside the upload dir
 */
const createUploader = (subdir = '') => {
  const uploadDir = path.resolve(__dirname, '../../', config.uploadDir, subdir);
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
    },
  });

  const fileFilter = (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
      return cb(null, true);
    }
    cb(new AppError(
      `Tipo de archivo no permitido. Tipos aceptados: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`,
      400,
      'INVALID_FILE_TYPE',
    ));
  };

  return multer({ storage, fileFilter, limits: { fileSize: config.maxFileSize } });
};

/** Multer decodes multipart filenames as Latin-1; restore UTF-8 (e.g. "Cotización.pdf"). */
const fixUploadFilename = (req, _res, next) => {
  if (req.file && req.file.originalname) {
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  }
  next();
};

module.exports = { createUploader, fixUploadFilename };
