// server/src/routes/auth.js - 游客凭证与微信登录接口
const express = require('express')
const auth = require('../auth')

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

function runAsync(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
}

function requireLogin(req) {
  if (!req.identity || req.identity.type !== 'login') {
    throw auth.authError('请先登录', 401, 'LOGIN_REQUIRED')
  }
  return req.headers.authorization.replace(/^Bearer\s+/i, '')
}

function requireGuest(req) {
  if (!req.identity || req.identity.type !== 'guest') {
    throw auth.authError('游客凭证无效或已过期', 401, 'GUEST_INVALID')
  }
  return String(req.headers['x-guest-token'])
}

router.post('/guest', run((req, res) => ok(res, auth.createGuest())))

router.post('/guest/refresh', run((req, res) => {
  ok(res, auth.refreshGuest(requireGuest(req)))
}))

router.post('/login', runAsync(async (req, res) => {
  const data = await auth.login({
    code: (req.body || {}).code,
    guestToken: req.headers['x-guest-token'] ? String(req.headers['x-guest-token']) : ''
  })
  ok(res, data)
}))

router.post('/refresh', run((req, res) => {
  ok(res, auth.refreshLogin(requireLogin(req)))
}))

router.post('/logout', run((req, res) => {
  ok(res, auth.logout(requireLogin(req)))
}))

router.get('/me', run((req, res) => {
  ok(res, auth.me(req.identity.session))
}))

module.exports = router
