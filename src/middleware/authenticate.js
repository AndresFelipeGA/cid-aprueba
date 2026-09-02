const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const authenticate = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required. Please provide a valid token.', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, authConfig.jwtSecret);
    const user = User.findById(decoded.sub);

    if (!user) {
      throw new AppError('User not found', 401, 'UNAUTHORIZED');
    }

    if (!user.is_active) {
      throw new AppError('User account is deactivated', 401, 'UNAUTHORIZED');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.isOperational) {
      throw err;
    }
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
    }
    if (err.name === 'JsonWebTokenError') {
      throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
    }
    throw new AppError('Authentication failed', 401, 'UNAUTHORIZED');
  }
};

module.exports = authenticate;
