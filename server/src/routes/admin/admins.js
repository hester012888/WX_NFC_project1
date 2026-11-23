// server/src/routes/admin/admins.js - 管理员账号管理（仅 super_admin）
const express = require('express')
const { getDb } = require('../../db')
const {
  requireRole, createAdmin, publicAdmin, getAdminContext, authError
} = require('../../admin-auth')
const { withAudit } = require('../../admin-audit')

const router = express.Router()
const ok = (res, data) => res.json({ code: 0, message: 'ok', data })

router.use(requireRole('super_admin'))

function run(handler) {
  return (req, res, next) => {
    try {
      handler(req, res)
    } catch (err) {
      next(err)
    }
  }
}

router.get('/', run((req, res) => {
  const list = getDb().prepare('SELECT * FROM admins ORDER BY id').all().map(publicAdmin)
  ok(res, list)
}))

router.post('/', run((req, res) => {
  const db = getDb()
  const { username, password, displayName, role } = req.body || {}
  const created = withAudit(db, getAdminContext(req), {
    action: 'admin.create', resourceType: 'admin', resourceId: String(username || ''), before: {}
  }, () => createAdmin({ username, password, displayName, role: role || 'operator' }, db))
  ok(res, created)
}))

router.patch('/:id/status', run((req, res) => {
  const db = getDb()
  const id = Number(req.params.id)
  const before = db.prepare('SELECT * FROM admins WHERE id = ?').get(id)
  if (!before) throw authError('管理员不存在', 404, 'ADMIN_NOT_FOUND')
  const status = req.body && req.body.status
  if (!['active', 'disabled'].includes(status)) throw authError('管理员状态非法', 400, 'INVALID_PARAMS')
  if (id === req.admin.id && status === 'disabled') {
    throw authError('不能禁用当前登录的管理员', 403, 'ADMIN_SELF_DISABLE')
  }
  const updated = withAudit(db, getAdminContext(req), {
    action: 'admin.disable', resourceType: 'admin', resourceId: String(id), before: publicAdmin(before)
  }, () => {
    db.prepare('UPDATE admins SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id)
    if (status === 'disabled') {
      db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL')
        .run(Date.now(), id)
    }
    return publicAdmin(db.prepare('SELECT * FROM admins WHERE id = ?').get(id))
  })
  ok(res, updated)
}))

module.exports = router
