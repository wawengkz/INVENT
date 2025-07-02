const http = require('http');

class SystemMonitor {
  constructor() {
    this.interval = 30000; // 30 seconds
    this.apiBase = 'http://localhost:5000/api';
  }

  async checkHealth() {
    try {
      const response = await this.makeRequest('/health');
      return JSON.parse(response);
    } catch (error) {
      console.error('Health check failed:', error.message);
      return null;
    }
  }

  async checkSystemStatus() {
    try {
      const response = await this.makeRequest('/system/status');
      return JSON.parse(response);
    } catch (error) {
      console.error('System status check failed:', error.message);
      return null;
    }
  }

  async makeRequest(path) {
    return new Promise((resolve, reject) => {
      const req = http.get(`${this.apiBase}${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  async start() {
    console.log('🔍 Starting inventory system monitor...');
    console.log(`📊 Monitoring interval: ${this.interval}ms`);

    setInterval(async () => {
      try {
        const [health, status] = await Promise.all([
          this.checkHealth(),
          this.checkSystemStatus()
        ]);

        const timestamp = new Date().toISOString();
        console.log(`\n[${timestamp}] System Health Check:`);
        
        if (health) {
          const memUsageMB = Math.round(health.memory.heapUsed / 1024 / 1024);
          console.log(`✅ Status: ${health.status}`);
          console.log(`💾 Memory: ${memUsageMB}MB`);
          console.log(`⏱️  Uptime: ${Math.floor(health.uptime / 60)}m`);
        }

        if (status?.data) {
          console.log(`📊 Requests: ${status.data.requests.total} (${status.data.requests.errorRate}% errors)`);
          console.log(`🔄 Active: ${status.data.requests.active} connections`);
        }

        // Check for alerts
        if (health) {
          const memUsageMB = health.memory.heapUsed / 1024 / 1024;
          if (memUsageMB > 150) {
            console.log(`⚠️  HIGH MEMORY WARNING: ${Math.round(memUsageMB)}MB`);
          }
        }

      } catch (error) {
        console.error('❌ Monitoring error:', error.message);
      }
    }, this.interval);

    // Initial check
    console.log('🚀 Performing initial health check...');
    const [health, status] = await Promise.all([
      this.checkHealth(),
      this.checkSystemStatus()
    ]);

    if (health) {
      console.log(`✅ Server is ${health.status}`);
    } else {
      console.log('❌ Server health check failed');
    }
  }
}

// Start monitoring if run directly
if (require.main === module) {
  const monitor = new SystemMonitor();
  monitor.start().catch(console.error);
}

module.exports = SystemMonitor;