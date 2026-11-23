// server/tests/module-a.test.js - 模块 A：数据库持久化与原有 API 回归
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-module-a-'))
const dbFile = path.join(tmpDir, 'module-a.db')
process.env.DB_PATH = dbFile
process.env.NODE_ENV = 'development'

const { openDb, setDb, closeDb } = require('../src/db')
const { migrate } = require('../src/migrate')
const seed = require('../src/seed')
const repository = require('../src/repository')
const { createApp } = require('../src/app')

let db = openDb(dbFile)
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
      'X-Visitor-Id': options.visitorId || 'test_visitor',
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
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('所有 JSON 配置可解析', () => {
  const root = path.join(__dirname, '..', '..')
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('._')) return []
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : (entry.name.endsWith('.json') ? [full] : [])
  })
  const files = walk(root)
  assert.ok(files.length > 10)
  files.forEach((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
})

test('数据库创建、迁移与幂等播种', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name)
  ;['activities', 'points', 'badges', 'nfc_tags', 'users', 'checkin_records', 'devices', 'device_events', 'schema_migrations']
    .forEach((name) => assert.ok(tables.includes(name), `缺少表 ${name}`))
  assert.ok(db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c >= 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM activities').get().c, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM points').get().c, 6)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM badges').get().c, 6)
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM nfc_tags WHERE status='active'").get().c, 6)
  seed(db)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM points').get().c, 6, '重复播种不应产生重复数据')
})

test('数据增删改：点位与徽章配置可更新', () => {
  const id = 'spot_test_tmp'
  db.prepare(`INSERT INTO points (id, activity_id, sort_order, name, status, created_at, updated_at)
              VALUES (?, ?, 99, ?, 'active', ?, ?)`).run(id, 'act_city_memory_2026', '临时点位', Date.now(), Date.now())
  db.prepare('UPDATE points SET name = ? WHERE id = ?').run('临时点位-改', id)
  assert.equal(repository.getPointById(id).name, '临时点位-改')
  db.prepare('DELETE FROM points WHERE id = ?').run(id)
  assert.equal(repository.getPointById(id), null)
})

test('打卡持久化、重复打卡与统计', () => {
  const first = repository.addCheckin('persist_visitor', { spotId: 'spot_city_gate', uid: 'DEMO_UID_0001', time: 111 })
  const second = repository.addCheckin('persist_visitor', { spotId: 'spot_city_gate', uid: 'DEMO_UID_0001', time: 999 })
  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(second.record.time, 111, '重复打卡应返回原记录时间')
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM checkin_records WHERE visitor_id=?').get('persist_visitor').c, 1)
  assert.equal(repository.statsFor('persist_visitor').checked, 1)
})

test('服务器重启后数据恢复', () => {
  closeDb()
  db = openDb(dbFile)
  setDb(db)
  assert.equal(repository.getCheckins('persist_visitor').length, 1, '重启后打卡记录仍然存在')
  assert.equal(repository.resolveUid('DEMO_UID_0001').spotId, 'spot_city_gate')
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM points').get().c, 6)
})

test('原有 API 回归：健康、首页、活动、点位、地图、徽章、个人、媒体', async () => {
  const health = await request('/health')
  assert.equal(health.status, 200)
  assert.equal(health.body.code, 0)
  assert.equal(health.body.data.status, 'up')

  const home = await request('/home', { visitorId: 'api_visitor' })
  assert.equal(home.body.code, 0)
  assert.equal(home.body.data.activity.id, 'act_city_memory_2026')
  assert.equal(home.body.data.featured.length, 3)
  assert.equal(typeof home.body.data.stats.progress, 'number')

  const activity = await request('/activities/act_city_memory_2026')
  assert.equal(activity.body.data.currentId, 'act_city_memory_2026')
  assert.equal(activity.body.data.spots.length, 6)

  const spot = await request('/spots/spot_city_gate')
  assert.equal(spot.body.code, 0)
  assert.equal(spot.body.data.name, '古城门遗址')

  const missing = await request('/spots/not_exists')
  assert.equal(missing.status, 404)
  assert.equal(missing.body.message, '点位不存在')

  const map = await request('/map')
  assert.equal(map.body.data.spots.length, 6)

  const badges = await request('/badges', { visitorId: 'api_visitor' })
  assert.equal(badges.body.data.length, 6)
  assert.equal(badges.body.data[0].unlocked, false)

  const profile = await request('/profile', { visitorId: 'api_visitor' })
  assert.equal(profile.body.data.visitorId, guestVisitorId)

  const media = await request('/media')
  assert.deepEqual(media.body.data, [])
})

test('原有 API 回归：打卡、UID 解析、RUK 事件与后台 501', async () => {
  const first = await request('/checkins', {
    method: 'POST',
    visitorId: 'http_visitor',
    body: JSON.stringify({ spotId: 'spot_lake_view', uid: 'DEMO_UID_0002' })
  })
  assert.equal(first.body.code, 0)
  assert.equal(first.body.data.record.spotId, 'spot_lake_view')
  assert.equal(first.body.data.badge.id, 'badge_lake')

  const duplicate = await request('/checkins', {
    method: 'POST',
    visitorId: 'http_visitor',
    body: JSON.stringify({ spotId: 'spot_lake_view', uid: 'DEMO_UID_0002', time: 123 })
  })
  assert.equal(duplicate.body.data.record.time, first.body.data.record.time)
  assert.equal(duplicate.body.data.stats.checked, 1)

  const profile = await request('/profile', { visitorId: 'http_visitor' })
  assert.equal(profile.body.data.checkins.length, 1)
  assert.equal(profile.body.data.checkins[0].spotName, '湖畔观景台')

  const resolved = await request('/nfc/resolve', {
    method: 'POST',
    body: JSON.stringify({ uid: 'DEMO_UID_0003' })
  })
  assert.equal(resolved.body.data.spotId, 'spot_old_street')
  assert.equal(resolved.body.data.activityId, 'act_city_memory_2026')

  const unresolved = await request('/nfc/resolve', {
    method: 'POST',
    body: JSON.stringify({ uid: 'UNKNOWN_UID' })
  })
  assert.equal(unresolved.status, 404)
  assert.equal(unresolved.body.message, '未找到 UID 对应的点位')

  const event = await request('/nfc/events', {
    method: 'POST',
    body: JSON.stringify({ uid: 'DEMO_UID_0004', type: 'tag_read', deviceId: 'reader_01' })
  })
  assert.deepEqual(event.body.data, {
    accepted: true,
    type: 'tag_read',
    deviceId: 'reader_01',
    activityId: 'act_city_memory_2026',
    spotId: 'spot_stone_bridge'
  })
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM device_events WHERE device_id=?').get('reader_01').c, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM devices WHERE device_id=?').get('reader_01').c, 1)

  const admin = await request('/admin/activities')
  assert.equal(admin.status, 501)
  assert.equal(admin.body.code, 501)
})
