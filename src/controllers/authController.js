const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authConfig = require('../config/auth');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const authController = {
  login(req, res) {
    const { username, password } = req.body;

    const user = User.findByUsername(username);
    if (!user) {
      logger.warn(`Failed login attempt: username=${username}`);
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
      logger.warn(`Login attempt for deactivated account: username=${username}`);
      throw new AppError('Account is deactivated', 401, 'ACCOUNT_DEACTIVATED');
    }

    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    if (!isValidPassword) {
      logger.warn(`Failed login attempt: username=${username}`);
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role_level: user.role_level,
      },
      authConfig.jwtSecret,
      { expiresIn: authConfig.jwtExpiresIn },
    );

    logger.info(`User login: userId=${user.id}, username=${user.username}`);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          role_level: user.role_level,
        },
      },
      message: 'Login successful',
    });
  },

  me(req, res) {
    const user = User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { user },
      message: null,
    });
  },
};

module.exports = authController;
