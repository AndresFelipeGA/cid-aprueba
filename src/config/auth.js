const config = require('./env');

module.exports = {
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
};
