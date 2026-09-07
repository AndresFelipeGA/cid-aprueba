const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * User management controller.
 * All methods restricted to role_level 3 (Representante Legal).
 */
const userController = {
  /**
   * List all users (without password_hash).
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  listUsers(req, res) {
    if (req.user.role_level !== 3) {
      throw new AppError('Only Representante Legal can manage users', 403, 'FORBIDDEN');
    }

    const users = User.findAllIncludingInactive();

    logger.info(`User list requested by userId=${req.user.id}`);

    res.json({
      success: true,
      data: { users },
      message: null,
    });
  },

  /**
   * Create a new user.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  createUser(req, res) {
    if (req.user.role_level !== 3) {
      throw new AppError('Only Representante Legal can manage users', 403, 'FORBIDDEN');
    }

    const { username, email, password, full_name, role_level, territory, gender } = req.body;

    // Check for duplicate username
    const existingUsername = User.findByUsername(username);
    if (existingUsername) {
      throw new AppError('Username already exists', 409, 'USERNAME_TAKEN');
    }

    // Check for duplicate email
    const existingEmail = User.findByEmail(email);
    if (existingEmail) {
      throw new AppError('Email already in use', 409, 'EMAIL_TAKEN');
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const newUser = User.create({
      username,
      email,
      passwordHash,
      fullName: full_name,
      roleLevel: role_level,
      territory: territory || null,
      gender: gender || null,
    });

    logger.info(`User created: userId=${newUser.id}, username=${username}, by userId=${req.user.id}`);

    res.status(201).json({
      success: true,
      data: { user: newUser },
      message: 'User created successfully',
    });
  },

  /**
   * Update user details (cannot update username or password).
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  updateUser(req, res) {
    if (req.user.role_level !== 3) {
      throw new AppError('Only Representante Legal can manage users', 403, 'FORBIDDEN');
    }

    const { id } = req.params;
    const { email, full_name, role_level, territory, gender, is_active } = req.body;

    const user = User.findById(id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Check for duplicate email if changing
    if (email && email !== user.email) {
      const existingEmail = User.findByEmail(email);
      if (existingEmail && existingEmail.id !== parseInt(id)) {
        throw new AppError('Email already in use', 409, 'EMAIL_TAKEN');
      }
    }

    const updatedUser = User.update(id, {
      email: email !== undefined ? email : undefined,
      fullName: full_name !== undefined ? full_name : undefined,
      roleLevel: role_level !== undefined ? role_level : undefined,
      territory: territory !== undefined ? (territory || null) : undefined,
      gender: gender !== undefined ? (gender || null) : undefined,
      isActive: is_active !== undefined ? is_active : undefined,
    });

    logger.info(`User updated: userId=${id}, by userId=${req.user.id}`);

    res.json({
      success: true,
      data: { user: updatedUser },
      message: 'User updated successfully',
    });
  },

  /**
   * Reset a user's password.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  resetPassword(req, res) {
    if (req.user.role_level !== 3) {
      throw new AppError('Only Representante Legal can manage users', 403, 'FORBIDDEN');
    }

    const { id } = req.params;
    const { password } = req.body;

    const user = User.findById(id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    User.updatePassword(id, passwordHash);

    logger.info(`Password reset for userId=${id}, by userId=${req.user.id}`);

    res.json({
      success: true,
      data: null,
      message: 'Password reset successfully',
    });
  },

  /**
   * Toggle a user's active status.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  toggleActive(req, res) {
    if (req.user.role_level !== 3) {
      throw new AppError('Only Representante Legal can manage users', 403, 'FORBIDDEN');
    }

    const { id } = req.params;

    const user = User.findById(id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Prevent deactivating yourself
    if (parseInt(id) === req.user.id) {
      throw new AppError('Cannot deactivate your own account', 400, 'SELF_DEACTIVATION');
    }

    const newStatus = user.is_active ? 0 : 1;
    const updatedUser = User.update(id, { isActive: newStatus });

    const action = newStatus ? 'activated' : 'deactivated';
    logger.info(`User ${action}: userId=${id}, by userId=${req.user.id}`);

    res.json({
      success: true,
      data: { user: updatedUser },
      message: `User ${action} successfully`,
    });
  },
};

module.exports = userController;
