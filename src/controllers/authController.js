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

    const tokenPayload = {
      sub: user.id,
      username: user.username,
      role_level: user.role_level,
    };

    // Include territory in token if the user has one
    if (user.territory) {
      tokenPayload.territory = user.territory;
    }

    const token = jwt.sign(
      tokenPayload,
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
          territory: user.territory || null,
          gender: user.gender || null,
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

  updateProfile(req, res) {
    const userId = req.user.id;
    const { email, full_name, gender } = req.body;

    // Check if email is already taken by another user
    if (email) {
      const existing = User.findByEmail ? User.findByEmail(email) : null;
      if (existing && existing.id !== userId) {
        throw new AppError('Email already in use', 409, 'EMAIL_TAKEN');
      }
    }

    const updatedUser = User.update(userId, {
      email: email || undefined,
      fullName: full_name || undefined,
      gender: gender !== undefined ? (gender || null) : undefined,
    });

    if (!updatedUser) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    logger.info(`User profile updated: userId=${userId}`);

    res.json({
      success: true,
      data: { user: updatedUser },
      message: 'Profile updated successfully',
    });
  },
};

module.exports = authController;
