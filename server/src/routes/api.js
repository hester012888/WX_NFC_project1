// server/src/routes/api.js - 小程序使用的 HTTP API（挂载于 /api）
// 路径、参数与响应格式与第一阶段保持一致，仅将数据来源切换为数据库仓储层。
const express = require('express')
const repository = require('../repository')

const router = express.Router()
const ok = (res, data) => res.json({ code: 0, message: 'ok', data })
const fail = (res, message, status = 400) => res.status(status).json({ code: status, message })

router.get('/health', (req, res) => ok(res, { status: 'up', time: Date.now() }))

router.get('/home', (req, res) => {
  const visitorId = repository.getVisitorId(req)
  ok(res, {
    activity: repository.getActivity(),
    featured: repository.decorateSpots(visitorId).slice(0, 3),
    stats: repository.statsFor(visitorId)
  })
})

router.get('/activities/:id', (req, res) => {
  const visitorId = repository.getVisitorId(req)
  ok(res, {
    activity: repository.getActivity(),
    currentId: req.params.id,
    spots: repository.decorateSpots(visitorId),
    stats: repository.statsFor(visitorId)
  })
})

router.get('/spots/:id', (req, res) => {
  const visitorId = repository.getVisitorId(req)
  const spot = repository.decorateSpots(visitorId).find((item) => item.id === req.params.id)
  if (!spot) return fail(res, '点位不存在', 404)
  ok(res, spot)
})

router.get('/map', (req, res) => {
  const visitorId = repository.getVisitorId(req)
  ok(res, { activity: repository.getActivity(), spots: repository.decorateSpots(visitorId) })
})

router.get('/badges', (req, res) => {
  const visitorId = repository.getVisitorId(req)
  const checkins = repository.getCheckins(visitorId)
  ok(res, repository.getBadges().map((badge) => {
    const record = checkins.find((item) => item.spotId === badge.spotId)
    return { ...badge, unlocked: !!record, unlockedAt: record ? record.time : '' }
  }))
})

router.get('/profile', (req, res) => {
  const visitorId = repository.getVisitorId(req)
  const checkins = repository.getCheckins(visitorId).map((item) => {
    const spot = repository.getPointById(item.spotId)
    return { ...item, spotName: spot ? spot.name : '未知点位' }
  })
  ok(res, {
    visitorId,
    activity: repository.getActivity(),
    stats: repository.statsFor(visitorId),
    checkins
  })
})

router.post('/checkins', (req, res) => {
  const { spotId, uid = '' } = req.body || {}
  if (!spotId || !repository.getPointRecord(spotId)) {
    return fail(res, '无效的点位 ID')
  }
  const visitorId = repository.getVisitorId(req)
  const { record } = repository.addCheckin(visitorId, { spotId, uid, time: Date.now() })
  const badge = repository.getBadges().find((item) => item.spotId === spotId) || null
  ok(res, { record, badge, stats: repository.statsFor(visitorId) })
})

// NDEF 链接进入：小程序把 UID 交给后端查询活动与点位（响应格式不变）
router.post('/nfc/resolve', (req, res) => {
  const { uid } = req.body || {}
  if (!uid) return fail(res, '缺少 UID')
  const result = repository.resolveUid(uid)
  if (!result) return fail(res, '未找到 UID 对应的点位', 404)
  ok(res, result)
})

// RUK 读卡器正式事件接收接口：路径、参数与响应格式保持不变
router.post('/nfc/events', (req, res) => {
  const { uid, type = 'tag_read', deviceId = '' } = req.body || {}
  if (!uid) return fail(res, '缺少 UID')
  const target = repository.resolveUid(uid)
  repository.recordDeviceEvent({
    deviceId,
    uid,
    type,
    payload: req.body || {},
    target
  })
  ok(res, {
    accepted: true,
    type,
    deviceId,
    activityId: target ? target.activityId : null,
    spotId: target ? target.spotId : null
  })
})

// 媒体资源清单预留：正式环境从 OSS 或数据库返回签名 URL
router.get('/media', (req, res) => {
  ok(res, repository.getMedia())
})

module.exports = router
