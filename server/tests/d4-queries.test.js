// server/tests/d4-queries.test.js - D4：用户、打卡、设备与事件只读查询
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-d4-'))
process.env.DB_PATH = path.join(tmpDir, 'd4.db')
process.env.NODE_ENV = 'development'
process.env.WX_AUTH_MODE = 'mock'

const { openDb, setDb, closeDb } = require('../src/db')
const { migrate } = require('../src/migrate')
const seed = require('../src/seed')
const { createApp } = require('../src/app')
const { initializeAdmin } = require('../src/admin-init')

let db = openDb(process.env.DB_PATH)
setDb(db)
migrate(db)
seed(db)
initializeAdmin({ username: 'root_admin', password: 'StrongPassw0rd!', role: 'super_admin', db })
const bcrypt = require('bcryptjs')
db.prepare(`
  INSERT INTO admins (username, password_hash, display_name, role, status, created_at, updated_at)
  VALUES (?, ?, ?, 'operator', 'active', ?, ?)
`).run('operator_01', bcrypt.hashSync('OperatorPass1!', 10), '运营', Date.now(), Date.now())

let server
let baseUrl
let rootToken
let operatorToken
let guestVisitorId
let wechatVisitorId

function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (options.adminToken) headers.Authorization = 'Bearer ' + options.adminToken
  if (options.guestToken) headers['X-Guest-Token'] = options.guestToken
  if (options.loginToken) headers.Authorization = 'Bearer ' + options.loginToken
  const init = { method: options.method || 'GET', headers }
  if (options.body) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  return fetch(baseUrl + url, init).then(async (res) => ({ status: res.status, body: await res.json() }))
}

async function adminLogin(username, password) {
  const res = await request('/admin/auth/login', { method: 'POST', body: { username, password } })
  return res.body.data.token
}

test.before(async () => {
  server = await new Promise((resolve) => {
    const instance = createApp().listen(0, () => resolve(instance))
  })
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api'
  rootToken = await adminLogin('root_admin', 'StrongPassw0rd!')
  operatorToken = await adminLogin('operator_01', 'OperatorPass1!')

  const guest = await request('/auth/guest', { method: 'POST' })
  guestVisitorId = guest.body.data.visitorId
  await request('/checkins', {
    method: 'POST', guestToken: guest.body.data.token, body: { spotId: 'spot_city_gate' }
  })

  const wechat = await request('/auth/login', { method: 'POST', body: { code: 'D4_USER#1' } })
  wechatVisitorId = wechat.body.data.visitorId
  await request('/checkins', {
    method: 'POST', loginToken: wechat.body.data.token, body: { spotId: 'spot_lake_view' }
  })

  await request('/nfc/events', {
    method: 'POST', body: { uid: 'DEMO_UID_0003', deviceId: 'd4_reader' }
  })

  const now = Date.now()
  db.prepare(`
    INSERT INTO users (visitor_id, status, merged_into, created_at, updated_at)
    VALUES (?, 'disabled', ?, ?, ?)
  `).run('v_merged_old', wechatVisitorId, now, now)
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('D4_用户查询、类型区分与 openid 脱敏', async () => {
  const rootList = await request('/admin/users?page=1&pageSize=50', { adminToken: rootToken })
  assert.equal(rootList.body.code, 0)
  assert.ok(rootList.body.data.total >= 3)
  const wechat = rootList.body.data.list.find((user) => user.visitorId === wechatVisitorId)
  assert.equal(wechat.userType, 'wechat')
  assert.ok(wechat.openid.startsWith('mock_oid_'))
  assert.equal(wechat.token, undefined)
  assert.equal(wechat.tokenHash, undefined)

  const operatorList = await request('/admin/users?page=1&pageSize=50', { adminToken: operatorToken })
  const masked = operatorList.body.data.list.find((user) => user.visitorId === wechatVisitorId)
  assert.ok(masked.openid.includes('***'))
  assert.notEqual(masked.openid, wechat.openid)

  const guestList = await request('/admin/users?type=guest', { adminToken: rootToken })
  assert.ok(guestList.body.data.list.some((user) => user.visitorId === guestVisitorId))

  const detail = await request('/admin/users/' + guestVisitorId, { adminToken: rootToken })
  assert.equal(detail.body.data.checkins.length, 1)
  const merged = await request('/admin/users/v_merged_old', { adminToken: rootToken })
  assert.equal(merged.body.data.mergedInto, wechatVisitorId)
  assert.equal(merged.body.data.status, 'disabled')
})

test('D4_打卡记录筛选与分页', async () => {
  const all = await request('/admin/checkins?page=1&pageSize=1', { adminToken: rootToken })
  assert.equal(all.body.data.list.length, 1)
  assert.equal(all.body.data.total, 2)

  const byVisitor = await request('/admin/checkins?visitorId=' + guestVisitorId, { adminToken: rootToken })
  assert.equal(byVisitor.body.data.total, 1)
  assert.equal(byVisitor.body.data.list[0].pointName, '古城门遗址')

  const byActivity = await request('/admin/checkins?activityId=act_city_memory_2026&valid=valid', { adminToken: operatorToken })
  assert.equal(byActivity.body.data.total, 2)

  const byPoint = await request('/admin/checkins?pointId=spot_lake_view', { adminToken: rootToken })
  assert.equal(byPoint.body.data.total, 1)

  const future = Date.now() + 100000
  const empty = await request('/admin/checkins?from=' + future, { adminToken: rootToken })
  assert.equal(empty.body.data.total, 0)

  assert.equal(byVisitor.body.data.list[0].password, undefined)
})

test('D4_设备与设备事件查询', async () => {
  const devices = await request('/admin/devices?page=1&pageSize=20', { adminToken: rootToken })
  assert.ok(devices.body.data.list.some((device) => device.deviceId === 'd4_reader'))

  const detail = await request('/admin/devices/d4_reader', { adminToken: operatorToken })
  assert.equal(detail.body.data.deviceId, 'd4_reader')

  const events = await request('/admin/device-events?uid=DEMO_UID_0003&resolved=1', { adminToken: rootToken })
  assert.equal(events.body.data.total, 1)
  assert.equal(events.body.data.list[0].pointId, 'spot_old_street')
  assert.equal(events.body.data.list[0].payload, undefined)

  const byDevice = await request('/admin/device-events?deviceId=d4_reader', { adminToken: operatorToken })
  assert.equal(byDevice.body.data.total, 1)

  const unresolved = await request('/admin/device-events?resolved=0', { adminToken: rootToken })
  assert.equal(unresolved.body.data.total, 0)
})

test('D4_权限隔离与 RUK 接口回归', async () => {
  const anonymous = await request('/admin/users')
  assert.equal(anonymous.status, 401)

  const guest = await request('/auth/guest', { method: 'POST' })
  const asGuest = await request('/admin/checkins', { guestToken: guest.body.data.token })
  assert.equal(asGuest.status, 401)

  const event = await request('/nfc/events', {
    method: 'POST', body: { uid: 'DEMO_UID_0005', deviceId: 'd4_reader_2' }
  })
  assert.equal(event.body.data.spotId, 'spot_city_museum')
})
