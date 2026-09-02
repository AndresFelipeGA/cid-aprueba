const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const db = require('./src/config/database');

const PORT = config.port;

(async () => {
  try {
    // Initialize sql.js database (async) before loading the app
    await db.initializeDatabase();

    // Now load the Express app (models will use the initialized db wrapper)
    const app = require('./src/app');

    app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT} (${config.nodeEnv})`);
    });
  } catch (err) {
    logger.error('Failed to start server', { stack: err.stack });
    process.exit(1);
  }
})();
