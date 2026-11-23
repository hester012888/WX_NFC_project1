// server/src/config.js - 后端配置（环境变量优先）
require('dotenv').config()

module.exports = {
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*'
}
