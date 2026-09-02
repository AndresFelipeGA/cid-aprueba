const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const authenticate = require('../middleware/authenticate');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// GET /api/dashboard/stats
router.get(
  '/stats',
  authenticate,
  asyncHandler(dashboardController.getStats),
);

// GET /api/dashboard/pending
router.get(
  '/pending',
  authenticate,
  asyncHandler(dashboardController.getPending),
);

// GET /api/dashboard/recent
router.get(
  '/recent',
  authenticate,
  asyncHandler(dashboardController.getRecent),
);

module.exports = router;
