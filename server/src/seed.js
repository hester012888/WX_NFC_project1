// server/src/seed.js - 从现有 store.js 常量幂等播种，不重复定义业务数据
const store = require('./store')
const { normalizeUid } = require('./uid')
const { getDb } = require('./db')

function seed(db = getDb()) {
  const now = Date.now()
  const activity = store.activity

  const insertActivity = db.prepare(`
    INSERT OR IGNORE INTO activities
      (id, name, slogan, period, location, summary, description, rules_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `)
  const insertPoint = db.prepare(`
    INSERT OR IGNORE INTO points
      (id, activity_id, sort_order, name, subtitle, category, badge_id, latitude, longitude,
       cover_url, cover_tone, summary, description, media_json, tags_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `)
  const insertBadge = db.prepare(`
    INSERT OR IGNORE INTO badges
      (id, point_id, name, symbol, tone, badge_desc, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `)
  const findTag = db.prepare("SELECT 1 FROM nfc_tags WHERE uid = ? AND status = 'active'")
  const insertTag = db.prepare(`
    INSERT INTO nfc_tags (uid, raw_uid, activity_id, point_id, status, bound_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
  `)

  db.transaction(() => {
    insertActivity.run(
      activity.id, activity.name, activity.slogan, activity.period, activity.location,
      activity.summary, activity.description, JSON.stringify(activity.rules || []), now, now
    )

    for (const spot of store.spots) {
      insertPoint.run(
        spot.id, activity.id, spot.order, spot.name, spot.subtitle, spot.category, spot.badgeId,
        spot.latitude, spot.longitude, spot.coverUrl, spot.coverTone, spot.summary, spot.description,
        JSON.stringify(spot.media || {}), JSON.stringify(spot.tags || []), now, now
      )
    }

    for (const badge of store.badges) {
      insertBadge.run(badge.id, badge.spotId, badge.name, badge.symbol, badge.tone, badge.desc, now, now)
    }

    for (const [rawUid, pointId] of Object.entries(store.uidBindings)) {
      const normalized = normalizeUid(rawUid)
      if (!normalized.ok || findTag.get(normalized.uid)) continue
      insertTag.run(normalized.uid, rawUid, activity.id, pointId, now, now, now)
    }
  })()
}

module.exports = seed
