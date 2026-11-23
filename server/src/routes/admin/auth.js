// server/src/routes/admin/auth.js - 管理员认证（独立于游客与微信用户）
const express = require('express')
const adminAuthService = require('../../admin-auth')

const router = express.Router()
const ok = (res, data) => res.json({ code: 0, message: 'ok', data })

function run(handler) {
  return (req, res, next) => {
    try {
      handler(req, res)
    } catch (err) {
      next(err)
    }
  }
}

function tokenFrom(req) {
  return req.headers.authorization.replace(/^Bearer\s+/i, '')
}

router.post('/login', run((req, res) => {
  const { username, password } = req.body || {}
  ok(res, adminAuthService.login({ username, password }))
}))

router.use(adminAuthService.adminAuth)

router.post('/refresh', run((req, res) => {
  ok(res, adminAuthService.refresh(tokenFrom(req)))
}))

router.post('/logout', run((req, res) => {
  ok(res, adminAuthService.logout(tokenFrom(req)))
}))

router.get('/me', run((req, res) => {
  ok(res, req.admin)
}))

module.exports = router
