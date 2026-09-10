const fs = require('fs');
const multer = require('multer');
const logger = require('../utils/logger');

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: ['El archivo excede el tamaño máximo permitido', 'FILE_TOO_LARGE'],
  LIMIT_UNEXPECTED_FILE: ['Campo de archivo inesperado', 'UNEXPECTED_FILE'],
};

/** Delete a file multer already wrote when the request ultimately failed. */
const discardUploadedFile = (req) => {
  const filePath = req.file && req.file.path;
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      logger.warn(`Could not remove orphaned upload ${filePath}: ${err.message}`);
    }
  });
};

const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.isOperational ? err.message : 'An unexpected error occurred';

  if (err instanceof multer.MulterError) {
    const [msg, mapped] = MULTER_MESSAGES[err.code] || ['Error al procesar el archivo', 'UPLOAD_ERROR'];
    statusCode = 400;
    code = mapped;
    message = msg;
  }

  discardUploadedFile(req);

  const response = { success: false, error: code, message };
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  // Client errors (4xx) are expected traffic: log briefly. Only 5xx get a stack.
  if (statusCode >= 500) {
    logger.error(`${statusCode} ${req.method} ${req.originalUrl} - ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`${statusCode} ${req.method} ${req.originalUrl} - ${message}`);
  }
  res.status(statusCode).json(response);
};

module.exports = errorHandler;
