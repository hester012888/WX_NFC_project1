// server/src/repository.js - 数据库访问层（对外形状与旧 store.js 保持一致）
const { getDb } = require('./db')
const { normalizeUid } = require('./uid')

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch (err) {
    return fallback
  }
}

function rowToActivity(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slogan: row.slogan,
    period: row.period,
    location: row.location,
    summary: row.summary,
    description: row.description,
    rules: parseJson(row.rules_json, [])
  }
}

function rowToSpot(row) {
  if (!row) return null
  return {
    id: row.id,
    order: row.sort_order,
    name: row.name,
    subtitle: row.subtitle,
    category: row.category,
    badgeId: row.badge_id,
    latitude: row.latitude,
    longitude: row.longitude,
    coverUrl: row.cover_url,
    coverTone: row.cover_tone,
    summary: row.summary,
    description: row.description,
    media: parseJson(row.media_json, {}),
    tags: parseJson(row.tags_json, [])
  }
}

function rowToBadge(row) {
  return {
    id: row.id,
    spotId: row.point_id,
    name: row.name,
    symbol: row.symbol,
    tone: row.tone,
    desc: row.badge_desc
  }
}

function getVisitorId(req) {
  // 身份只来自已验证令牌解析出的 req.identity；X-Visitor-Id 请求头不再作为凭证。
  if (req && req.identity && req.identity.visitorId) return req.identity.visitorId
  return 'anonymous'
}

function getActivity() {
  const row = getDb().prepare("SELECT * FROM activities WHERE status = 'active' ORDER BY rowid LIMIT 1").get()
  return rowToActivity(row)
}

function getActivityRecord(id) {
  return getDb().prepare('SELECT * FROM activities WHERE id = ?').get(id) || null
}

function getPointRecord(id) {
  return getDb().prepare('SELECT * FROM points WHERE id = ?').get(id) || null
}

function getPointById(id) {
  return rowToSpot(getPointRecord(id))
}

function getSpotsRaw() {
  return getDb().prepare("SELECT * FROM points WHERE status = 'active' ORDER BY sort_order, rowid").all().map(rowToSpot)
}

function getCheckins(visitorId) {
  return getDb().prepare(`
    SELECT point_id AS spotId, uid, client_time AS time
    FROM checkin_records
    WHERE visitor_id = ? AND is_valid = 1
    ORDER BY created_at DESC, id DESC
  `).all(visitorId)
}

function ensureUser(db, visitorId) {
  const now = Date.now()
  db.prepare('INSERT OR IGNORE INTO users (visitor_id, created_at, updated_at) VALUES (?, ?, ?)')
    .run(visitorId, now, now)
}

