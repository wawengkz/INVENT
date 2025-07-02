const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Test route
app.get('/test', (req, res) => {
  res.send(`
    <h1>Debug Server Working!</h1>
    <p><strong>Current directory:</strong> ${__dirname}</p>
    <p><strong>Looking for frontend at:</strong> ${path.join(__dirname, 'frontend')}</p>
    <p><strong>Files in project root:</strong></p>
    <ul>
      ${fs.readdirSync(__dirname).map(file => `<li>${file}</li>`).join('')}
    </ul>
    <p><strong>Frontend folder exists:</strong> ${fs.existsSync(path.join(__dirname, 'frontend')) ? 'YES' : 'NO'}</p>
    ${fs.existsSync(path.join(__dirname, 'frontend')) ? `
      <p><strong>Files in frontend:</strong></p>
      <ul>
        ${fs.readdirSync(path.join(__dirname, 'frontend')).map(file => `<li>${file}</li>`).join('')}
      </ul>
    ` : ''}
  `);
});

// Serve static files
app.use(express.static('frontend'));

// Root route fallback
app.get('/', (req, res) => {
  const frontendPath = path.join(__dirname, 'frontend');
  const dashboardPath = path.join(frontendPath, 'dashboard.html');
  
  console.log('Root route hit!');
  console.log('Looking for:', dashboardPath);
  console.log('File exists:', fs.existsSync(dashboardPath));
  
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
  } else {
    res.send(`
      <h1>Dashboard not found!</h1>
      <p><strong>Looking for:</strong> ${dashboardPath}</p>
      <p><strong>File exists:</strong> ${fs.existsSync(dashboardPath)}</p>
      <p><a href="/test">Go to test page</a></p>
    `);
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).send(`
    <h1>404 - Not Found</h1>
    <p><strong>Requested:</strong> ${req.originalUrl}</p>
    <p><a href="/test">Go to test page</a></p>
  `);
});

const PORT = 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 Debug Server running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`🌐 Test: http://localhost:${PORT}/test`);
  console.log(`📁 Current directory: ${__dirname}`);
  console.log(`📁 Frontend path: ${path.join(__dirname, 'frontend')}`);
  console.log(`📁 Frontend exists: ${fs.existsSync(path.join(__dirname, 'frontend'))}`);
});

module.exports = app;