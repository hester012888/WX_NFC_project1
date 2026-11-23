// server/src/admin-auth.js - 独立管理员认证与角色校验（不复用游客/微信身份）
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const config = require('./config')
const { getDb } = require('./db')

function authError(message, status, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function newToken() {
  return crypto.randomBytes(32).toString('hex')
}

function publicAdmin(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at
  }
}

function findAdminByUsername(db, username) {
  return db.prepare('SELECT * FROM admins WHERE username = ?').get(username) || null
}

function createAdmin({ username, password, displayName = '', role = 'operator' }, db = getDb()) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(username.trim())) {
    throw authError('管理员用户名需为 3-32 位字母、数字、下划线或连字符', 400, 'INVALID_USERNAME')
  }
  if (typeof password !== 'string' || password.length < 12) {
    throw authError('管理员密码长度至少 12 位', 400, 'INVALID_PASSWORD')
  }
  if (!['super_admin', 'operator'].includes(role)) {
    throw authError('管理员角色非法', 400, 'INVALID_ROLE')
  }
  if (db.prepare('SELECT 1 FROM admins WHERE username = ?').get(username.trim())) {
    throw authError('管理员用户名已存在', 409, 'ADMIN_EXISTS')
  }
  const hash = bcrypt.hashSync(password, 12)
  const now = Date.now()
  db.prepare(`
    INSERT INTO admins (username, password_hash, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(username.trim(), hash, displayName, role, now, now)
  return publicAdmin(db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim()))
}

function login({ username, password }) {
  if (typeof username !== 'string' || !username.trim()) throw authError('缺少管理员用户名', 400, 'INVALID_USERNAME')
  if (typeof password !== 'string' || !password) throw authError('缺少管理员密码', 400, 'INVALID_PASSWORD')

  const db = getDb()
  const admin = findAdminByUsername(db, username.trim())
  if (!admin || admin.status !== 'active' || !bcrypt.compareSync(password, admin.password_hash)) {
    throw authError('管理员用户名或密码错误', 401, 'ADMIN_INVALID_CREDENTIALS')
  }

  const token = newToken()
  const now = Date.now()
  const expiresAt = now + config.adminSessionTtlMs
  db.transaction(() => {
    db.prepare(`
      INSERT INTO admin_sessions (admin_id, token_hash, issued_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(admin.id, hashToken(token), now, expiresAt)
    db.prepare('UPDATE admins SET last_login_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, admin.id)
  })()

  return { token, expiresAt, admin: publicAdmin(admin) }
}

function verify(token) {
  if (typeof token !== 'string' || !token) return null
  const row = getDb().prepare(`
    SELECT s.*, a.username, a.display_name, a.role, a.status AS admin_status
    FROM admin_sessions s
    JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = ?
  `).get(hashToken(token))
  if (!row || row.revoked_at || row.expires_at <= Date.now() || row.admin_status !== 'active') return null
  return {
    session: row,
    admin: {
      id: row.admin_id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      status: row.admin_status
    }
  }
}

function requireAdmin(token) {
  const result = verify(token)
  if (!result) throw authError('管理员登录态已失效，请重新登录', 401, 'ADMIN_LOGIN_EXPIRED')
  return result
}

function refresh(token) {
  const current = requireAdmin(token)
  const db = getDb()
  const newRaw = newToken()
  const now = Date.now()
  const expiresAt = now + config.adminSessionTtlMs
  db.transaction(() => {
    db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(now, hashToken(token))
    db.prepare(`
      INSERT INTO admin_sessions (admin_id, token_hash, issued_at, expires_at, refreshed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(current.admin.id, hashToken(newRaw), now, expiresAt, now)
  })()
  return { token: newRaw, expiresAt, admin: current.admin }
}

function logout(token) {
  const db = getDb()
  db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(Date.now(), hashToken(token))
  return { success: true }
}

function getAdminContext(req) {
  return {
    adminId: req.admin.id,
    ip: req.ip || (req.socket && req.socket.remoteAddress) || '',
    userAgent: (req.headers['user-agent'] || '').slice(0, 200)
  }
}

function adminAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      throw authError('请先以管理员身份登录', 401, 'ADMIN_LOGIN_REQUIRED')
    }
    const result = requireAdmin(authorization.replace(/^Bearer\s+/i, ''))
    req.admin = result.admin
    req.adminSession = result.session
    next()
  } catch (err) {
    next(err)
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return next(authError('当前管理员无权执行该操作', 403, 'ADMIN_FORBIDDEN'))
    }
    next()
  }
}

module.exports = {
  authError,
  hashToken,
  newToken,
  publicAdmin,
  createAdmin,
  login,
  verify,
  requireAdmin,
  refresh,
  logout,
  getAdminContext,
  adminAuth,
  requireRole
}
