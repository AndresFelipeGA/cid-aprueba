const AppError = require('../utils/AppError');

const authorize = (...allowedLevels) => {
  return (req, _res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    if (allowedLevels.length > 0 && !allowedLevels.includes(req.user.role_level)) {
      throw new AppError(
        'You do not have permission to perform this action',
        403,
        'FORBIDDEN',
      );
    }

    next();
  };
};

module.exports = authorize;
