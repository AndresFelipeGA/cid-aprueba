const Requisition = require('../models/Requisition');
const ApprovalLog = require('../models/ApprovalLog');

const dashboardController = {
  getStats(req, res) {
    const statusCounts = Requisition.countByStatus();
    const levelCounts = Requisition.countByLevel();
    const recentActivity = ApprovalLog.findRecent({ limit: 10 });

    // Build by_status object for charts
    const byStatus = {
      pending: (statusCounts.pending || 0),
      in_review: (statusCounts.in_review || 0),
      approved: (statusCounts.approved || 0),
      rejected: (statusCounts.rejected || 0),
    };

    // Build by_step object with all 7 steps (fill zeros for missing steps)
    const byStep = {};
    for (let i = 1; i <= 7; i++) {
      byStep[String(i)] = 0;
    }
    for (const row of levelCounts) {
      if (row.level >= 1 && row.level <= 7) {
        byStep[String(row.level)] = row.count;
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          total: statusCounts.total || 0,
          pending: statusCounts.pending || 0,
          in_review: statusCounts.in_review || 0,
          approved: statusCounts.approved || 0,
          rejected: statusCounts.rejected || 0,
        },
        by_level: levelCounts,
        by_status: byStatus,
        by_step: byStep,
        recent_activity: recentActivity,
      },
      message: null,
    });
  },

  getPending(req, res) {
    const userRoleLevel = req.user.role_level;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const { items, total } = Requisition.findPendingForRole(userRoleLevel, { limit, offset });

    res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
      },
      message: null,
    });
  },

  getRecent(req, res) {
    const limit = parseInt(req.query.limit, 10) || 10;
    const items = Requisition.findRecent({ limit });

    res.json({
      success: true,
      data: { items },
      message: null,
    });
  },
};

module.exports = dashboardController;
