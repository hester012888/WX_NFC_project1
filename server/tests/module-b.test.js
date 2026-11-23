// server/tests/module-b.test.js - 模块 B：NFC UID 绑定管理与原有 NFC 流程回归
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-module-b-'))
process.env.DB_PATH = path.join(tmpDir, 'module-b.db')
process.env.NODE_ENV = 'development'

const { openDb, setDb, closeDb, getDb } = require('../src/db')
const { migrate } = require('../src/migrate')
const seed = require('../src/seed')
const { normalizeUid } = require('../src/uid')
const { createApp } = require('../src/app')

let db = openDb(process.env.DB_PATH)
setDb(db)
migrate(db)
seed(db)

let server
let baseUrl
let guestToken = ''
let guestVisitorId = ''

function request(url, options = {}) {
  return fetch(baseUrl + url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Visitor-Id': options.visitorId || 'bind_visitor',
      ...(guestToken ? { 'X-Guest-Token': guestToken } : {}),
      ...(options.headers || {})
    },
    ...options
  }).then(async (res) => ({ status: res.status, body: await res.json() }))
}

test.before(async () => {
  server = await new Promise((resolve) => {
    const instance = createApp().listen(0, () => resolve(instance))
  })
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api'
  const guest = await request('/auth/guest', { method: 'POST' })
  guestToken = guest.body.data.token
  guestVisitorId = guest.body.data.visitorId

  const now = Date.now()
  db.prepare(`INSERT INTO activities (id, name, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`)
    .run('act_test_002', '测试活动二', now, now)
  db.prepare(`INSERT INTO points (id, activity_id, sort_order, name, status, created_at, updated_at)
              VALUES (?, ?, 99, ?, 'active', ?, ?)`)
    .run('spot_test_002', 'act_test_002', '测试点位二', now, now)
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('UID 规范化：统一大写、拒绝空值与非法字符', () => {
  assert.deepEqual(normalizeUid('  demo_uid_0001  '), { ok: true, uid: 'DEMO_UID_0001' })
  assert.equal(normalizeUid('').ok, false)
  assert.equal(normalizeUid('   ').ok, false)
  assert.equal(normalizeUid('UID@BAD').ok, false)
  assert.equal(normalizeUid(123).ok, false)
  assert.equal(normalizeUid('A'.repeat(65)).ok, false)
})

test('新增 UID、重复检查与非法 UID 拒绝', async () => {
  const created = await request('/nfc/tags', { method: 'POST', body: JSON.stringify({ uid: ' custom_uid_0001 ' }) })
  assert.equal(created.status, 200)
  assert.equal(created.body.data.uid, 'CUSTOM_UID_0001')
  assert.equal(created.body.data.status, 'unbound')

  const checked = await request('/nfc/tags/check?uid=custom_uid_0001')
  assert.equal(checked.body.data.exists, true)
  assert.equal(checked.body.data.uid, 'CUSTOM_UID_0001')

  const duplicate = await request('/nfc/tags', { method: 'POST', body: JSON.stringify({ uid: 'custom_uid_0001' }) })
  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.message, 'UID 已存在')

  const empty = await request('/nfc/tags', { method: 'POST', body: JSON.stringify({ uid: '' }) })
  assert.equal(empty.status, 400)

  const invalid = await request('/nfc/tags/check?uid=UID%40BAD')
  assert.equal(invalid.status, 400)

  const unknown = await request('/nfc/tags/UNKNOWN_UID')
  assert.equal(unknown.status, 404)
})

test('活动/点位不存在、停用与错配校验', async () => {
  const noActivity = await request('/nfc/tags/CUSTOM_UID_0001/bind', {
    method: 'POST',
    body: JSON.stringify({ activityId: 'act_not_exists', pointId: 'spot_city_gate' })
  })
  assert.equal(noActivity.status, 404)
  assert.equal(noActivity.body.message, '活动不存在')

  const noPoint = await request('/nfc/tags/CUSTOM_UID_0001/bind', {
    method: 'POST',
    body: JSON.stringify({ activityId: 'act_city_memory_2026', pointId: 'spot_not_exists' })
  })
  assert.equal(noPoint.status, 404)
  assert.equal(noPoint.body.message, '点位不存在')

  const mismatch = await request('/nfc/tags/CUSTOM_UID_0001/bind', {
    method: 'POST',
    body: JSON.stringify({ activityId: 'act_city_memory_2026', pointId: 'spot_test_002' })
  })
  assert.equal(mismatch.status, 400)
  assert.equal(mismatch.body.message, '点位不属于该活动')

  db.prepare("UPDATE activities SET status = 'draft' WHERE id = 'act_test_002'").run()
  const inactiveActivity = await request('/nfc/tags/CUSTOM_UID_0001/bind', {
    method: 'POST',
    body: JSON.stringify({ activityId: 'act_test_002', pointId: 'spot_test_002' })
  })
  assert.equal(inactiveActivity.status, 400)
  assert.equal(inactiveActivity.body.message, '活动已停用')
})

test('绑定、重复绑定、查询与按活动/点位列出', async () => {
  const bound = await request('/nfc/tags/CUSTOM_UID_0001/bind', {
    method: 'POST',
    body: JSON.stringify({ activityId: 'act_city_memory_2026', pointId: 'spot_city_gate' })
  })
  assert.equal(bound.body.data.status, 'active')
  assert.equal(bound.body.data.pointName, '古城门遗址')

  const duplicate = await request('/nfc/tags/CUSTOM_UID_0001/bind', {
    method: 'POST',
    body: JSON.stringify({ activityId: 'act_city_memory_2026', pointId: 'spot_city_gate' })
  })
  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.message, 'UID 已绑定到该点位')

  const info = await request('/nfc/tags/custom_uid_0001')
  assert.equal(info.body.data.pointId, 'spot_city_gate')
  assert.equal(info.body.data.activityId, 'act_city_memory_2026')

  const byActivity = await request('/nfc/tags?activityId=act_city_memory_2026')
  assert.ok(byActivity.body.data.some((item) => item.uid === 'CUSTOM_UID_0001'))

  const byPoint = await request('/nfc/tags?pointId=spot_city_gate')
  assert.deepEqual(byPoint.body.data.map((item) => item.uid).sort(), ['CUSTOM_UID_0001', 'DEMO_UID_0001'])
})

