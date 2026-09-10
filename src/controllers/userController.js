const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 10;

const findUserOr404 = (id) => {
  const user = User.findById(id);
  if (!user) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }
  return user;
};

/**
 * User management controller.
 * Role restriction (Representante Legal only) is enforced in routes/users.js via authorize().
 */
const userController = {
  listUsers(req, res) {
    const users = User.findAllIncludingInactive();
    logger.info(`User list requested by userId=${req.user.id}`);
    res.json({ success: true, data: { users }, message: null });
  },

  createUser(req, res) {
    const { username, email, password, full_name, role_level, territory, gender } = req.body;

    if (User.findByUsername(username)) {
      throw new AppError('El nombre de usuario ya existe', 409, 'USERNAME_TAKEN');
    }
    if (User.findByEmail(email)) {
      throw new AppError('El correo ya está en uso', 409, 'EMAIL_TAKEN');
    }

    const newUser = User.create({
      username,
      email,
      passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
      fullName: full_name,
      roleLevel: role_level,
      territory: territory || null,
      gender: gender || null,
    });

    logger.info(`User created: userId=${newUser.id}, username=${username}, by userId=${req.user.id}`);
    res.status(201).json({ success: true, data: { user: newUser }, message: 'Usuario creado exitosamente' });
  },

  updateUser(req, res) {
    const id = Number(req.params.id);
    const { email, full_name, role_level, territory, gender, is_active } = req.body;
    const user = findUserOr404(id);
    const isSelf = id === req.user.id;

    // An admin cannot change their own role or deactivate themselves (privilege lock-in/lock-out)
    if (isSelf && role_level !== undefined && Number(role_level) !== user.role_level) {
      throw new AppError('No puede cambiar su propio rol', 400, 'SELF_ROLE_CHANGE');
    }
    if (isSelf && is_active !== undefined && Number(is_active) === 0) {
      throw new AppError('No puede desactivar su propia cuenta', 400, 'SELF_DEACTIVATION');
    }

    if (email && email !== user.email) {
      const existingEmail = User.findByEmail(email);
      if (existingEmail && existingEmail.id !== id) {
        throw new AppError('El correo ya está en uso', 409, 'EMAIL_TAKEN');
      }
    }

    const updatedUser = User.update(id, {
      email,
      fullName: full_name,
      roleLevel: role_level,
      territory: territory !== undefined ? (territory || null) : undefined,
      gender: gender !== undefined ? (gender || null) : undefined,
      isActive: is_active,
    });

    logger.info(`User updated: userId=${id}, by userId=${req.user.id}`);
    res.json({ success: true, data: { user: updatedUser }, message: 'Usuario actualizado exitosamente' });
  },

  resetPassword(req, res) {
    const id = Number(req.params.id);
    findUserOr404(id);

    User.updatePassword(id, bcrypt.hashSync(req.body.password, BCRYPT_ROUNDS));

    logger.info(`Password reset for userId=${id}, by userId=${req.user.id}`);
    res.json({ success: true, data: null, message: 'Contraseña restablecida exitosamente' });
  },

  toggleActive(req, res) {
    const id = Number(req.params.id);
    const user = findUserOr404(id);

    if (id === req.user.id) {
      throw new AppError('No puede desactivar su propia cuenta', 400, 'SELF_DEACTIVATION');
    }

    const newStatus = user.is_active ? 0 : 1;
    const updatedUser = User.update(id, { isActive: newStatus });

    const action = newStatus ? 'activado' : 'desactivado';
    logger.info(`User ${action}: userId=${id}, by userId=${req.user.id}`);
    res.json({ success: true, data: { user: updatedUser }, message: `Usuario ${action} exitosamente` });
  },
};

module.exports = userController;
