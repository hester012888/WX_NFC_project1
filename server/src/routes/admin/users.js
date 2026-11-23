// server/src/routes/admin/users.js - 游客与微信用户只读查询
const express = require('express')
const { getDb } = require('../../db')
const { parsePagination, maskOpenid } = require('../../admin-helpers')

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

function userDto(row, canSeeOpenid) {
  return {
    visitorId: row.visitor_id,
    userType: row.openid ? 'wechat' : 'guest',
    openid: row.openid ? (canSeeOpenid ? row.openid : maskOpenid(row.openid)) : '',
    hasUnionId: !!row.union_id,
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    status: row.status,
    mergedInto: row.merged_into || '',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    checkinCount: row.checkin_count || 0
  }
}

router.get('/', run((req, res) => {
  const db = getDb()
  const { page, pageSize, offset } = parsePagination(req.query)
  const clauses = []
  const params = []
  if (req.query.visitorId) {
    clauses.push('u.visitor_id LIKE ?')
    params.push('%' + String(req.query.visitorId).slice(0, 100) + '%')
  }
  if (req.query.openid) {
    clauses.push('u.openid LIKE ?')
    params.push('%' + String(req.query.openid).slice(0, 100) + '%')
  }
  if (req.query.type === 'wechat') clauses.push('u.openid IS NOT NULL')
  if (req.query.type === 'guest') clauses.push('u.openid IS NULL')
  if (req.query.status) {
    if (!['active', 'disabled'].includes(req.query.status)) {
      const err = new Error('用户状态非法')
      err.status = 400
      err.code = 'INVALID_PARAMS'
      throw err
    }
    clauses.push('u.status = ?')
    params.push(req.query.status)
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
  const total = db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...params).c
  const rows = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM checkin_records r
                 WHERE r.visitor_id = u.visitor_id AND r.is_valid = 1) AS checkin_count
    FROM users u ${where}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)
  const canSeeOpenid = req.admin.role === 'super_admin'
  ok(res, { list: rows.map((row) => userDto(row, canSeeOpenid)), total, page, pageSize })
}))

router.get('/:visitorId', run((req, res) => {
  const db = getDb()
  const row = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM checkin_records r
                 WHERE r.visitor_id = u.visitor_id AND r.is_valid = 1) AS checkin_count
    FROM users u WHERE u.visitor_id = ?
  `).get(req.params.visitorId)
  if (!row) {
    const err = new Error('用户不存在')
    err.status = 404
    err.code = 'USER_NOT_FOUND'
    throw err
  }
  const canSeeOpenid = req.admin.role === 'super_admin'
  const checkins = db.prepare(`
    SELECT r.point_id AS spotId, p.name AS pointName, r.client_time AS time, r.is_valid AS isValid
    FROM checkin_records r LEFT JOIN points p ON p.id = r.point_id
    WHERE r.visitor_id = ? ORDER BY r.created_at DESC
  `).all(req.params.visitorId)
  ok(res, { ...userDto(row, canSeeOpenid), checkins })
}))

module.exports = router