test('绑定后 UID 解析与 RUK 读卡器事件正常', async () => {
  const resolved = await request('/nfc/resolve', {
    method: 'POST',
    body: JSON.stringify({ uid: 'custom_uid_0001' })
  })
  assert.equal(resolved.body.data.spotId, 'spot_city_gate')
  assert.equal(resolved.body.data.activityId, 'act_city_memory_2026')

  const event = await request('/nfc/events', {
    method: 'POST',
    body: JSON.stringify({ uid: 'custom_uid_0001', type: 'tag_read', deviceId: 'ruk_01' })
  })
  assert.deepEqual(event.body.data, {
    accepted: true,
    type: 'tag_read',
    deviceId: 'ruk_01',
    activityId: 'act_city_memory_2026',
    spotId: 'spot_city_gate'
  })
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM device_events WHERE device_id=?').get('ruk_01').c, 1)
})

test('解绑、未绑定 UID 解析、重新绑定与改绑', async () => {
  const unbound = await request('/nfc/tags/CUSTOM_UID_0001/unbind', { method: 'POST' })
  assert.equal(unbound.body.data.status, 'unbound')

  const unresolved = await request('/nfc/resolve', {
    method: 'POST',
    body: JSON.stringify({ uid: 'CUSTOM_UID_0001' })
  })
  assert.equal(unresolved.status, 404)
  assert.equal(unresolved.body.message, '未找到 UID 对应的点位')

  const readerUnbound = await request('/nfc/events', {
    method: 'POST',
    body: JSON.stringify({ uid: 'CUSTOM_UID_0001', deviceId: 'ruk_02' })
  })
  assert.equal(readerUnbound.body.data.accepted, true)
  assert.equal(readerUnbound.body.data.spotId, null)
  assert.equal(readerUnbound.body.data.activityId, null)

  const rebound = await request('/nfc/tags/CUSTOM_UID_0001/bind', {
    method: 'POST',
    body: JSON.stringify({ activityId: 'act_city_memory_2026', pointId: 'spot_lake_view' })
  })
  assert.equal(rebound.body.data.status, 'active')
  assert.equal(rebound.body.data.pointId, 'spot_lake_view')

  const changed = await request('/nfc/tags/CUSTOM_UID_0001/point', {
    method: 'PUT',
    body: JSON.stringify({ activityId: 'act_city_memory_2026', pointId: 'spot_old_street' })
  })
  assert.equal(changed.body.data.pointId, 'spot_old_street')

  const resolved = await request('/nfc/resolve', {
    method: 'POST',
    body: JSON.stringify({ uid: 'CUSTOM_UID_0001' })
  })
  assert.equal(resolved.body.data.spotId, 'spot_old_street')
})

test('原有功能回归：演示 UID、打卡持久化、后台 501', async () => {
  const demo = await request('/nfc/resolve', {
    method: 'POST',
    body: JSON.stringify({ uid: 'DEMO_UID_0001' })
  })
  assert.equal(demo.body.data.spotId, 'spot_city_gate')

  const checkin = await request('/checkins', {
    method: 'POST',
    visitorId: 'regression_visitor',
    body: JSON.stringify({ spotId: 'spot_city_gate', uid: 'DEMO_UID_0001' })
  })
  assert.equal(checkin.body.data.record.spotId, 'spot_city_gate')

  const duplicate = await request('/checkins', {
    method: 'POST',
    visitorId: 'regression_visitor',
    body: JSON.stringify({ spotId: 'spot_city_gate', uid: 'DEMO_UID_0001' })
  })
  assert.equal(duplicate.body.data.stats.checked, 1)
  assert.equal(getDb().prepare('SELECT COUNT(*) AS c FROM checkin_records WHERE visitor_id=?').get(guestVisitorId).c, 1)

  const health = await request('/health')
  assert.equal(health.body.data.status, 'up')

  const admin = await request('/admin/activities')
  assert.equal(admin.status, 501)
})
