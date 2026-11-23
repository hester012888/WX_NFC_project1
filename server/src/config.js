// server/src/config.js - 后端配置（环境变量优先）
const path = require('path')
require('dotenv').config()

const DAY = 24 * 60 * 60 * 1000

module.exports = {
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'nfc-tourism.db'),
  autoMigrate: process.env.NODE_ENV !== 'production' || process.env.AUTO_MIGRATE === '1',
  wxAppid: process.env.WX_APPID || '',
  wxAppsecret: process.env.WX_APPSECRET || '',
  wxAuthMode: process.env.WX_AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'real' : 'mock'),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS) || 7 * DAY,
  guestTtlMs: Number(process.env.GUEST_TTL_MS) || 30 * DAY,
  nfcAdminToken: process.env.NFC_ADMIN_TOKEN || '',
  adminSessionTtlMs: Number(process.env.ADMIN_SESSION_TTL_MS) || 8 * 60 * 60 * 1000
}
