// server/src/app.js - Express 入口
const express = require('express')
const cors = require('cors')
const config = require('./config')
const { getDb } = require('./db')
const { migrate } = require('./migrate')
const seed = require('./seed')
const auth = require('./auth')
const api = require('./routes/api')
const authRoutes = require('./routes/auth')
const admin = require('./routes/admin')
const nfcTags = require('./routes/nfc-tags')

function createApp() {
  const app = express()

  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json({ limit: '1mb' }))
  app.use(auth.identityMiddleware)

  app.use('/api', api)
  app.use('/api/auth', authRoutes)
  app.use('/api/nfc/tags', nfcTags)
  app.use('/api/admin', admin)

  app.use((req, res) => {
    res.status(404).json({ code: 404, message: '接口不存在' })
  })

  app.use((err, req, res, next) => {
    const status = err.status || 500
    if (status >= 500) console.error('[server-error]', err.message)
    res.status(status).json({
      code: err.code || status,
      message: status >= 500 ? '服务器内部错误' : err.message
    })
  })

  return app
}

function initialize() {
  if (process.env.NODE_ENV === 'production' && (config.wxAuthMode === 'mock' || !config.wxAppsecret)) {
    throw new Error('生产环境必须配置 WX_APPID / WX_APPSECRET，且禁止使用 mock 登录模式')
  }
  const db = getDb()
  if (config.autoMigrate) {
    migrate(db)
    seed(db)
  }
  return db
}

if (require.main === module) {
  initialize()
  createApp().listen(config.port, () => {
    console.log(`NFC tourism API running at http://127.0.0.1:${config.port}/api`)
  })
}

module.exports = { createApp, initialize }
