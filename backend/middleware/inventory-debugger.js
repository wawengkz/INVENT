// ============================================
// INVENTORY SYSTEM DEBUGGER & PERFORMANCE MONITOR
// ============================================

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class InventoryDebugger extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      logLevel: options.logLevel || 'info', // debug, info, warn, error
      logToFile: options.logToFile !== false,
      logToConsole: options.logToConsole !== false,
      maxLogSize: options.maxLogSize || 10 * 1024 * 1024, // 10MB
      performanceThreshold: options.performanceThreshold || 1000, // 1 second
      memoryThreshold: options.memoryThreshold || 100 * 1024 * 1024, // 100MB
      logRetention: options.logRetention || 7, // days
      ...options
    };
    
    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    this.performanceMetrics = new Map();
    this.memoryUsage = [];
    this.activeConnections = new Set();
    this.operationQueue = [];
    
    this.setupLogging();
    this.startMemoryMonitoring();
    this.startPerformanceMonitoring();
  }

  // ============================================
  // LOGGING SYSTEM
  // ============================================
  
  async setupLogging() {
    if (this.options.logToFile) {
      this.logDir = path.join(process.cwd(), 'logs');
      try {
        await fs.mkdir(this.logDir, { recursive: true });
      } catch (error) {
        console.error('Failed to create log directory:', error);
      }
    }
  }

  async log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      metadata: {
        ...metadata,
        pid: process.pid,
        memory: this.getMemoryUsage(),
        uptime: process.uptime(),
        requestCount: this.requestCount,
        errorCount: this.errorCount
      }
    };

    if (this.options.logToConsole) {
      this.consoleLog(logEntry);
    }

    if (this.options.logToFile) {
      await this.fileLog(logEntry);
    }

    this.emit('log', logEntry);
  }

  consoleLog(entry) {
    const colors = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
      RESET: '\x1b[0m'
    };

    const color = colors[entry.level] || colors.RESET;
    const prefix = `${color}[${entry.timestamp}] ${entry.level}${colors.RESET}`;
    
    console.log(`${prefix}: ${entry.message}`);
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      console.log(`  Metadata:`, JSON.stringify(entry.metadata, null, 2));
    }
  }

  async fileLog(entry) {
    try {
      const logFile = path.join(this.logDir, `inventory-${new Date().toISOString().split('T')[0]}.log`);
      const logLine = JSON.stringify(entry) + '\n';
      
      await fs.appendFile(logFile, logLine);
      
      // Check file size and rotate if necessary
      const stats = await fs.stat(logFile);
      if (stats.size > this.options.maxLogSize) {
        await this.rotateLog(logFile);
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  async rotateLog(logFile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
    
    try {
      await fs.rename(logFile, rotatedFile);
      this.log('info', 'Log file rotated', { rotatedFile });
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  // ============================================
  // PERFORMANCE MONITORING
  // ============================================

  startTimer(operation) {
    const timerId = `${operation}_${Date.now()}_${Math.random()}`;
    this.performanceMetrics.set(timerId, {
      operation,
      startTime: process.hrtime.bigint(),
      startMemory: this.getMemoryUsage()
    });
    return timerId;
  }

  endTimer(timerId) {
    const metric = this.performanceMetrics.get(timerId);
    if (!metric) return null;

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - metric.startTime) / 1000000; // Convert to milliseconds
    const endMemory = this.getMemoryUsage();
    
    const result = {
      operation: metric.operation,
      duration,
      memoryDelta: endMemory.heapUsed - metric.startMemory.heapUsed,
      startMemory: metric.startMemory,
      endMemory
    };

    this.performanceMetrics.delete(timerId);

    // Log slow operations
    if (duration > this.options.performanceThreshold) {
      this.log('warn', `Slow operation detected: ${metric.operation}`, {
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta: `${(result.memoryDelta / 1024 / 1024).toFixed(2)}MB`
      });
    }

    return result;
  }

  // ============================================
  // MEMORY MONITORING
  // ============================================

  getMemoryUsage() {
    return process.memoryUsage();
  }

  startMemoryMonitoring() {
    setInterval(() => {
      const usage = this.getMemoryUsage();
      this.memoryUsage.push({
        timestamp: Date.now(),
        ...usage
      });

      // Keep only last 100 measurements
      if (this.memoryUsage.length > 100) {
        this.memoryUsage.shift();
      }

      // Check for memory leaks
      if (usage.heapUsed > this.options.memoryThreshold) {
        this.log('warn', 'High memory usage detected', {
          heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
          threshold: `${(this.options.memoryThreshold / 1024 / 1024).toFixed(2)}MB`
        });
      }
    }, 5000); // Check every 5 seconds
  }

  getMemoryTrend() {
    if (this.memoryUsage.length < 2) return null;

    const recent = this.memoryUsage.slice(-10);
    const trend = recent.reduce((acc, curr, index) => {
      if (index === 0) return acc;
      const prev = recent[index - 1];
      acc.push(curr.heapUsed - prev.heapUsed);
      return acc;
    }, []);

    const avgTrend = trend.reduce((a, b) => a + b, 0) / trend.length;
    return {
      trend: avgTrend > 0 ? 'increasing' : avgTrend < 0 ? 'decreasing' : 'stable',
      rate: avgTrend,
      currentUsage: recent[recent.length - 1].heapUsed
    };
  }

  // ============================================
  // EXPRESS MIDDLEWARE
  // ============================================

  createMiddleware() {
    return (req, res, next) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timerId = this.startTimer(`HTTP_${req.method}_${req.path}`);
      
      req.debuggerInfo = {  // Changed from 'req.debugger' to 'req.debuggerInfo'
        requestId,
        timerId,
        startTime: Date.now()
      };

      this.requestCount++;
      this.activeConnections.add(requestId);

      this.log('debug', `Incoming request: ${req.method} ${req.path}`, {
        requestId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length'),
        activeConnections: this.activeConnections.size
      });

      // Monitor request size
      if (req.get('Content-Length')) {
        const size = parseInt(req.get('Content-Length'));
        if (size > 1024 * 1024) { // 1MB
          this.log('warn', 'Large request body detected', {
            requestId,
            size: `${(size / 1024 / 1024).toFixed(2)}MB`,
            path: req.path
          });
        }
      }

      // Override res.json to monitor response sizes
      const originalJson = res.json;
      res.json = function(data) {
        const responseSize = JSON.stringify(data).length;
        if (responseSize > 1024 * 1024) { // 1MB
          req.debuggerInfo.largeResponse = true;  // Changed from 'req.debugger' to 'req.debuggerInfo'
        }
        return originalJson.call(this, data);
      };

      // Monitor response completion
      res.on('finish', () => {
        const performance = this.endTimer(timerId);
        const duration = Date.now() - req.debuggerInfo.startTime;  // Changed from 'req.debugger' to 'req.debuggerInfo'
        
        this.activeConnections.delete(requestId);

        const logLevel = res.statusCode >= 400 ? 'error' : 
                        duration > this.options.performanceThreshold ? 'warn' : 'info';

        this.log(logLevel, `Request completed: ${req.method} ${req.path}`, {
          requestId,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          responseTime: performance ? `${performance.duration.toFixed(2)}ms` : 'unknown',
          memoryDelta: performance ? `${(performance.memoryDelta / 1024).toFixed(2)}KB` : 'unknown',
          largeResponse: req.debuggerInfo.largeResponse || false  // Changed from 'req.debugger' to 'req.debuggerInfo'
        });
      });

      next();
    };
  }

  // ============================================
  // ERROR HANDLING
  // ============================================

  handleError(error, context = {}) {
    this.errorCount++;
    
    this.log('error', error.message, {
      ...context,
      stack: error.stack,
      name: error.name,
      code: error.code
    });

    // Detect memory issues
    const memUsage = this.getMemoryUsage();
    if (memUsage.heapUsed > this.options.memoryThreshold * 0.8) {
      this.log('warn', 'Error occurred during high memory usage', {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        errorType: error.name
      });
    }
  }

  // ============================================
  // BATCH OPERATION MONITORING
  // ============================================

  monitorBatchOperation(batchName, items) {
    const batchId = `batch_${batchName}_${Date.now()}`;
    const timerId = this.startTimer(batchName);
    
    this.log('info', `Starting batch operation: ${batchName}`, {
      batchId,
      itemCount: Array.isArray(items) ? items.length : items,
      memoryBefore: this.getMemoryUsage()
    });

    return {
      batchId,
      complete: (results = null, errors = null) => {
        const performance = this.endTimer(timerId);
        
        this.log('info', `Completed batch operation: ${batchName}`, {
          batchId,
          duration: `${performance.duration.toFixed(2)}ms`,
          memoryDelta: `${(performance.memoryDelta / 1024 / 1024).toFixed(2)}MB`,
          successCount: results ? (Array.isArray(results) ? results.length : 1) : 0,
          errorCount: errors ? (Array.isArray(errors) ? errors.length : 1) : 0,
          memoryAfter: this.getMemoryUsage()
        });

        if (errors && errors.length > 0) {
          this.log('warn', `Batch operation had errors: ${batchName}`, {
            batchId,
            errors: Array.isArray(errors) ? errors.map(e => e.message) : [errors.message]
          });
        }
      }
    };
  }

  // ============================================
  // RESOURCE MONITORING
  // ============================================

  getSystemStatus() {
    const memUsage = this.getMemoryUsage();
    const uptime = process.uptime();
    const memTrend = this.getMemoryTrend();
    
    return {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,
        trend: memTrend
      },
      requests: {
        total: this.requestCount,
        active: this.activeConnections.size,
        errors: this.errorCount,
        errorRate: this.requestCount > 0 ? ((this.errorCount / this.requestCount) * 100).toFixed(2) : 0
      },
      operations: {
        active: this.operationQueue.length
      }
    };
  }

  startPerformanceMonitoring() {
    // Log system status every minute
    setInterval(() => {
      const status = this.getSystemStatus();
      this.log('info', 'System status check', status);
    }, 60000);
  }

  // ============================================
  // CLEANUP
  // ============================================

  async cleanup() {
    this.log('info', 'Shutting down debugger');
  }
}

// ============================================
// MONGOOSE PLUGIN
// ============================================

function createMongoosePlugin(inventoryDebuggerInstance) {  // Changed parameter name
  return function(schema, options) {
    schema.pre(['save', 'findOneAndUpdate', 'updateOne', 'updateMany'], function() {
      this._debugTimerId = inventoryDebuggerInstance.startTimer(`${this.constructor.modelName}.${this.op || 'save'}`);  // Updated reference
    });

    schema.post(['save', 'findOneAndUpdate', 'updateOne', 'updateMany'], function() {
      if (this._debugTimerId) {
        inventoryDebuggerInstance.endTimer(this._debugTimerId);  // Updated reference
      }
    });

    schema.post(['save', 'findOneAndUpdate', 'updateOne', 'updateMany'], function(error) {
      if (error && this._debugTimerId) {
        inventoryDebuggerInstance.endTimer(this._debugTimerId);  // Updated reference
        inventoryDebuggerInstance.handleError(error, {  // Updated reference
          model: this.constructor.modelName,
          operation: this.op || 'save'
        });
      }
    });
  };
}

module.exports = { InventoryDebugger, createMongoosePlugin };