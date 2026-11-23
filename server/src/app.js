// server/src/app.js - Express 入口
const express = require('express')
const cors = require('cors')
const config = require('./config')
const api = require('./routes/api')
const admin = require('./routes/admin')

const app = express()

app.use(cors({ origin: config.corsOrigin }))
app.use(express.json({ limit: '1mb' }))

app.use('/api', api)
app.use('/api/admin', admin)

app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ code: 500, message: '服务器内部错误' })
})

app.listen(config.port, () => {
  console.log(`NFC tourism API running at http://127.0.0.1:${config.port}/api`)
})
