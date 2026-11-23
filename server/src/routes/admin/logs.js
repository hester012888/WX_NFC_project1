// server/src/routes/admin/logs.js - 操作日志只读查询（super_admin）
const express = require('express')
const { getDb } = require('../../db')
const { requireRole } = require('../../admin-auth')
const { sanitize } = require('../../admin-audit')
const { parsePagination } = require('../../admin-helpers')

const router = express.Router()
const ok = (res, data) => res.json({ code: 0, message: 'ok', data })

router.use(requireRole('super_admin'))

function parseJson(value) {
  try {
    return sanitize(JSON.parse(value))
  } catch (err) {
    return {}
  }
}

router.get('/', (req, res, next) => {
  try {
    const db = getDb()
    const { page, pageSize, offset } = parsePagination(req.query)
    const clauses = []
    const params = []
    ;['action', 'resourceType', 'resourceId', 'result'].forEach((key) => {
      if (req.query[key]) {
        const column = key === 'resourceType' ? 'resource_type' : key === 'resourceId' ? 'resource_id' : key
        clauses.push(`${column} = ?`)
        params.push(String(req.query[key]))
      }
    })
    if (req.query.adminId) {
      clauses.push('l.admin_id = ?')
      params.push(Number(req.query.adminId) || 0)
    }
    ;['from', 'to'].forEach((key) => {
      if (req.query[key] !== undefined) {
        const value = Number(req.query[key])
        if (!Number.isFinite(value)) {
          const err = new Error(`${key} 必须是时间戳`)
          err.status = 400
          err.code = 'INVALID_PARAMS'
          throw err
        }
        clauses.push(key === 'from' ? 'l.created_at >= ?' : 'l.created_at <= ?')
        params.push(value)
      }
    })
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
    const joins = 'FROM admin_operation_logs l LEFT JOIN admins a ON a.id = l.admin_id'
    const total = db.prepare(`SELECT COUNT(*) AS c ${joins} ${where}`).get(...params).c
    const rows = db.prepare(`
      SELECT l.*, a.username AS admin_username ${joins} ${where}
      ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)
    ok(res, {
      list: rows.map((row) => ({
        id: row.id,
        adminId: row.admin_id,
        adminUsername: row.admin_username || '',
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        before: parseJson(row.before_json),
        after: parseJson(row.after_json),
        result: row.result,
        ip: row.ip,
        userAgent: row.user_agent,
        createdAt: row.created_at
      })),
      total, page, pageSize
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
