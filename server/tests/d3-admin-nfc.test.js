// server/tests/d3-admin-nfc.test.js - D3：管理员 UID 管理与原有逻辑复用
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-d3-'))
process.env.DB_PATH = path.join(tmpDir, 'd3.db')
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

let server
let baseUrl
let adminToken

function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (options.adminToken) headers.Authorization = 'Bearer ' + options.adminToken
  if (options.guestToken) headers['X-Guest-Token'] = options.guestToken
  if (options.headers) Object.assign(headers, options.headers)
  const init = { method: options.method || 'GET', headers }
  if (options.body) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  return fetch(baseUrl + url, init).then(async (res) => ({ status: res.status, body: await res.json() }))
}

test.before(async () => {
  server = await new Promise((resolve) => {
    const instance = createApp().listen(0, () => resolve(instance))
  })
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api'
  const login = await request('/admin/auth/login', {
    method: 'POST', body: { username: 'root_admin', password: 'StrongPassw0rd!' }
  })
  adminToken = login.body.data.token
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('D3_管理员 UID 新增、重复检查与非法 UID', async () => {
  const created = await request('/admin/nfc-tags', {
    method: 'POST', adminToken, body: { uid: ' admin_uid_0001 ' }
  })
  assert.equal(created.body.code, 0)
  assert.equal(created.body.data.uid, 'ADMIN_UID_0001')
  assert.equal(created.body.data.status, 'unbound')

  const duplicate = await request('/admin/nfc-tags', {
    method: 'POST', adminToken, body: { uid: 'admin_uid_0001' }
  })
  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.message, 'UID 已存在')

  const checked = await request('/admin/nfc-tags/check?uid=admin_uid_0001', { adminToken })
  assert.equal(checked.body.data.exists, true)

  const invalid = await request('/admin/nfc-tags', {
    method: 'POST', adminToken, body: { uid: 'UID@BAD' }
  })
  assert.equal(invalid.status, 400)
})

test('D3_绑定、解绑、改绑与 RUK 事件解析', async () => {
  const bound = await request('/admin/nfc-tags/ADMIN_UID_0001/bind', {
    method: 'POST', adminToken,
    body: { activityId: 'act_city_memory_2026', pointId: 'spot_city_gate' }
  })
  assert.equal(bound.body.data.status, 'active')

  const duplicateBind = await request('/admin/nfc-tags/ADMIN_UID_0001/bind', {
    method: 'POST', adminToken,
    body: { activityId: 'act_city_memory_2026', pointId: 'spot_city_gate' }
  })
  assert.equal(duplicateBind.status, 409)

  const byActivity = await request('/admin/nfc-tags?activityId=act_city_memory_2026', { adminToken })
  assert.ok(byActivity.body.data.list.some((tag) => tag.uid === 'ADMIN_UID_0001'))
  const byPoint = await request('/admin/nfc-tags?pointId=spot_city_gate', { adminToken })
  assert.ok(byPoint.body.data.list.some((tag) => tag.uid === 'ADMIN_UID_0001'))

  const unbound = await request('/admin/nfc-tags/ADMIN_UID_0001/unbind', { method: 'POST', adminToken })
  assert.equal(unbound.body.data.status, 'unbound')
  const unresolved = await request('/nfc/resolve', {
    method: 'POST', body: { uid: 'ADMIN_UID_0001' }
  })
  assert.equal(unresolved.status, 404)

  const changed = await request('/admin/nfc-tags/ADMIN_UID_0001/point', {
    method: 'PUT', adminToken,
    body: { activityId: 'act_city_memory_2026', pointId: 'spot_lake_view' }
  })
  assert.equal(changed.body.data.pointId, 'spot_lake_view')

  const resolved = await request('/nfc/resolve', {
    method: 'POST', body: { uid: 'admin_uid_0001' }
  })
  assert.equal(resolved.body.data.spotId, 'spot_lake_view')

  const event = await request('/nfc/events', {
    method: 'POST', body: { uid: 'ADMIN_UID_0001', deviceId: 'd3_reader' }
  })
  assert.equal(event.body.data.spotId, 'spot_lake_view')
})

test('D3_普通身份不能调用管理 UID 接口', async () => {
  const guest = await request('/auth/guest', { method: 'POST' })
  const asGuest = await request('/admin/nfc-tags', { guestToken: guest.body.data.token })
  assert.equal(asGuest.status, 401)

  const user = await request('/auth/login', { method: 'POST', body: { code: 'D3_USER#1' } })
  const asUser = await request('/admin/nfc-tags', {
    headers: { Authorization: 'Bearer ' + user.body.data.token }
  })
  assert.equal(asUser.status, 401)

  const anonymous = await request('/admin/nfc-tags')
  assert.equal(anonymous.status, 401)
})

test('D3_旧 UID 管理与业务约束保持不变', async () => {
  const oldCreate = await request('/nfc/tags', {
    method: 'POST', body: { uid: 'OLD_PATH_UID_1' }
  })
  assert.equal(oldCreate.body.code, 0)

  const oldBind = await request('/nfc/tags/OLD_PATH_UID_1/bind', {
    method: 'POST',
    body: { activityId: 'act_city_memory_2026', pointId: 'spot_old_street' }
  })
  assert.equal(oldBind.body.data.status, 'active')

  const actions = db.prepare('SELECT action FROM admin_operation_logs ORDER BY id').all().map((row) => row.action)
  ;['nfc_tag.create', 'nfc_tag.bind', 'nfc_tag.unbind', 'nfc_tag.rebind'].forEach((action) => {
    assert.ok(actions.includes(action), `缺少审计动作 ${action}`)
  })
})
