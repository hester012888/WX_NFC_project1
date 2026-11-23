// server/src/routes/api.js - 小程序使用的 HTTP API（挂载于 /api）
const express = require('express')
const store = require('../store')

const router = express.Router()
const ok = (res, data) => res.json({ code: 0, message: 'ok', data })
const fail = (res, message, status = 400) => res.status(status).json({ code: status, message })

router.get('/health', (req, res) => ok(res, { status: 'up', time: Date.now() }))

router.get('/home', (req, res) => {
  const visitorId = store.getVisitorId(req)
  ok(res, {
    activity: store.activity,
    featured: store.decorateSpots(visitorId).slice(0, 3),
    stats: store.statsFor(visitorId)
  })
})

router.get('/activities/:id', (req, res) => {
  const visitorId = store.getVisitorId(req)
  ok(res, {
    activity: store.activity,
    currentId: req.params.id,
    spots: store.decorateSpots(visitorId),
    stats: store.statsFor(visitorId)
  })
})

router.get('/spots/:id', (req, res) => {
  const visitorId = store.getVisitorId(req)
  const spot = store.decorateSpots(visitorId).find((item) => item.id === req.params.id)
  if (!spot) return fail(res, '点位不存在', 404)
  ok(res, spot)
})

router.get('/map', (req, res) => {
  const visitorId = store.getVisitorId(req)
  ok(res, { activity: store.activity, spots: store.decorateSpots(visitorId) })
})

router.get('/badges', (req, res) => {
  const visitorId = store.getVisitorId(req)
  const checkins = store.getCheckins(visitorId)
  ok(res, store.badges.map((badge) => {
    const record = checkins.find((item) => item.spotId === badge.spotId)
    return { ...badge, unlocked: !!record, unlockedAt: record ? record.time : '' }
  }))
})

router.get('/profile', (req, res) => {
  const visitorId = store.getVisitorId(req)
  const checkins = store.getCheckins(visitorId).map((item) => {
    const spot = store.spots.find((s) => s.id === item.spotId)
    return { ...item, spotName: spot ? spot.name : '未知点位' }
  })
  ok(res, { visitorId, activity: store.activity, stats: store.statsFor(visitorId), checkins })
})

router.post('/checkins', (req, res) => {
  const { spotId, uid = '' } = req.body || {}
  if (!spotId || !store.spots.some((item) => item.id === spotId)) {
    return fail(res, '无效的点位 ID')
  }
  const visitorId = store.getVisitorId(req)
  const record = { spotId, uid, time: Date.now() }
  store.addCheckin(visitorId, record)
  const badge = store.badges.find((item) => item.spotId === spotId) || null
  ok(res, { record, badge, stats: store.statsFor(visitorId) })
})

// NDEF 链接进入：小程序把 UID 交给后端查询活动与点位
router.post('/nfc/resolve', (req, res) => {
  const { uid } = req.body || {}
  if (!uid) return fail(res, '缺少 UID')
  const result = store.resolveUid(uid)
  if (!result) return fail(res, '未找到 UID 对应的点位', 404)
  ok(res, result)
})

// 专用读卡器上报设备事件：设备端直接 POST 到本接口
router.post('/nfc/events', (req, res) => {
  const { uid, type = 'tag_read', deviceId = '' } = req.body || {}
  if (!uid) return fail(res, '缺少 UID')
  const target = store.resolveUid(uid)
  ok(res, { accepted: true, type, deviceId, activityId: target ? target.activityId : null, spotId: target ? target.spotId : null })
})

// 媒体资源清单预留：正式环境从 OSS 或数据库返回签名 URL
router.get('/media', (req, res) => {
  const media = store.spots.flatMap((spot) =>
    [
      ...(spot.media.images || []).map((url) => ({ spotId: spot.id, type: 'image', url })),
      spot.media.video ? { spotId: spot.id, type: 'video', url: spot.media.video } : null,
      spot.media.audio ? { spotId: spot.id, type: 'audio', url: spot.media.audio } : null
    ].filter(Boolean)
  )
  ok(res, media)
})

module.exports = router
