1. Clone the Repository
bashgit clone https://github.com/wawengkz/IT_Inventory.git
cd IT_Inventory
2. Install Dependencies
bashnpm install
3. Environment Configuration
Create a .env file in the root directory with the following configuration:
env# Database Configuration
MONGODB_URI=mongodb://localhost:27017/inventory_db

# Server Configuration
PORT=5000
NODE_ENV=development

# Security Settings
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Performance Settings
MAX_MEMORY=209715200
JSON_LIMIT=10mb
MAX_BATCH_SIZE=1000
CHUNK_SIZE=100
DB_POOL_SIZE=10
DB_TIMEOUT=5000
DB_SOCKET_TIMEOUT=45000
Important: Replace your_super_secret_jwt_key_here with a strong, unique secret key.

4. Database Setup
Option A: Local MongoDB Installation

Install MongoDB Community Edition
Start MongoDB service:
bash# Windows
net start MongoDB


5. Start the Application
bash# Development mode (recommended for setup)
node server-clean.js

# Or production mode
node server.js

🌐 Accessing the Application
Once the server is running, you can access:

Main Application: http://localhost:5000
Login Page: http://localhost:5000/login.html
Dashboard: http://localhost:5000/dashboard.html
Production Map: http://localhost:5000/production-map.html
Debug Info: http://localhost:5000/debug
Health Check: http://localhost:5000/api/health

Network Access
The server automatically detects your network IP. Look for output like:
📡 Network Access:
   http://192.168.1.100:5000
Other devices on your network can access the application using your computer's IP address.
👤 Default User Accounts
The system automatically creates default accounts on first startup:
Admin Account

Username: admin
Password: password123
Role: Administrator (full access)
Site: Calamba

User Accounts (Per Site)

Calamba: user_calamba / password123
Bay: user_bay / password123
Los Baños: user_losbanos / password123
La Espacio: user_laespacio / password123