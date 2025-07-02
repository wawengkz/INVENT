// ============================================
// ENHANCED ERROR HANDLER & MIDDLEWARE
// ============================================

const { InventoryDebugger } = require('./inventory-debugger');

// Initialize global debugger instance
const inventoryDebugger = new InventoryDebugger({
  logLevel: process.env.LOG_LEVEL || 'info',
  performanceThreshold: parseInt(process.env.PERF_THRESHOLD) || 1000,
  memoryThreshold: parseInt(process.env.MEMORY_THRESHOLD) || 100 * 1024 * 1024
});

// ============================================
// REQUEST VALIDATION MIDDLEWARE
// ============================================

const validateRequest = (validationRules) => {
  return (req, res, next) => {
    const timerId = inventoryDebugger.startTimer('request_validation');
    
    try {
      // Validate request size
      const contentLength = req.get('Content-Length');
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
        inventoryDebugger.log('warn', 'Request too large', {
          size: `${(parseInt(contentLength) / 1024 / 1024).toFixed(2)}MB`,
          path: req.path,
          ip: req.ip
        });
        
        return res.status(413).json({
          success: false,
          error: 'Request entity too large',
          maxSize: '10MB'
        });
      }

      // Validate batch operations
      if (req.body && Array.isArray(req.body)) {
        if (req.body.length > 1000) {
          inventoryDebugger.log('warn', 'Batch operation too large', {
            batchSize: req.body.length,
            path: req.path
          });
          
          return res.status(400).json({
            success: false,
            error: 'Batch size too large',
            maxBatchSize: 1000,
            currentSize: req.body.length
          });
        }
      }

      inventoryDebugger.endTimer(timerId);
      next();
    } catch (error) {
      inventoryDebugger.endTimer(timerId);
      inventoryDebugger.handleError(error, { middleware: 'validateRequest' });
      next(error);
    }
  };
};

// ============================================
// RATE LIMITING MIDDLEWARE
// ============================================

const rateLimitStore = new Map();

const createRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    keyGenerator = (req) => req.ip,
    message = 'Too many requests'
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get or create rate limit data for this key
    let limitData = rateLimitStore.get(key) || { requests: [], blocked: false };
    
    // Remove old requests outside the window
    limitData.requests = limitData.requests.filter(time => time > windowStart);
    
    // Check if limit exceeded
    if (limitData.requests.length >= max) {
      if (!limitData.blocked) {
        inventoryDebugger.log('warn', 'Rate limit exceeded', {
          key,
          requests: limitData.requests.length,
          max,
          path: req.path
        });
        limitData.blocked = true;
      }
      
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': new Date(now + windowMs)
      });
      
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request
    limitData.requests.push(now);
    limitData.blocked = false;
    rateLimitStore.set(key, limitData);
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': max - limitData.requests.length,
      'X-RateLimit-Reset': new Date(now + windowMs)
    });
    
    next();
  };
};

// ============================================
// BULK OPERATION MIDDLEWARE
// ============================================

const bulkOperationMiddleware = (options = {}) => {
  const maxBatchSize = options.maxBatchSize || 1000;
  const chunkSize = options.chunkSize || 100;

  return async (req, res, next) => {
    const timerId = inventoryDebugger.startTimer('bulk_operation_middleware');
    
    try {
      // Check if this is a bulk operation
      if (req.body && Array.isArray(req.body) && req.body.length > 1) {
        const batchSize = req.body.length;
        
        inventoryDebugger.log('info', 'Bulk operation detected', {
          batchSize,
          path: req.path,
          method: req.method
        });

        if (batchSize > maxBatchSize) {
          inventoryDebugger.endTimer(timerId);
          return res.status(400).json({
            success: false,
            error: `Batch size ${batchSize} exceeds maximum of ${maxBatchSize}`,
            suggestion: `Consider splitting into smaller batches of ${chunkSize} items`
          });
        }

        // Add batch processing metadata to request
        req.batchMeta = {
          size: batchSize,
          chunkSize: Math.min(chunkSize, batchSize),
          chunks: Math.ceil(batchSize / chunkSize),
          startTime: Date.now()
        };
      }

      inventoryDebugger.endTimer(timerId);
      next();
    } catch (error) {
      inventoryDebugger.endTimer(timerId);
      inventoryDebugger.handleError(error, { middleware: 'bulkOperation' });
      next(error);
    }
  };
};

