// server/src/routes/admin/activities.js - 活动管理（复用 activities 表）
const express = require('express')
const crypto = require('crypto')
const { getDb } = require('../../db')
const { getAdminContext, requireRole } = require('../../admin-auth')
const { withAudit } = require('../../admin-audit')
const {
  parsePagination, activityDto, validateActivityInput, buildUpdate, badRequest
} = require('../../admin-helpers')

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

router.get('/', run((req, res) => {
  const db = getDb()
  const { page, pageSize, offset } = parsePagination(req.query)
  const clauses = []
  const params = []
  if (req.query.keyword) {
    clauses.push('name LIKE ?')
    params.push('%' + String(req.query.keyword).slice(0, 100) + '%')
  }
  if (req.query.status) {
    if (!['active', 'draft', 'archived'].includes(req.query.status)) throw badRequest('活动状态非法')
    clauses.push('status = ?')
    params.push(req.query.status)
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
  const total = db.prepare(`SELECT COUNT(*) AS c FROM activities ${where}`).get(...params).c
  const rows = db.prepare(`SELECT * FROM activities ${where} ORDER BY rowid LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
  ok(res, { list: rows.map(activityDto), total, page, pageSize })
}))

router.get('/:id', run((req, res) => {
  const row = getDb().prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id)
  if (!row) {
    const err = new Error('活动不存在')
    err.status = 404
    err.code = 'ACTIVITY_NOT_FOUND'
    throw err
  }
  ok(res, activityDto(row))
}))

router.post('/', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const values = validateActivityInput(req.body || {})
  const id = 'act_' + crypto.randomBytes(6).toString('hex')
  const now = Date.now()
  const row = withAudit(db, getAdminContext(req), {
    action: 'activity.create', resourceType: 'activity', resourceId: id, before: {}
  }, () => {
    db.prepare(`
      INSERT INTO activities
        (id, name, slogan, period, location, summary, description, rules_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, values.name, values.slogan || '', values.period || '', values.location || '',
      values.summary || '', values.description || '', values.rules_json || '[]',
      values.status || 'active', now, now
    )
    return db.prepare('SELECT * FROM activities WHERE id = ?').get(id)
  })
  ok(res, activityDto(row))
}))

router.put('/:id', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const before = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id)
  if (!before) {
    const err = new Error('活动不存在')
    err.status = 404
    err.code = 'ACTIVITY_NOT_FOUND'
    throw err
  }
  const values = validateActivityInput(req.body || {}, true)
  values.updated_at = Date.now()
  const { sets, params } = buildUpdate(values)
  const row = withAudit(db, getAdminContext(req), {
    action: 'activity.update', resourceType: 'activity', resourceId: before.id, before: activityDto(before)
  }, () => {
    db.prepare(`UPDATE activities SET ${sets} WHERE id = ?`).run(...params, before.id)
    return db.prepare('SELECT * FROM activities WHERE id = ?').get(before.id)
  })
  ok(res, activityDto(row))
}))

router.patch('/:id/status', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const before = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id)
  if (!before) {
    const err = new Error('活动不存在')
    err.status = 404
    err.code = 'ACTIVITY_NOT_FOUND'
    throw err
  }
  const status = req.body && req.body.status
  if (!['active', 'draft', 'archived'].includes(status)) throw badRequest('活动状态非法')
  const row = withAudit(db, getAdminContext(req), {
    action: 'activity.status', resourceType: 'activity', resourceId: before.id, before: activityDto(before)
  }, () => {
    db.prepare('UPDATE activities SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), before.id)
    return db.prepare('SELECT * FROM activities WHERE id = ?').get(before.id)
  })
  ok(res, activityDto(row))
}))

router.post('/:id/archive', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const before = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id)
  if (!before) {
    const err = new Error('活动不存在')
    err.status = 404
    err.code = 'ACTIVITY_NOT_FOUND'
    throw err
  }
  const row = withAudit(db, getAdminContext(req), {
    action: 'activity.archive', resourceType: 'activity', resourceId: before.id, before: activityDto(before)
  }, () => {
    db.prepare("UPDATE activities SET status = 'archived', updated_at = ? WHERE id = ?")
      .run(Date.now(), before.id)
    return db.prepare('SELECT * FROM activities WHERE id = ?').get(before.id)
  })
  ok(res, activityDto(row))
}))

module.exports = router
