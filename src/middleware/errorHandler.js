const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    error: err.code || 'INTERNAL_ERROR',
    message: err.isOperational ? err.message : 'An unexpected error occurred',
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  logger.error(`${statusCode} - ${err.message}`, { stack: err.stack });
  res.status(statusCode).json(response);
};

module.exports = errorHandler;
