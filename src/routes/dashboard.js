const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { pagination } = require('../middleware/validators');

const router = express.Router();

router.use(authenticate);

// GET /api/dashboard/stats
router.get('/stats', asyncHandler(dashboardController.getStats));

// GET /api/dashboard/pending
router.get('/pending', pagination, validate, asyncHandler(dashboardController.getPending));

// GET /api/dashboard/recent
router.get('/recent', pagination, validate, asyncHandler(dashboardController.getRecent));

module.exports = router;
