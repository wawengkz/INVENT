// Configuration for the Inventory System
console.log('Loading config.js...');

// Get the current URL info
const currentProtocol = window.location.protocol;
const currentHostname = window.location.hostname;
const currentPort = window.location.port;

console.log('Current URL:', window.location.href);
console.log('Hostname:', currentHostname);
console.log('Port:', currentPort);

// Build API URL - always use the same host but port 5000 for API
function getApiBaseUrl() {
  // Always use the same hostname as current page
  return `${currentProtocol}//${currentHostname}:5000/api`;
}

// Global configuration
window.INVENTORY_CONFIG = {
  API_BASE_URL: getApiBaseUrl(),
  IS_NETWORK_ACCESS: currentHostname !== 'localhost' && currentHostname !== '127.0.0.1',
  DEFAULT_TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  IS_DEVELOPMENT: currentHostname === 'localhost' || currentHostname === '127.0.0.1'
};

console.log('✅ Inventory System Config loaded:', window.INVENTORY_CONFIG);

// Test API connection immediately
async function testApiConnection() {
  try {
    console.log('🔄 Testing API connection...');
    const response = await fetch(`${window.INVENTORY_CONFIG.API_BASE_URL.replace('/api', '')}/api/health`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API connection successful:', data);
      
      // Show success indicator
      const indicator = document.getElementById('connectionStatus');
      if (indicator) {
        indicator.textContent = '🟢 Connected';
        indicator.className = 'connection-status online';
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('❌ API connection failed:', error);
    
    // Show error indicator
    const indicator = document.getElementById('connectionStatus');
    if (indicator) {
      indicator.textContent = '🔴 API Error';
      indicator.className = 'connection-status offline';
    }
  }
}

// Test connection when page loads
document.addEventListener('DOMContentLoaded', testApiConnection);

// Also test after a short delay in case DOMContentLoaded already fired
setTimeout(testApiConnection, 1000);