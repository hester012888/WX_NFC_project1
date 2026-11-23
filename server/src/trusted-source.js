// server/src/trusted-source.js - UID 管理接口的临时访问控制（不改动 UID 业务逻辑）
const crypto = require('crypto')
const config = require('./config')

function isTrustedAddress(ip) {
  if (typeof ip !== 'string' || !ip) return false
  const value = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (value === '::1' || value === '127.0.0.1') return true
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return parts[0] === 192 && parts[1] === 168
}

function safeEqual(actual, expected) {
  if (typeof actual !== 'string' || !expected) return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function requireTrustedSource(req, res, next) {
  if (safeEqual(req.headers['x-admin-token'], config.nfcAdminToken)) return next()
  const address = (req.socket && req.socket.remoteAddress) || req.ip
  if (isTrustedAddress(address)) return next()
  return res.status(403).json({ code: 403, message: 'UID 管理接口仅限本地或可信内网访问' })
}

module.exports = { isTrustedAddress, requireTrustedSource }
