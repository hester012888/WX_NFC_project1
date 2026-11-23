// server/src/config.js - 后端配置（环境变量优先）
const path = require('path')
require('dotenv').config()

module.exports = {
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'nfc-tourism.db'),
  autoMigrate: process.env.NODE_ENV !== 'production' || process.env.AUTO_MIGRATE === '1'
}
