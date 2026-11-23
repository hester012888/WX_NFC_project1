// server/src/admin-audit.js - 管理操作审计（与业务写入同一事务）
const SENSITIVE_KEYS = new Set([
  'password', 'passwordhash', 'password_hash', 'token', 'tokenhash', 'token_hash',
  'appsecret', 'wxappsecret', 'secret', 'authorization', 'x-admin-token'
])

function sanitize(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1))
  if (value && typeof value === 'object') {
    const output = {}
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/_/g, ''))) {
        output[key] = '[REDACTED]'
      } else {
        output[key] = sanitize(item, depth + 1)
      }
    }
    return output
  }
  if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '...'
  return value
}

function writeLog(db, entry) {
  const before = JSON.stringify(sanitize(entry.before || {}))
  const after = JSON.stringify(sanitize(entry.after || {}))
  db.prepare(`
    INSERT INTO admin_operation_logs
      (admin_id, action, resource_type, resource_id, before_json, after_json, result, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.adminId,
    entry.action,
    entry.resourceType,
    String(entry.resourceId || ''),
    before,
    after,
    entry.result || 'success',
    entry.ip || '',
    entry.userAgent || '',
    Date.now()
  )
}

function withAudit(db, context, details, fn) {
  return db.transaction(() => {
    const result = fn()
    writeLog(db, {
      ...context,
      ...details,
      after: details.after !== undefined ? details.after : result,
      result: 'success'
    })
    return result
  })()
}

module.exports = { sanitize, writeLog, withAudit }
