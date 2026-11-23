// server/src/routes/admin/points.js - 点位管理（复用 points 表）
const express = require('express')
const crypto = require('crypto')
const { getDb } = require('../../db')
const { getAdminContext, requireRole } = require('../../admin-auth')
const { withAudit } = require('../../admin-audit')
const {
  parsePagination, pointDto, validatePointInput, buildUpdate, badRequest
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

function notFound() {
  const err = new Error('点位不存在')
  err.status = 404
  err.code = 'POINT_NOT_FOUND'
  return err
}

function assertActivity(db, activityId) {
  if (!db.prepare('SELECT 1 FROM activities WHERE id = ?').get(activityId)) {
    throw badRequest('点位所属活动不存在', 'ACTIVITY_NOT_FOUND')
  }
}

router.get('/', run((req, res) => {
  const db = getDb()
  const { page, pageSize, offset } = parsePagination(req.query)
  const clauses = []
  const params = []
  if (req.query.activityId) {
    clauses.push('activity_id = ?')
    params.push(String(req.query.activityId))
  }
  if (req.query.keyword) {
    clauses.push('name LIKE ?')
    params.push('%' + String(req.query.keyword).slice(0, 100) + '%')
  }
  if (req.query.status) {
    if (!['active', 'inactive', 'archived'].includes(req.query.status)) throw badRequest('点位状态非法')
    clauses.push('status = ?')
    params.push(req.query.status)
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
  const total = db.prepare(`SELECT COUNT(*) AS c FROM points ${where}`).get(...params).c
  const rows = db.prepare(`SELECT * FROM points ${where} ORDER BY sort_order, rowid LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
  ok(res, { list: rows.map(pointDto), total, page, pageSize })
}))

router.get('/:id', run((req, res) => {
  const row = getDb().prepare('SELECT * FROM points WHERE id = ?').get(req.params.id)
  if (!row) throw notFound()
  ok(res, pointDto(row))
}))

router.post('/', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const values = validatePointInput(req.body || {})
  assertActivity(db, values.activity_id)
  const id = 'spot_' + crypto.randomBytes(6).toString('hex')
  const now = Date.now()
  const row = withAudit(db, getAdminContext(req), {
    action: 'point.create', resourceType: 'point', resourceId: id, before: {}
  }, () => {
    db.prepare(`
      INSERT INTO points
        (id, activity_id, sort_order, name, subtitle, category, badge_id, latitude, longitude,
         cover_url, cover_tone, summary, description, media_json, tags_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, values.activity_id, values.sort_order || 0, values.name, values.subtitle || '',
      values.category || '', values.badge_id || null, values.latitude || 0, values.longitude || 0,
      values.cover_url || '', values.cover_tone || 'teal', values.summary || '', values.description || '',
      values.media_json || '{}', values.tags_json || '[]', values.status || 'active', now, now
    )
    return db.prepare('SELECT * FROM points WHERE id = ?').get(id)
  })
  ok(res, pointDto(row))
}))

router.put('/:id', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const before = db.prepare('SELECT * FROM points WHERE id = ?').get(req.params.id)
  if (!before) throw notFound()
  const values = validatePointInput(req.body || {}, true)
  if (values.activity_id) assertActivity(db, values.activity_id)
  values.updated_at = Date.now()
  const { sets, params } = buildUpdate(values)
  const row = withAudit(db, getAdminContext(req), {
    action: 'point.update', resourceType: 'point', resourceId: before.id, before: pointDto(before)
  }, () => {
    db.prepare(`UPDATE points SET ${sets} WHERE id = ?`).run(...params, before.id)
    return db.prepare('SELECT * FROM points WHERE id = ?').get(before.id)
  })
  ok(res, pointDto(row))
}))

router.post('/:id/sort', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const before = db.prepare('SELECT * FROM points WHERE id = ?').get(req.params.id)
  if (!before) throw notFound()
  const sortOrder = Number(req.body && req.body.sortOrder)
  if (!Number.isInteger(sortOrder) || sortOrder < 0) throw badRequest('sortOrder 必须是非负整数')
  const row = withAudit(db, getAdminContext(req), {
    action: 'point.sort', resourceType: 'point', resourceId: before.id,
    before: { id: before.id, sortOrder: before.sort_order }
  }, () => {
    db.prepare('UPDATE points SET sort_order = ?, updated_at = ? WHERE id = ?')
      .run(sortOrder, Date.now(), before.id)
    return db.prepare('SELECT * FROM points WHERE id = ?').get(before.id)
  })
  ok(res, pointDto(row))
}))

router.patch('/:id/status', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const before = db.prepare('SELECT * FROM points WHERE id = ?').get(req.params.id)
  if (!before) throw notFound()
  const status = req.body && req.body.status
  if (!['active', 'inactive', 'archived'].includes(status)) throw badRequest('点位状态非法')
  const row = withAudit(db, getAdminContext(req), {
    action: 'point.status', resourceType: 'point', resourceId: before.id,
    before: { id: before.id, status: before.status }
  }, () => {
    db.prepare('UPDATE points SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), before.id)
    return db.prepare('SELECT * FROM points WHERE id = ?').get(before.id)
  })
  ok(res, pointDto(row))
}))

router.post('/:id/enable', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const before = db.prepare('SELECT * FROM points WHERE id = ?').get(req.params.id)
  if (!before) throw notFound()
  const row = withAudit(db, getAdminContext(req), {
    action: 'point.enable', resourceType: 'point', resourceId: before.id,
    before: { id: before.id, status: before.status }
  }, () => {
    db.prepare("UPDATE points SET status = 'active', updated_at = ? WHERE id = ?")
      .run(Date.now(), before.id)
    return db.prepare('SELECT * FROM points WHERE id = ?').get(before.id)
  })
  ok(res, pointDto(row))
}))

router.post('/:id/disable', requireRole('super_admin', 'operator'), run((req, res) => {
  const db = getDb()
  const before = db.prepare('SELECT * FROM points WHERE id = ?').get(req.params.id)
  if (!before) throw notFound()
  const row = withAudit(db, getAdminContext(req), {
    action: 'point.disable', resourceType: 'point', resourceId: before.id,
    before: { id: before.id, status: before.status }
  }, () => {
    db.prepare("UPDATE points SET status = 'inactive', updated_at = ? WHERE id = ?")
      .run(Date.now(), before.id)
    return db.prepare('SELECT * FROM points WHERE id = ?').get(before.id)
  })
  ok(res, pointDto(row))
}))

module.exports = router
