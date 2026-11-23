// server/src/routes/admin/checkins.js - 打卡记录只读查询
const express = require('express')
const { getDb } = require('../../db')
const { parsePagination } = require('../../admin-helpers')

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

function bad(message) {
  const err = new Error(message)
  err.status = 400
  err.code = 'INVALID_PARAMS'
  return err
}

function dto(row) {
  return {
    id: row.id,
    visitorId: row.visitor_id,
    pointId: row.point_id,
    pointName: row.point_name || '',
    activityId: row.activity_id || '',
    activityName: row.activity_name || '',
    uid: row.uid || '',
    time: row.client_time,
    isValid: !!row.is_valid,
    createdAt: row.created_at
  }
}

router.get('/', run((req, res) => {
  const db = getDb()
  const { page, pageSize, offset } = parsePagination(req.query)
  const clauses = []
  const params = []
  if (req.query.visitorId) {
    clauses.push('r.visitor_id = ?')
    params.push(String(req.query.visitorId))
  }
  if (req.query.activityId) {
    clauses.push('p.activity_id = ?')
    params.push(String(req.query.activityId))
  }
  if (req.query.pointId) {
    clauses.push('r.point_id = ?')
    params.push(String(req.query.pointId))
  }
  if (req.query.valid === 'valid') clauses.push('r.is_valid = 1')
  if (req.query.valid === 'invalid') clauses.push('r.is_valid = 0')
  if (req.query.valid && !['valid', 'invalid', 'all'].includes(req.query.valid)) throw bad('valid 参数非法')
  ;['from', 'to'].forEach((key) => {
    if (req.query[key] !== undefined) {
      const value = Number(req.query[key])
      if (!Number.isFinite(value)) throw bad(`${key} 必须是时间戳`)
      clauses.push(key === 'from' ? 'r.client_time >= ?' : 'r.client_time <= ?')
      params.push(value)
    }
  })
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
  const joins = 'FROM checkin_records r LEFT JOIN points p ON p.id = r.point_id LEFT JOIN activities a ON a.id = p.activity_id'
  const total = db.prepare(`SELECT COUNT(*) AS c ${joins} ${where}`).get(...params).c
  const rows = db.prepare(`
    SELECT r.*, p.name AS point_name, p.activity_id, a.name AS activity_name
    ${joins} ${where}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)
  ok(res, { list: rows.map(dto), total, page, pageSize })
}))

module.exports = router
