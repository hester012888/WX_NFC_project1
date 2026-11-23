// server/src/routes/admin/nfc-tags.js - 管理员 NFC UID 管理
// 直接复用 repository 中已验证的 UID 业务逻辑与事务，不重复实现绑定规则。
const express = require('express')
const repository = require('../../repository')
const { normalizeUid } = require('../../uid')
const { getAdminContext, requireRole } = require('../../admin-auth')
const { withAudit } = require('../../admin-audit')
const { parsePagination, badRequest } = require('../../admin-helpers')

const router = express.Router()
const ok = (res, data) => res.json({ code: 0, message: 'ok', data })
const manage = requireRole('super_admin', 'operator')

function run(handler) {
  return (req, res, next) => {
    try {
      handler(req, res)
    } catch (err) {
      next(err)
    }
  }
}

function audit(req, action, resourceId, before, operation) {
  return withAudit(require('../../db').getDb(), getAdminContext(req), {
    action, resourceType: 'nfc_tag', resourceId, before
  }, operation)
}

router.get('/check', manage, run((req, res) => {
  const normalized = normalizeUid(req.query.uid)
  if (!normalized.ok) throw badRequest(normalized.error, 'INVALID_UID')
  ok(res, { uid: normalized.uid, exists: repository.tagExists(normalized.uid) })
}))

router.get('/', manage, run((req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query)
  let list = repository.listTags({
    activityId: req.query.activityId || '',
    pointId: req.query.pointId || ''
  })
  if (req.query.uid) {
    const keyword = String(req.query.uid).toUpperCase()
    list = list.filter((tag) => tag.uid.includes(keyword))
  }
  ok(res, { list: list.slice(offset, offset + pageSize), total: list.length, page, pageSize })
}))

router.get('/:uid', manage, run((req, res) => {
  const tag = repository.getTag(req.params.uid)
  if (!tag) {
    const err = new Error('UID 不存在或格式非法')
    err.status = 404
    err.code = 'TAG_NOT_FOUND'
    throw err
  }
  ok(res, tag)
}))

router.post('/', manage, run((req, res) => {
  const uid = (req.body || {}).uid
  const normalized = normalizeUid(uid)
  if (!normalized.ok) throw badRequest(normalized.error, 'INVALID_UID')
  const tag = audit(req, 'nfc_tag.create', normalized.uid, {}, () => repository.createTag(uid))
  ok(res, tag)
}))

router.post('/:uid/bind', manage, run((req, res) => {
  const { activityId, pointId } = req.body || {}
  const before = repository.getTag(req.params.uid)
  const tag = audit(req, 'nfc_tag.bind', before ? before.uid : req.params.uid, before || {},
    () => repository.bindTag(req.params.uid, activityId, pointId))
  ok(res, tag)
}))

router.post('/:uid/unbind', manage, run((req, res) => {
  const before = repository.getTag(req.params.uid)
  const tag = audit(req, 'nfc_tag.unbind', before ? before.uid : req.params.uid, before || {},
    () => repository.unbindTag(req.params.uid))
  ok(res, tag)
}))

router.put('/:uid/point', manage, run((req, res) => {
  const { activityId, pointId } = req.body || {}
  const before = repository.getTag(req.params.uid)
  const tag = audit(req, 'nfc_tag.rebind', before ? before.uid : req.params.uid, before || {},
    () => repository.rebindTag(req.params.uid, activityId, pointId))
  ok(res, tag)
}))

module.exports = router
