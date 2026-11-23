// server/tests/d5-audit.test.js - D5：审计日志、管理员账号管理与事务一致性
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-d5-'))
process.env.DB_PATH = path.join(tmpDir, 'd5.db')
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

function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (options.adminToken) headers.Authorization = 'Bearer ' + options.adminToken
  const init = { method: options.method || 'GET', headers }
  if (options.body) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  return fetch(baseUrl + url, init).then(async (res) => ({ status: res.status, body: await res.json() }))
}

async function adminLogin(username, password) {
  const res = await request('/admin/auth/login', { method: 'POST', body: { username, password } })
  assert.equal(res.body.code, 0)
  return res.body.data.token
}

test.before(async () => {
  server = await new Promise((resolve) => {
    const instance = createApp().listen(0, () => resolve(instance))
  })
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api'
  rootToken = await adminLogin('root_admin', 'StrongPassw0rd!')
  operatorToken = await adminLogin('operator_01', 'OperatorPass1!')
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('D5_日志查询权限与脱敏输出', async () => {
  const forbidden = await request('/admin/operation-logs', { adminToken: operatorToken })
  assert.equal(forbidden.status, 403)
  assert.equal(forbidden.body.code, 'ADMIN_FORBIDDEN')

  await request('/admin/activities', {
    method: 'POST', adminToken: rootToken, body: { name: '审计活动' }
  })
  const logs = await request('/admin/operation-logs?action=activity.create&page=1&pageSize=10', { adminToken: rootToken })
  assert.equal(logs.body.code, 0)
  assert.equal(logs.body.data.total, 1)
  assert.equal(logs.body.data.list[0].action, 'activity.create')
  assert.equal(logs.body.data.list[0].adminUsername, 'root_admin')
  const raw = JSON.stringify(logs.body.data)
  assert.ok(!raw.includes('password_hash'))
  assert.ok(!raw.includes('WX_APPSECRET'))

  const readOnly = await request('/admin/operation-logs', { method: 'POST', adminToken: rootToken })
  assert.equal(readOnly.status, 404)
})

test('D5_管理员创建与禁用记录审计', async () => {
  const created = await request('/admin/admins', {
    method: 'POST',
    adminToken: rootToken,
    body: { username: 'new_operator', password: 'NewOperatorPass1!', displayName: '新运营', role: 'operator' }
  })
  assert.equal(created.body.code, 0)
  assert.equal(created.body.data.passwordHash, undefined)

  const newToken = await adminLogin('new_operator', 'NewOperatorPass1!')
  const me = await request('/admin/auth/me', { adminToken: newToken })
  assert.equal(me.body.data.username, 'new_operator')

  const id = created.body.data.id
  const disabled = await request('/admin/admins/' + id + '/status', {
    method: 'PATCH', adminToken: rootToken, body: { status: 'disabled' }
  })
  assert.equal(disabled.body.data.status, 'disabled')
  const expired = await request('/admin/auth/me', { adminToken: newToken })
  assert.equal(expired.status, 401)

  const self = await request('/admin/admins/1/status', {
    method: 'PATCH', adminToken: rootToken, body: { status: 'disabled' }
  })
  assert.equal(self.status, 403)

  const actions = db.prepare('SELECT action FROM admin_operation_logs ORDER BY id').all().map((row) => row.action)
  assert.ok(actions.includes('admin.create'))
  assert.ok(actions.includes('admin.disable'))
})

test('D5_业务失败不产生成功日志', async () => {
  const before = db.prepare("SELECT COUNT(*) AS c FROM admin_operation_logs WHERE action = 'nfc_tag.bind'").get().c

  const invalid = await request('/admin/nfc-tags/DEMO_UID_0001/bind', {
    method: 'POST',
    adminToken: rootToken,
    body: { activityId: 'act_city_memory_2026', pointId: 'spot_missing' }
  })
  assert.equal(invalid.status, 404)

  const duplicate = await request('/admin/nfc-tags', {
    method: 'POST', adminToken: rootToken, body: { uid: 'DEMO_UID_0001' }
  })
  assert.equal(duplicate.status, 409)

  const after = db.prepare("SELECT COUNT(*) AS c FROM admin_operation_logs WHERE action = 'nfc_tag.bind'").get().c
  assert.equal(after, before)
  const createLogs = db.prepare("SELECT after_json FROM admin_operation_logs WHERE action = 'nfc_tag.create'").all()
  assert.ok(!JSON.stringify(createLogs).includes('DEMO_UID_0001'))
})
