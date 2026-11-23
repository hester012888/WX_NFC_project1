// server/src/auth.js - 游客凭证、微信登录、令牌与账号合并
const crypto = require('crypto')
const config = require('./config')
const { getDb } = require('./db')
const { exchangeCode } = require('./wechat-auth')

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

function immediate(db, fn) {
  return db.transaction(fn).immediate()
}

function findUserByOpenid(db, openid) {
  return db.prepare('SELECT * FROM users WHERE openid = ?').get(openid) || null
}

function findUserByVisitor(db, visitorId) {
  return db.prepare('SELECT * FROM users WHERE visitor_id = ?').get(visitorId) || null
}

function createUser(db, { openid = null, unionid = null } = {}) {
  const visitorId = 'v_' + crypto.randomBytes(12).toString('hex')
  const now = Date.now()
  db.prepare(`
    INSERT INTO users (visitor_id, openid, union_id, status, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?)
  `).run(visitorId, openid, unionid, now, now, openid ? now : null)
  return findUserByVisitor(db, visitorId)
}

function issueSession(db, { visitorId, openid = null, type, ttlMs }) {
  const token = newToken()
  const now = Date.now()
  const expiresAt = now + ttlMs
  db.prepare(`
    INSERT INTO login_sessions (token_hash, token_type, visitor_id, openid, issued_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hashToken(token), type, visitorId, openid, now, expiresAt)
  return { token, expiresAt }
}

function revokeSession(db, token) {
  db.prepare('UPDATE login_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(Date.now(), hashToken(token))
}

function verifySession(token, type) {
  if (typeof token !== 'string' || !token) return null
  const row = getDb().prepare(`
    SELECT s.*, u.status AS user_status, u.merged_into
    FROM login_sessions s
    JOIN users u ON u.visitor_id = s.visitor_id
    WHERE s.token_hash = ? AND s.token_type = ?
  `).get(hashToken(token), type)
  if (!row || row.revoked_at || row.expires_at <= Date.now()) return null
  if (row.user_status !== 'active' || row.merged_into) return null
  return row
}

function requireSession(token, type, error) {
  const session = verifySession(token, type)
  if (!session) throw error
  return session
}

function formatCredential(session, issued, type) {
  return {
    visitorId: session.visitor_id,
    token: issued.token,
    expiresAt: issued.expiresAt,
    tokenType: type
  }
}

function createGuest() {
  const db = getDb()
  return immediate(db, () => {
    const user = createUser(db)
    const issued = issueSession(db, { visitorId: user.visitor_id, type: 'guest', ttlMs: config.guestTtlMs })
    return formatCredential(user, issued, 'guest')
  })
}

function refreshGuest(token) {
  requireSession(token, 'guest', authError('游客凭证无效或已过期', 401, 'GUEST_INVALID'))
  const db = getDb()
  return immediate(db, () => {
    const session = requireSession(token, 'guest', authError('游客凭证无效或已过期', 401, 'GUEST_INVALID'))
    revokeSession(db, token)
    const issued = issueSession(db, { visitorId: session.visitor_id, type: 'guest', ttlMs: config.guestTtlMs })
    return formatCredential(session, issued, 'guest')
  })
}

async function login({ code, guestToken = '' }) {
  const { openid, unionid } = await exchangeCode(code)
  const db = getDb()

  return immediate(db, () => {
    const guestSession = guestToken
      ? requireSession(guestToken, 'guest', authError('游客凭证无效或已过期', 401, 'GUEST_INVALID'))
      : null

    let target = findUserByOpenid(db, openid)
    if (target && (target.status !== 'active' || target.merged_into)) {
      throw authError('微信账号状态异常', 409, 'ACCOUNT_INVALID')
    }

    if (!target) {
      if (guestSession) {
        const guestUser = findUserByVisitor(db, guestSession.visitor_id)
        if (guestUser && guestUser.status === 'active' && !guestUser.merged_into) {
          if (guestUser.openid && guestUser.openid !== openid) {
            throw authError('游客身份已绑定其他微信账号', 409, 'GUEST_OPENID_CONFLICT')
          }
          db.prepare(`
            UPDATE users SET openid = ?, union_id = ?, last_login_at = ?, updated_at = ? WHERE visitor_id = ?
          `).run(openid, unionid, Date.now(), Date.now(), guestUser.visitor_id)
          target = findUserByOpenid(db, openid)
        }
      }
      if (!target) target = createUser(db, { openid, unionid })
    } else {
      db.prepare(`
        UPDATE users SET union_id = COALESCE(?, union_id), last_login_at = ?, updated_at = ? WHERE visitor_id = ?
      `).run(unionid, Date.now(), Date.now(), target.visitor_id)
    }

    // 仅当存在经过验证的游客凭证，且来源与目标不同时才允许合并历史数据。
    if (guestSession && guestSession.visitor_id !== target.visitor_id) {
      const source = findUserByVisitor(db, guestSession.visitor_id)
      if (!source || source.status !== 'active' || source.merged_into) {
        throw authError('游客身份不可用于合并', 409, 'MERGE_NOT_ALLOWED')
      }
      if (source.openid && source.openid !== openid) {
        throw authError('游客身份已绑定其他微信账号', 409, 'GUEST_OPENID_CONFLICT')
      }
      const now = Date.now()
      db.prepare(`
        UPDATE checkin_records SET is_valid = 0
        WHERE visitor_id = ? AND is_valid = 1
          AND point_id IN (SELECT point_id FROM checkin_records WHERE visitor_id = ? AND is_valid = 1)
      `).run(source.visitor_id, target.visitor_id)
      db.prepare('UPDATE checkin_records SET visitor_id = ? WHERE visitor_id = ? AND is_valid = 1')
        .run(target.visitor_id, source.visitor_id)
      db.prepare("UPDATE users SET status = 'disabled', merged_into = ?, updated_at = ? WHERE visitor_id = ?")
        .run(target.visitor_id, now, source.visitor_id)
      db.prepare('UPDATE login_sessions SET revoked_at = ? WHERE visitor_id = ? AND revoked_at IS NULL')
        .run(now, source.visitor_id)
    }

    if (guestSession) revokeSession(db, guestToken)
    const issued = issueSession(db, { visitorId: target.visitor_id, openid, type: 'login', ttlMs: config.sessionTtlMs })
    return formatCredential(target, issued, 'login')
  })
}

function refreshLogin(token) {
  const session = requireSession(token, 'login', authError('登录态已失效，请重新登录', 401, 'LOGIN_EXPIRED'))
  const db = getDb()
  return immediate(db, () => {
    const current = requireSession(token, 'login', authError('登录态已失效，请重新登录', 401, 'LOGIN_EXPIRED'))
    revokeSession(db, token)
    const issued = issueSession(db, {
      visitorId: current.visitor_id,
      openid: current.openid,
      type: 'login',
      ttlMs: config.sessionTtlMs
    })
    db.prepare('UPDATE login_sessions SET refreshed_at = ? WHERE token_hash = ?')
      .run(Date.now(), hashToken(issued.token))
    return formatCredential(current, issued, 'login')
  })
}

function logout(token) {
  const db = getDb()
  return immediate(db, () => {
    revokeSession(db, token)
    return { success: true }
  })
}

function maskOpenid(openid) {
  if (!openid) return ''
  return openid.length <= 8 ? openid.slice(0, 2) + '***' : openid.slice(0, 4) + '***' + openid.slice(-4)
}

function me(session) {
  if (!session) return { loggedIn: false, visitorId: '', expiresAt: null, openidMasked: '' }
  return {
    loggedIn: true,
    visitorId: session.visitor_id,
    expiresAt: session.expires_at,
    openidMasked: maskOpenid(session.openid)
  }
}

function identityMiddleware(req, res, next) {
  try {
    const authorization = req.headers.authorization
    const guestToken = req.headers['x-guest-token']
    if (authorization) {
      if (!/^Bearer\s+\S+$/i.test(authorization)) {
        throw authError('登录态格式错误', 401, 'LOGIN_EXPIRED')
      }
      const token = authorization.replace(/^Bearer\s+/i, '')
      const session = requireSession(token, 'login', authError('登录态已失效，请重新登录', 401, 'LOGIN_EXPIRED'))
      req.identity = { type: 'login', visitorId: session.visitor_id, openid: session.openid, session }
    } else if (guestToken) {
      const session = requireSession(String(guestToken), 'guest', authError('游客凭证已失效，请重新获取', 401, 'GUEST_INVALID'))
      req.identity = { type: 'guest', visitorId: session.visitor_id, session }
    } else {
      req.identity = { type: 'anonymous', visitorId: 'anonymous', session: null }
    }
    next()
  } catch (err) {
    next(err)
  }
}

module.exports = {
  authError,
  createGuest,
  refreshGuest,
  login,
  refreshLogin,
  logout,
  me,
  identityMiddleware,
  verifySession
}
