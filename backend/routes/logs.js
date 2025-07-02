const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { protect } = require('../middleware/auth');
const { body, validationResult, query } = require('express-validator');

// Get logs with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('action').optional().isIn(['create', 'update', 'delete']),
  query('item').optional().isString(),
  query('field').optional().isString(),
  query('auditDate').optional().isISO8601()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const {
      page = 1,
      limit = 100,
      startDate,
      endDate,
      action,
      item,
      field,
      auditDate
    } = req.query;

    const filters = {
      limit: parseInt(limit),
      startDate,
      endDate,
      action,
      item,
      field,
      auditDate
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => 
      filters[key] === undefined && delete filters[key]
    );

    const logs = await Log.getFilteredLogs(filters);
    
    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedLogs = logs.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      data: paginatedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: logs.length,
        pages: Math.ceil(logs.length / parseInt(limit))
      },
      filters: filters
    });
  } catch (err) {
    next(err);
  }
});

// Get logs for specific audit date
router.get('/audit/:date', async (req, res, next) => {
  try {
    const auditDate = new Date(req.params.date);
    
    if (isNaN(auditDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }

    const logs = await Log.getAuditLogs(auditDate);

    res.status(200).json({
      success: true,
      data: logs,
      count: logs.length
    });
  } catch (err) {
    next(err);
  }
});

// Create new log entry
router.post('/', [
  body('action').isIn(['create', 'update', 'delete']).withMessage('Invalid action'),
  body('auditDate').isISO8601().withMessage('Invalid audit date'),
  body('description').notEmpty().withMessage('Description is required'),
  body('item').optional().isString(),
  body('field').optional().isString(),
  body('oldValue').optional(),
  body('newValue').optional(),
  body('relatedTo').optional().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const logData = {
      ...req.body,
      auditDate: new Date(req.body.auditDate),
      userId: req.user ? req.user._id : null,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    };

    const log = await Log.create(logData);

    res.status(201).json({
      success: true,
      data: log
    });
  } catch (err) {
    next(err);
  }
});

// Get recent activity summary
router.get('/summary/recent', async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const summary = await Log.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            action: '$action',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.action',
          dailyCounts: {
            $push: {
              date: '$_id.date',
              count: '$count'
            }
          },
          totalCount: { $sum: '$count' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: summary,
      period: {
        days: parseInt(days),
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get user activity summary
router.get('/summary/user/:userId?', async (req, res, next) => {
  try {
    const userId = req.params.userId || (req.user ? req.user._id : null);
    const { days = 30 } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required'
      });
    }

    const summary = await Log.getUserActivitySummary(userId, parseInt(days));

    res.status(200).json({
      success: true,
      data: summary,
      userId: userId,
      period: parseInt(days)
    });
  } catch (err) {
    next(err);
  }
});

// Get logs by item
router.get('/item/:item', [
  query('days').optional().isInt({ min: 1, max: 365 })
], async (req, res, next) => {
  try {
    const { item } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const logs = await Log.find({
      item: item,
      timestamp: { $gte: startDate }
    })
    .populate('userId', 'username firstName lastName')
    .sort({ timestamp: -1 })
    .limit(500);

    res.status(200).json({
      success: true,
      data: logs,
      item: item,
      period: parseInt(days)
    });
  } catch (err) {
    next(err);
  }
});

// Export logs as CSV
router.get('/export', [
  query('format').optional().isIn(['csv', 'json']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res, next) => {
  try {
    const { format = 'csv', startDate, endDate } = req.query;
    
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const logs = await Log.getFilteredLogs(filters);

    if (format === 'csv') {
      // Convert to CSV
      const csvHeaders = [
        'Timestamp',
        'Action',
        'Audit Date',
        'Item',
        'Field',
        'Old Value',
        'New Value',
        'Description',
        'User',
        'IP Address'
      ];

      const csvRows = logs.map(log => [
        log.timestamp.toISOString(),
        log.action,
        log.auditDate.toISOString(),
        log.item || '',
        log.field || '',
        log.oldValue || '',
        log.newValue || '',
        log.description,
        log.userId ? `${log.userId.firstName} ${log.userId.lastName}` : '',
        log.ipAddress || ''
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      // Return as JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.json"`);
      res.json({
        exportDate: new Date().toISOString(),
        totalRecords: logs.length,
        filters: filters,
        data: logs
      });
    }
  } catch (err) {
    next(err);
  }
});

// Delete old logs (admin only)
router.delete('/cleanup', protect, async (req, res, next) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { daysToKeep = 365 } = req.body;
    
    const result = await Log.cleanOldLogs(parseInt(daysToKeep));

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} old log entries`,
      deletedCount: result.deletedCount,
      daysKept: parseInt(daysToKeep)
    });
  } catch (err) {
    next(err);
  }
});

// Get log statistics
router.get('/stats', async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const stats = await Log.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $facet: {
          totalLogs: [{ $count: 'count' }],
          byAction: [
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byItem: [
            { $match: { item: { $exists: true, $ne: null } } },
            { $group: { _id: '$item', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          byUser: [
            { $match: { userId: { $exists: true, $ne: null } } },
            { $group: { _id: '$userId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          dailyActivity: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: stats[0],
      period: parseInt(days)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;