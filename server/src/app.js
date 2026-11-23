// server/src/app.js - Express 入口
const express = require('express')
const cors = require('cors')
const config = require('./config')
const { getDb } = require('./db')
const { migrate } = require('./migrate')
const seed = require('./seed')
const api = require('./routes/api')
const admin = require('./routes/admin')
const nfcTags = require('./routes/nfc-tags')

function createApp() {
  const app = express()

  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json({ limit: '1mb' }))

  app.use('/api', api)
  app.use('/api/nfc/tags', nfcTags)
  app.use('/api/admin', admin)

  app.use((req, res) => {
    res.status(404).json({ code: 404, message: '接口不存在' })
  })

  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  })

  return app
}

function initialize() {
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
