require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const os = require('os');
const path = require('path');
const fs = require('fs');

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

// Enhanced CORS configuration for network access
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // Allow any origin for development - CHANGE THIS FOR PRODUCTION
    return callback(null, true);
    
    // For production, use specific origins:
    // const allowedOrigins = [
    //   'http://localhost:3000',
    //   'http://192.168.1.100:3000', // Your computer's IP
    //   'http://your-domain.com'
    // ];
    // if (allowedOrigins.indexOf(origin) !== -1) {
    //   return callback(null, true);
    // }
    // return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Basic middleware - Helmet completely removed for debugging
// TODO: Re-enable Helmet for production
// app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend folder (with absolute path)
app.use(express.static(path.join(__dirname, '../frontend')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    createDefaultUsers();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Create default users if they don't exist
async function createDefaultUsers() {
  try {
    const User = require('./models/User');
    
    // Check if admin exists
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const defaultAdmin = new User({
        username: 'admin',
        email: 'admin@inventory.com',
        password: 'password123',
        role: 'admin',
        department: 'IT',
        site: 'Calamba'
      });
      
      await defaultAdmin.save();
      console.log('✅ Default admin user created (admin/password123) - Site: Calamba');
    }

    // Check if default users exist for each site
    const sites = ['Calamba', 'Bay', 'Los Baños', 'La Espacio'];
    
    for (const site of sites) {
  const userExists = await User.findOne({ role: 'user', site: site });
  if (!userExists) {
    const siteName = site.toLowerCase()
      .replace(/\s+/g, '')      // Remove spaces
      .replace(/ñ/g, 'n');      // Replace ñ with n
    const defaultUser = new User({
      username: `user_${siteName}`,
      email: `user_${siteName}@inventory.com`,
      password: 'password123',
      role: 'user',
      department: 'Production',
      site: site
    });
    
    await defaultUser.save();
    console.log(`✅ Default user account created (user_${siteName}/password123) - Site: ${site}`);
  }
}
  } catch (error) {
    console.error('❌ Error creating default users:', error);
  }
}

// Import authentication middleware (after MongoDB connection)
let authenticateToken, requireAdmin;
try {
  const authMiddleware = require('./routes/auth');
  authenticateToken = authMiddleware.authenticateToken;
  requireAdmin = authMiddleware.requireAdmin;
} catch (error) {
  console.warn('⚠️  Authentication middleware not found, some routes may not work');
}

// Public API Routes (no authentication required)
app.use('/api/auth', authRoutes);

// Protected API Routes (authentication required)
if (authenticateToken) {
  app.use('/api/stations', authenticateToken, stationRoutes);
  app.use('/api/bays', authenticateToken, bayRoutes);
  app.use('/api/stations-advanced', authenticateToken, advancedStationRoutes);
  app.use('/api/audits', authenticateToken, auditRoutes);
  app.use('/api/reports', authenticateToken, reportRoutes);
  app.use('/api/logs', authenticateToken, logRoutes);
} else {
  // Fallback without authentication for development
  app.use('/api/stations', stationRoutes);
  app.use('/api/bays', bayRoutes);
  app.use('/api/stations-advanced', advancedStationRoutes);
  app.use('/api/audits', auditRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/logs', logRoutes);
}

// Admin-only routes
if (authenticateToken && requireAdmin) {
  app.use('/api/departments', authenticateToken, requireAdmin, departmentRoutes);
} else {
  app.use('/api/departments', departmentRoutes);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    uptime: process.uptime(),
    server: getServerInfo(),
    authentication: authenticateToken ? 'enabled' : 'disabled'
  });
});

// Debug route - Enhanced with auth info
app.get('/debug', (req, res) => {
  const frontendPath = path.join(__dirname, '../frontend');
  const dashboardPath = path.join(frontendPath, 'dashboard.html');
  const loginPath = path.join(frontendPath, 'login.html');
  
  res.send(`
    <h1>Debug Info</h1>
    <p><strong>Server directory:</strong> ${__dirname}</p>
    <p><strong>Frontend path:</strong> ${frontendPath}</p>
    <p><strong>Dashboard path:</strong> ${dashboardPath}</p>
    <p><strong>Login path:</strong> ${loginPath}</p>
    <p><strong>Frontend folder exists:</strong> ${fs.existsSync(frontendPath)}</p>
    <p><strong>Dashboard file exists:</strong> ${fs.existsSync(dashboardPath)}</p>
    <p><strong>Login file exists:</strong> ${fs.existsSync(loginPath)}</p>
    <p><strong>Authentication:</strong> ${authenticateToken ? 'Enabled' : 'Disabled'}</p>
    ${fs.existsSync(frontendPath) ? `
      <p><strong>Files in frontend:</strong></p>
      <ul>${fs.readdirSync(frontendPath).map(f => `<li>${f}</li>`).join('')}</ul>
    ` : ''}
    
    <h2>Navigation</h2>
    <p><a href="/login.html">Go to Login Page</a></p>
    <p><a href="/dashboard.html">Go to Dashboard</a></p>
    <p><a href="/production-map.html">Go to Production Map</a></p>
    
    <h2>Default Test Accounts</h2>
    <p><strong>Admin:</strong> admin / password123</p>
    <p><strong>User:</strong> user / password123</p>
    
    <h2>API Endpoints</h2>
    <p><a href="/api/health">Health Check</a></p>
    <p>POST /api/auth/login - Login endpoint</p>
    <p>POST /api/auth/register - Registration endpoint</p>
  `);
});

