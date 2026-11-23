// server/src/uid.js - NFC UID 规范化（服务端统一处理，前端不保存 UID）
const MAX_UID_LENGTH = 64
const UID_PATTERN = /^[A-Z0-9:_-]+$/

function normalizeUid(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'UID 必须为字符串' }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'UID 不能为空' }
  const uid = trimmed.toUpperCase()
  if (uid.length > MAX_UID_LENGTH) return { ok: false, error: 'UID 长度不能超过 64 个字符' }
  if (!UID_PATTERN.test(uid)) return { ok: false, error: 'UID 包含非法字符' }
  return { ok: true, uid }
}

module.exports = { normalizeUid, MAX_UID_LENGTH }
