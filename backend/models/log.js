const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete'],
    index: true
  },
  auditDate: {
    type: Date,
    required: true,
    index: true
  },
  item: {
    type: String,
    index: true
  },
  field: {
    type: String,
    index: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  description: {
    type: String,
    required: true
  },
  relatedTo: {
    type: String
  },
  relatedChanges: [{
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
  }],
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  sessionId: {
    type: String
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
});

// Compound indexes for efficient querying
logSchema.index({ timestamp: -1, action: 1 });
logSchema.index({ auditDate: 1, action: 1 });
logSchema.index({ item: 1, field: 1, timestamp: -1 });
logSchema.index({ userId: 1, timestamp: -1 });

// Virtual for formatted timestamp
logSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toLocaleString();
});

// Virtual for change magnitude (for numeric values)
logSchema.virtual('changeMagnitude').get(function() {
  if (this.oldValue !== null && this.newValue !== null) {
    const oldNum = parseFloat(this.oldValue);
    const newNum = parseFloat(this.newValue);
    
    if (!isNaN(oldNum) && !isNaN(newNum)) {
      return newNum - oldNum;
    }
  }
  return null;
});

// Static method to get logs with filters
logSchema.statics.getFilteredLogs = async function(filters = {}) {
  const query = {};
  
  if (filters.startDate && filters.endDate) {
    query.timestamp = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  } else if (filters.startDate) {
    query.timestamp = { $gte: new Date(filters.startDate) };
  } else if (filters.endDate) {
    query.timestamp = { $lte: new Date(filters.endDate) };
  }
  
  if (filters.action) {
    query.action = filters.action;
  }
  
  if (filters.item) {
    query.item = filters.item;
  }
  
  if (filters.field) {
    query.field = filters.field;
  }
  
  if (filters.userId) {
    query.userId = filters.userId;
  }
  
  if (filters.auditDate) {
    query.auditDate = {
      $gte: new Date(filters.auditDate),
      $lt: new Date(new Date(filters.auditDate).getTime() + 24 * 60 * 60 * 1000)
    };
  }
  
  return this.find(query)
    .populate('userId', 'username firstName lastName')
    .sort({ timestamp: -1 })
    .limit(filters.limit || 1000);
};

// Static method to get recent logs
logSchema.statics.getRecentLogs = async function(limit = 100) {
  return this.find({})
    .populate('userId', 'username firstName lastName')
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to get logs for specific audit
logSchema.statics.getAuditLogs = async function(auditDate) {
  return this.find({ auditDate: new Date(auditDate) })
    .populate('userId', 'username firstName lastName')
    .sort({ timestamp: -1 });
};

// Static method to get user activity summary
logSchema.statics.getUserActivitySummary = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        lastActivity: { $max: '$timestamp' }
      }
    }
  ]);
};

// Static method to clean old logs
logSchema.statics.cleanOldLogs = async function(daysToKeep = 365) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  return this.deleteMany({ timestamp: { $lt: cutoffDate } });
};

// Method to get related logs
logSchema.methods.getRelatedLogs = async function() {
  return this.constructor.find({
    auditDate: this.auditDate,
    item: this.item,
    timestamp: {
      $gte: new Date(this.timestamp.getTime() - 5000), // 5 seconds before
      $lte: new Date(this.timestamp.getTime() + 5000)  // 5 seconds after
    }
  }).sort({ timestamp: 1 });
};

module.exports = mongoose.model('Log', logSchema);