function addCheckin(visitorId, { spotId, uid = '', time = Date.now() }) {
  const db = getDb()
  return db.transaction(() => {
    ensureUser(db, visitorId)
    const user = db.prepare('SELECT status, merged_into FROM users WHERE visitor_id = ?').get(visitorId)
    if (!user || user.status !== 'active' || user.merged_into) {
      const error = new Error('游客身份不可打卡')
      error.status = 401
      error.code = 'IDENTITY_INVALID'
      throw error
    }
    const existing = db.prepare(`
      SELECT point_id AS spotId, uid, client_time AS time
      FROM checkin_records
      WHERE visitor_id = ? AND point_id = ? AND is_valid = 1
    `).get(visitorId, spotId)
    if (existing) return { record: existing, created: false }

    db.prepare(`
      INSERT INTO checkin_records (visitor_id, point_id, uid, client_time, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(visitorId, spotId, uid, time, Date.now())
    return { record: { spotId, uid, time }, created: true }
  })()
}

function statsFor(visitorId) {
  const db = getDb()
  const checked = db.prepare('SELECT COUNT(*) AS c FROM checkin_records WHERE visitor_id = ? AND is_valid = 1').get(visitorId).c
  const total = db.prepare("SELECT COUNT(*) AS c FROM points WHERE status = 'active'").get().c
  const badgeTotal = db.prepare("SELECT COUNT(*) AS c FROM badges WHERE status = 'active'").get().c
  const unlocked = db.prepare(`
    SELECT COUNT(DISTINCT b.id) AS c
    FROM badges b
    JOIN checkin_records r ON r.point_id = b.point_id AND r.is_valid = 1
    WHERE b.status = 'active' AND r.visitor_id = ?
  `).get(visitorId).c
  return {
    checked,
    total,
    badges: unlocked,
    badgeTotal,
    progress: total ? Math.round((checked / total) * 100) : 0
  }
}

function decorateSpots(visitorId) {
  const checkedIds = new Set(getCheckins(visitorId).map((item) => item.spotId))
  return getSpotsRaw().map((spot) => ({ ...spot, checked: checkedIds.has(spot.id) }))
}

function getBadges() {
  return getDb().prepare("SELECT * FROM badges WHERE status = 'active' ORDER BY rowid").all().map(rowToBadge)
}

function getMedia() {
  return getSpotsRaw().flatMap((spot) => [
    ...(spot.media.images || []).map((url) => ({ spotId: spot.id, type: 'image', url })),
    spot.media.video ? { spotId: spot.id, type: 'video', url: spot.media.video } : null,
    spot.media.audio ? { spotId: spot.id, type: 'audio', url: spot.media.audio } : null
  ].filter(Boolean))
}

function resolveUid(rawUid) {
  const normalized = normalizeUid(rawUid)
  if (!normalized.ok) return null
  const tag = getDb().prepare("SELECT * FROM nfc_tags WHERE uid = ? AND status = 'active'").get(normalized.uid)
  if (!tag) return null
  const spot = getPointById(tag.point_id)
  if (!spot) return null
  const activity = getActivity()
  return {
    activityId: tag.activity_id || (activity ? activity.id : null),
    spotId: spot.id,
    spot
  }
}

function recordDeviceEvent({ deviceId = '', uid = '', type = 'tag_read', payload = {}, target = null }) {
  const db = getDb()
  const now = Date.now()
  const normalized = normalizeUid(uid)
  const canonicalUid = normalized.ok ? normalized.uid : uid

  db.transaction(() => {
    if (deviceId) {
      db.prepare(`
        INSERT INTO devices (device_id, last_seen_at, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at
      `).run(deviceId, now, now, now)
    }
    db.prepare(`
      INSERT INTO device_events
        (device_id, uid, event_type, payload_json, activity_id, point_id, resolved, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deviceId, canonicalUid, type, JSON.stringify(payload || {}),
      target ? target.activityId : null,
      target ? target.spotId : null,
      target ? 1 : 0,
      now
    )
  })()
}

function makeError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

function tagRowToDto(row) {
  return {
    uid: row.uid,
    rawUid: row.raw_uid,
    activityId: row.activity_id,
    pointId: row.point_id,
    status: row.status,
    boundAt: row.bound_at,
    unboundAt: row.unbound_at,
    activityName: row.activity_name || '',
    pointName: row.point_name || ''
  }
}

function getTag(rawUid) {
  const normalized = normalizeUid(rawUid)
  if (!normalized.ok) return null
  const row = getDb().prepare(`
    SELECT t.*, a.name AS activity_name, p.name AS point_name
    FROM nfc_tags t
    LEFT JOIN activities a ON a.id = t.activity_id
    LEFT JOIN points p ON p.id = t.point_id
    WHERE t.uid = ?
    ORDER BY CASE t.status WHEN 'active' THEN 0 ELSE 1 END, t.id DESC
    LIMIT 1
  `).get(normalized.uid)
  return row ? tagRowToDto(row) : null
}

function tagExists(rawUid) {
  return getTag(rawUid) !== null
}

function isConstraintError(err) {
  return typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')
}

function createTag(rawUid) {
  const normalized = normalizeUid(rawUid)
  if (!normalized.ok) throw makeError(normalized.error, 400)
  const db = getDb()
  try {
    return db.transaction(() => {
      if (db.prepare('SELECT 1 FROM nfc_tags WHERE uid = ?').get(normalized.uid)) {
        throw makeError('UID 已存在', 409)
      }
      const now = Date.now()
      db.prepare(`
        INSERT INTO nfc_tags (uid, raw_uid, status, created_at, updated_at)
        VALUES (?, ?, 'unbound', ?, ?)
      `).run(normalized.uid, rawUid, now, now)
      return getTag(normalized.uid)
    })()
  } catch (err) {
    if (isConstraintError(err)) throw makeError('UID 已存在', 409)
    throw err
  }
}

function validateBinding(activityId, pointId) {
  if (!activityId) throw makeError('缺少活动 ID', 400)
  if (!pointId) throw makeError('缺少点位 ID', 400)
  const activity = getActivityRecord(activityId)
  if (!activity) throw makeError('活动不存在', 404)
  if (activity.status !== 'active') throw makeError('活动已停用', 400)
  const point = getPointRecord(pointId)
  if (!point) throw makeError('点位不存在', 404)
  if (point.status !== 'active') throw makeError('点位已停用', 400)
  if (point.activity_id !== activityId) throw makeError('点位不属于该活动', 400)
}

function bindTag(rawUid, activityId, pointId) {
  const normalized = normalizeUid(rawUid)
  if (!normalized.ok) throw makeError(normalized.error, 400)
  validateBinding(activityId, pointId)
  const db = getDb()
  try {
    return db.transaction(() => {
      const row = db.prepare('SELECT * FROM nfc_tags WHERE uid = ?').get(normalized.uid)
      if (!row) throw makeError('UID 不存在，请先新增', 404)
      if (row.status === 'active' && row.point_id === pointId) {
        throw makeError('UID 已绑定到该点位', 409)
      }
      if (row.status === 'active') {
        throw makeError('UID 已绑定，请使用改绑接口', 409)
      }
      const now = Date.now()
      db.prepare(`
        UPDATE nfc_tags
        SET activity_id = ?, point_id = ?, status = 'active', bound_at = ?, unbound_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(activityId, pointId, now, now, row.id)
      return getTag(normalized.uid)
    })()
  } catch (err) {
    if (isConstraintError(err)) throw makeError('UID 已被其他绑定占用', 409)
    throw err
  }
}

function unbindTag(rawUid) {
  const normalized = normalizeUid(rawUid)
  if (!normalized.ok) throw makeError(normalized.error, 400)
  const db = getDb()
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM nfc_tags WHERE uid = ?').get(normalized.uid)
    if (!row) throw makeError('UID 不存在', 404)
    if (row.status !== 'active') return getTag(normalized.uid)
    const now = Date.now()
    db.prepare(`
      UPDATE nfc_tags SET status = 'unbound', unbound_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, row.id)
    return getTag(normalized.uid)
  })()
}

function rebindTag(rawUid, activityId, pointId) {
  const normalized = normalizeUid(rawUid)
  if (!normalized.ok) throw makeError(normalized.error, 400)
  validateBinding(activityId, pointId)
  const db = getDb()
  try {
    return db.transaction(() => {
      const row = db.prepare('SELECT * FROM nfc_tags WHERE uid = ?').get(normalized.uid)
      if (!row) throw makeError('UID 不存在，请先新增', 404)
      if (row.status === 'active' && row.activity_id === activityId && row.point_id === pointId) {
        return getTag(normalized.uid)
      }
      const now = Date.now()
      db.prepare(`
        UPDATE nfc_tags
        SET activity_id = ?, point_id = ?, status = 'active', bound_at = ?, unbound_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(activityId, pointId, now, now, row.id)
      return getTag(normalized.uid)
    })()
  } catch (err) {
    if (isConstraintError(err)) throw makeError('UID 已被其他绑定占用', 409)
    throw err
  }
}

function listTags({ activityId = '', pointId = '' } = {}) {
  const clauses = []
  const params = []
  if (activityId) {
    clauses.push('t.activity_id = ?')
    params.push(activityId)
  }
  if (pointId) {
    clauses.push('t.point_id = ?')
    params.push(pointId)
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''
  return getDb().prepare(`
    SELECT t.*, a.name AS activity_name, p.name AS point_name
    FROM nfc_tags t
    LEFT JOIN activities a ON a.id = t.activity_id
    LEFT JOIN points p ON p.id = t.point_id
    ${where}
    ORDER BY t.id
  `).all(...params).map(tagRowToDto)
}

module.exports = {
  getVisitorId,
  getActivity,
  getActivityRecord,
  getPointRecord,
  getPointById,
  getSpotsRaw,
  getCheckins,
  addCheckin,
  statsFor,
  decorateSpots,
  getBadges,
  getMedia,
  resolveUid,
  recordDeviceEvent,
  getTag,
  tagExists,
  createTag,
  bindTag,
  unbindTag,
  rebindTag,
  listTags
}
