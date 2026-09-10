const fs = require('fs');
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Multer may already have stored a file for this rejected request
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Datos de entrada inválidos',
      data: {
        errors: errors.array().map((err) => ({
          field: err.path,
          message: err.msg,
        })),
      },
    });
  }

  next();
};

module.exports = validate;