// Root route - redirect to login
app.get('/', (req, res) => {
  const loginPath = path.join(__dirname, '../frontend/login.html');
  
  if (fs.existsSync(loginPath)) {
    res.redirect('/login.html');
  } else {
    // Fallback to dashboard if login doesn't exist
    const dashboardPath = path.join(__dirname, '../frontend/dashboard.html');
    
    console.log('Root route hit!');
    console.log('Looking for:', dashboardPath);
    console.log('File exists:', fs.existsSync(dashboardPath));
    
    res.sendFile(dashboardPath, (err) => {
      if (err) {
        console.error('Error serving dashboard:', err);
        res.status(500).send(`
          <h1>Error serving files!</h1>
          <p><strong>Error:</strong> ${err.message}</p>
          <p><strong>Login path:</strong> ${loginPath}</p>
          <p><strong>Dashboard path:</strong> ${dashboardPath}</p>
          <p><a href="/debug">Go to debug page</a></p>
        `);
      }
    });
  }
});

// Handle specific routes
app.get('/login', (req, res) => {
  res.redirect('/login.html');
});

app.get('/dashboard', (req, res) => {
  res.redirect('/dashboard.html');
});

app.get('/production-map', (req, res) => {
  res.redirect('/production-map.html');
});

// Serve HTML files directly
app.get('/login.html', (req, res) => {
  const loginPath = path.join(__dirname, '../frontend/login.html');
  res.sendFile(loginPath, (err) => {
    if (err) {
      res.status(404).send(`
        <h1>Login page not found</h1>
        <p>Please ensure login.html exists in the frontend folder</p>
        <p><a href="/debug">Debug Info</a></p>
      `);
    }
  });
});

app.get('/dashboard.html', (req, res) => {
  const dashboardPath = path.join(__dirname, '../frontend/dashboard.html');
  res.sendFile(dashboardPath, (err) => {
    if (err) {
      res.status(404).send(`
        <h1>Dashboard not found</h1>
        <p>Please ensure dashboard.html exists in the frontend folder</p>
        <p><a href="/debug">Debug Info</a></p>
      `);
    }
  });
});

app.get('/production-map.html', (req, res) => {
  const mapPath = path.join(__dirname, '../frontend/production-map.html');
  res.sendFile(mapPath, (err) => {
    if (err) {
      res.status(404).send(`
        <h1>Production map not found</h1>
        <p>Please ensure production-map.html exists in the frontend folder</p>
        <p><a href="/debug">Debug Info</a></p>
      `);
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Something went wrong!' 
  });
});

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API route not found',
    path: req.originalUrl
  });
});

// 404 handler for other routes - redirect to login
app.use('*', (req, res) => {
  // Don't interfere with static files
  if (req.originalUrl.includes('.')) {
    return res.status(404).send('File not found');
  }
  
  // Redirect unknown routes to login
  res.redirect('/login.html');
});

// Get network information
function getServerInfo() {
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const interface of interfaces) {
      if (interface.family === 'IPv4' && !interface.internal) {
        addresses.push({
          interface: interfaceName,
          address: interface.address
        });
      }
    }
  }
  
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    addresses: addresses
  };
}

// Start server
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Listen on all network interfaces

app.listen(PORT, HOST, () => {
  console.log(`🚀 Inventory Server running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  
  // Show network addresses where the server can be accessed
  const networkInterfaces = os.networkInterfaces();
  console.log(`\n📡 Network Access:`);
  
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const interface of interfaces) {
      if (interface.family === 'IPv4' && !interface.internal) {
        console.log(`   http://${interface.address}:${PORT}`);
        console.log(`   Debug: http://${interface.address}:${PORT}/debug`);
      }
    }
  }
  
  console.log(`\n🔐 Authentication: ${authenticateToken ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🔑 Login: http://localhost:${PORT}/login.html`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`🗺️  Production Map: http://localhost:${PORT}/production-map.html`);
  console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
  console.log(`🔍 Debug: http://localhost:${PORT}/debug`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (authenticateToken) {
    console.log(`\n👤 Default Test Accounts:`);
    console.log(`   Admin: admin / password123`);
    console.log(`   User: user / password123`);
  }
  
  console.log(`\n⚠️  Make sure your firewall allows connections on port ${PORT}`);
  console.log(`\n📁 Serving files from: ${path.join(__dirname, '../frontend')}`);
});

module.exports = app;