// server/src/routes/nfc-tags.js - NFC UID 绑定管理接口（不占用 /api/admin/* 的 501 预留）
const express = require('express')
const repository = require('../repository')
const { normalizeUid } = require('../uid')
const { requireTrustedSource } = require('../trusted-source')

const router = express.Router()
router.use(requireTrustedSource)
const ok = (res, data) => res.json({ code: 0, message: 'ok', data })
const fail = (res, message, status = 400) => res.status(status).json({ code: status, message })

function run(res, handler) {
  try {
    handler()
  } catch (err) {
    fail(res, err.message || '操作失败', err.status || 400)
  }
}

// 检查 UID 是否已存在（规范化后比较）
router.get('/check', (req, res) => {
  const normalized = normalizeUid(req.query.uid)
  if (!normalized.ok) return fail(res, normalized.error, 400)
  ok(res, { uid: normalized.uid, exists: repository.tagExists(normalized.uid) })
})

// 新增 UID（初始为未绑定状态）
router.post('/', (req, res) => {
  run(res, () => ok(res, repository.createTag((req.body || {}).uid)))
})

// 按活动 / 点位查询标签
router.get('/', (req, res) => {
  run(res, () => ok(res, repository.listTags({
    activityId: req.query.activityId || '',
    pointId: req.query.pointId || ''
  })))
})

// 查询 UID 当前绑定信息
router.get('/:uid', (req, res) => {
  run(res, () => {
    const tag = repository.getTag(req.params.uid)
    if (!tag) return fail(res, 'UID 不存在或格式非法', 404)
    ok(res, tag)
  })
})

// 将 UID 绑定到指定活动与点位
router.post('/:uid/bind', (req, res) => {
  const { activityId, pointId } = req.body || {}
  run(res, () => ok(res, repository.bindTag(req.params.uid, activityId, pointId)))
})

// 解除 UID 绑定
router.post('/:uid/unbind', (req, res) => {
  run(res, () => ok(res, repository.unbindTag(req.params.uid)))
})

// 修改 UID 对应的点位（改绑）
router.put('/:uid/point', (req, res) => {
  const { activityId, pointId } = req.body || {}
  run(res, () => ok(res, repository.rebindTag(req.params.uid, activityId, pointId)))
})

module.exports = router
