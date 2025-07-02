require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import debugging and error handling - FIXED IMPORT
const {
  inventoryDebugger,  // Changed from 'debugger' to 'inventoryDebugger'
  validateRequest,
  createRateLimit,
  bulkOperationMiddleware,
  memoryGuardMiddleware,
  enhancedErrorHandler,
  healthCheckMiddleware,
  processBatch
} = require('./middleware/enhanced-error-handler');

const { createMongoosePlugin } = require('./middleware/inventory-debugger');

// Import routes
const authRoutes = require('./routes/auth');
const auditRoutes = require('./routes/audits');
const reportRoutes = require('./routes/reports');
const departmentRoutes = require('./routes/departments');
const logRoutes = require('./routes/logs');
const stationRoutes = require('./routes/stations');
const bayRoutes = require('./routes/bays');
const advancedStationRoutes = require('./routes/advanced-stations');

const app = express();

// ============================================
// SECURITY & BASIC MIDDLEWARE
// ============================================

app.use(helmet());
app.use(cors());

// Custom morgan format for better logging
app.use(morgan('combined', {
  stream: {
    write: (message) => {
      inventoryDebugger.log('info', message.trim(), { source: 'morgan' });
    }
  }
}));

// ============================================
// DEBUGGING & MONITORING MIDDLEWARE
// ============================================

// Main debugger middleware (must be early)
app.use(inventoryDebugger.createMiddleware());

// Memory guard (reject requests if memory too high)
app.use(memoryGuardMiddleware({
  maxMemory: parseInt(process.env.MAX_MEMORY) || 200 * 1024 * 1024
}));

// Rate limiting
const generalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});

// Apply rate limiting to all API routes EXCEPT health and status
app.use('/api', (req, res, next) => {
  // Skip rate limiting for health and status endpoints
  if (req.path === '/health' || req.path === '/system/status') {
    return next();
  }
  return generalRateLimit(req, res, next);
});

// Body parser with size limits
app.use(express.json({ 
  limit: process.env.JSON_LIMIT || '10mb'
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Bulk operation middleware
app.use(bulkOperationMiddleware({
  maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE) || 1000,
  chunkSize: parseInt(process.env.CHUNK_SIZE) || 100
}));

// ============================================
// DATABASE CONNECTION WITH MONITORING
// ============================================

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: parseInt(process.env.DB_TIMEOUT) || 5000,
      socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT) || 45000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 1000
      }
    });
    
    inventoryDebugger.log('info', 'MongoDB connected successfully');
    
    // Add debugging plugin to all models
    mongoose.plugin(createMongoosePlugin(inventoryDebugger));
    
    return true;
  } catch (error) {
    inventoryDebugger.handleError(error, { context: 'database_connection' });
    throw error;
  }
}
// ============================================
// ROUTES
// ============================================

// Health check endpoint
app.get('/api/health', healthCheckMiddleware);

// System status endpoint
app.get('/api/system/status', (req, res) => {
  const status = inventoryDebugger.getSystemStatus();
  
  res.json({
    success: true,
    data: {
      ...status,
      environment: process.env.NODE_ENV,
      version: '1.0.0'
    }
  });
});

// Apply routes
app.use('/api/auth', authRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/bays', bayRoutes);
app.use('/api/stations-advanced', advancedStationRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use('*', (req, res) => {
  inventoryDebugger.log('warn', '404 - Route not found', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Enhanced error handler (must be last)
app.use(enhancedErrorHandler);

// ============================================
// SERVER STARTUP
// ============================================

async function startServer() {
  try {
    // Connect to database
    await connectToDatabase();
    
    // Start server
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      inventoryDebugger.log('info', `Server started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        features: ['debugging', 'monitoring', 'bulk-operations'],
        pid: process.pid
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      inventoryDebugger.log('info', 'Received SIGTERM, shutting down gracefully');
      server.close(() => {
        mongoose.connection.close(() => {
          inventoryDebugger.log('info', 'Server shut down complete');
          process.exit(0);
        });
      });
    });

    return server;
    
  } catch (error) {
    inventoryDebugger.log('error', 'Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;