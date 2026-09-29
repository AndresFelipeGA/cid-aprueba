/**
 * Shared multer configuration. Every upload across the app uses the same
 * extension whitelist, size limit and filename scheme, and is additionally
 * verified by its real file signature (not just its extension/declared MIME
 * type, which anyone can fake).
 *
 * @module middleware/upload
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const { ALLOWED_UPLOAD_EXTENSIONS } = require('../config/workflow');

const PDF_SIGNATURE = '%PDF-';

/** True if the file on disk actually starts with the PDF magic bytes, not just named *.pdf. */
const isRealPdf = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(PDF_SIGNATURE.length);
    fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.toString('latin1') === PDF_SIGNATURE;
  } finally {
    fs.closeSync(fd);
  }
};

/**
 * Build a multer instance that stores files under UPLOAD_DIR/<subdir>.
 * `.single(field)` returns [multer's own middleware, a signature check] —
 * Express flattens nested middleware arrays, so every existing call site
 * (`upload.single('file')`) keeps working unchanged.
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
      `Tipo de archivo no permitido. Por ahora solo se aceptan: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`,
      400,
      'INVALID_FILE_TYPE',
    ));
  };

  const multerUpload = multer({ storage, fileFilter, limits: { fileSize: config.maxFileSize } });

  const verifySignature = (req, _res, next) => {
    if (!req.file) return next();
    if (isRealPdf(req.file.path)) return next();
    fs.unlink(req.file.path, () => {});
    next(new AppError('El archivo no es un PDF válido (su contenido no coincide con la extensión)', 400, 'INVALID_FILE_CONTENT'));
  };

  return {
    single: (field) => [multerUpload.single(field), verifySignature],
  };
};

/** Multer decodes multipart filenames as Latin-1; restore UTF-8 (e.g. "Cotización.pdf"). */
const fixUploadFilename = (req, _res, next) => {
  if (req.file && req.file.originalname) {
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  }
  next();
};

module.exports = { createUploader, fixUploadFilename };