// ============================================
// MEMORY MONITORING MIDDLEWARE
// ============================================

const memoryGuardMiddleware = (options = {}) => {
  const maxMemory = options.maxMemory || 200 * 1024 * 1024; // 200MB

  return (req, res, next) => {
    const memUsage = process.memoryUsage();
    
    // Check if memory usage is too high
    if (memUsage.heapUsed > maxMemory) {
      inventoryDebugger.log('error', 'Memory usage too high, rejecting request', {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        maxMemory: `${(maxMemory / 1024 / 1024).toFixed(2)}MB`,
        path: req.path
      });

      return res.status(503).json({
        success: false,
        error: 'Server overloaded',
        reason: 'High memory usage'
      });
    }

    next();
  };
};

// ============================================
// ENHANCED ERROR HANDLER
// ============================================

const enhancedErrorHandler = (err, req, res, next) => {
  inventoryDebugger.handleError(err, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.debuggerInfo?.requestId
  });

  // Default error response
  let error = {
    success: false,
    error: 'Internal Server Error',
    timestamp: new Date().toISOString()
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    error.error = 'Validation Error';
    error.details = Object.values(err.errors).map(e => e.message);
    error.statusCode = 400;
  } else if (err.code === 11000) {
    error.error = 'Duplicate Entry';
    error.field = Object.keys(err.keyValue)[0];
    error.value = err.keyValue[Object.keys(err.keyValue)[0]];
    error.statusCode = 409;
  } else if (err.name === 'CastError') {
    error.error = 'Invalid ID Format';
    error.field = err.path;
    error.statusCode = 400;
  } else if (err.name === 'MongoError') {
    error.error = 'Database Error';
    error.code = err.code;
    error.statusCode = 500;
  }

  // Add debug information in development
  if (process.env.NODE_ENV === 'development') {
    error.stack = err.stack;
    error.details = err.message;
  }

  const statusCode = error.statusCode || 500;
  delete error.statusCode;

  res.status(statusCode).json(error);
};

// ============================================
// BATCH PROCESSING UTILITIES
// ============================================

const processBatch = async (items, processor, options = {}) => {
  const chunkSize = options.chunkSize || 100;
  const delay = options.delay || 0; // Delay between chunks in ms
  const batchMonitor = inventoryDebugger.monitorBatchOperation('processBatch', items.length);
  
  const results = [];
  const errors = [];
  
  try {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const chunkId = Math.floor(i / chunkSize) + 1;
      const totalChunks = Math.ceil(items.length / chunkSize);
      
      inventoryDebugger.log('debug', `Processing chunk ${chunkId}/${totalChunks}`, {
        chunkSize: chunk.length,
        startIndex: i,
        endIndex: Math.min(i + chunkSize - 1, items.length - 1)
      });
      
      try {
        const chunkResults = await processor(chunk);
        results.push(...(Array.isArray(chunkResults) ? chunkResults : [chunkResults]));
        
        // Add delay between chunks to prevent overwhelming the system
        if (delay > 0 && i + chunkSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        inventoryDebugger.log('error', `Chunk ${chunkId} processing failed`, {
          error: error.message,
          chunkSize: chunk.length
        });
        errors.push({ chunk: chunkId, error: error.message, items: chunk.length });
      }
    }
    
    batchMonitor.complete(results, errors);
    return { results, errors, total: items.length };
  } catch (error) {
    batchMonitor.complete(null, [error]);
    throw error;
  }
};

// ============================================
// HEALTH CHECK MIDDLEWARE
// ============================================

const healthCheckMiddleware = (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    system: inventoryDebugger.getSystemStatus()
  };

  // Determine overall health status
  const memUsage = health.memory.heapUsed / 1024 / 1024; // MB
  const errorRate = parseFloat(health.system.requests.errorRate);

  if (memUsage > 150 || errorRate > 10) {
    health.status = 'DEGRADED';
  }

  if (memUsage > 200 || errorRate > 25) {
    health.status = 'UNHEALTHY';
  }

  const statusCode = health.status === 'OK' ? 200 : 
                    health.status === 'DEGRADED' ? 200 : 503;

  res.status(statusCode).json(health);
};

module.exports = {
  inventoryDebugger,
  validateRequest,
  createRateLimit,
  bulkOperationMiddleware,
  memoryGuardMiddleware,
  enhancedErrorHandler,
  healthCheckMiddleware,
  processBatch
};