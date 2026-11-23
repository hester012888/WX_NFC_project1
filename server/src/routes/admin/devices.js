// server/src/routes/admin/devices.js - 设备与设备事件只读查询
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

function deviceDto(row) {
  return {
    deviceId: row.device_id,
    name: row.name || '',
    model: row.model || '',
    status: row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    eventCount: row.event_count || 0
  }
}

function eventDto(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    uid: row.uid,
    eventType: row.event_type,
    activityId: row.activity_id || '',
    pointId: row.point_id || '',
    resolved: !!row.resolved,
    createdAt: row.created_at
  }
}

router.get('/devices', run((req, res) => {
  const db = getDb()
  const { page, pageSize, offset } = parsePagination(req.query)
  const clauses = []
  const params = []
  if (req.query.deviceId) {
    clauses.push('d.device_id LIKE ?')
    params.push('%' + String(req.query.deviceId).slice(0, 100) + '%')
  }
  if (req.query.status) {
    if (!['active', 'disabled'].includes(req.query.status)) throw bad('设备状态非法')
    clauses.push('d.status = ?')
    params.push(req.query.status)
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
  const total = db.prepare(`SELECT COUNT(*) AS c FROM devices d ${where}`).get(...params).c
  const rows = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM device_events e WHERE e.device_id = d.device_id) AS event_count
    FROM devices d ${where} ORDER BY d.last_seen_at DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)
  ok(res, { list: rows.map(deviceDto), total, page, pageSize })
}))

router.get('/devices/:deviceId', run((req, res) => {
  const row = getDb().prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM device_events e WHERE e.device_id = d.device_id) AS event_count
    FROM devices d WHERE d.device_id = ?
  `).get(req.params.deviceId)
  if (!row) {
    const err = new Error('设备不存在')
    err.status = 404
    err.code = 'DEVICE_NOT_FOUND'
    throw err
  }
  ok(res, deviceDto(row))
}))

router.get('/device-events', run((req, res) => {
  const db = getDb()
  const { page, pageSize, offset } = parsePagination(req.query)
  const clauses = []
  const params = []
  if (req.query.uid) {
    clauses.push('uid = ?')
    params.push(String(req.query.uid).toUpperCase())
  }
  if (req.query.deviceId) {
    clauses.push('device_id = ?')
    params.push(String(req.query.deviceId))
  }
  if (req.query.resolved !== undefined && req.query.resolved !== 'all') {
    if (!['0', '1'].includes(String(req.query.resolved))) throw bad('resolved 参数非法')
    clauses.push('resolved = ?')
    params.push(Number(req.query.resolved))
  }
  ;['from', 'to'].forEach((key) => {
    if (req.query[key] !== undefined) {
      const value = Number(req.query[key])
      if (!Number.isFinite(value)) throw bad(`${key} 必须是时间戳`)
      clauses.push(key === 'from' ? 'created_at >= ?' : 'created_at <= ?')
      params.push(value)
    }
  })
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
  const total = db.prepare(`SELECT COUNT(*) AS c FROM device_events ${where}`).get(...params).c
  const rows = db.prepare(`
    SELECT * FROM device_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)
  ok(res, { list: rows.map(eventDto), total, page, pageSize })
}))

module.exports = router
