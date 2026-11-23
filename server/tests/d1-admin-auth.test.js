// server/tests/d1-admin-auth.test.js - D1：独立管理员认证与角色隔离
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-d1-'))
process.env.DB_PATH = path.join(tmpDir, 'd1.db')
process.env.NODE_ENV = 'development'
process.env.WX_AUTH_MODE = 'mock'

const { openDb, setDb, closeDb } = require('../src/db')
const { migrate } = require('../src/migrate')
const seed = require('../src/seed')
const { createApp } = require('../src/app')
const { initializeAdmin } = require('../src/admin-init')
const { hashToken } = require('../src/admin-auth')

let db = openDb(process.env.DB_PATH)
setDb(db)
migrate(db)
seed(db)
initializeAdmin({ username: 'root_admin', password: 'StrongPassw0rd!', role: 'super_admin', displayName: '超级管理员', db })

let server
let baseUrl

function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.adminToken ? { Authorization: 'Bearer ' + options.adminToken } : {}),
    ...(options.headers || {})
  }
  const init = { method: options.method || 'GET', headers }
  if (options.body) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  return fetch(baseUrl + url, init).then(async (res) => ({ status: res.status, body: await res.json() }))
}

test.before(async () => {
  server = await new Promise((resolve) => {
    const instance = createApp().listen(0, () => resolve(instance))
  })
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api'
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('D1_迁移建表、密码哈希与一次性初始化', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name)
  ;['admins', 'admin_sessions', 'admin_operation_logs'].forEach((name) => assert.ok(tables.includes(name)))

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get('root_admin')
  assert.notEqual(admin.password_hash, 'StrongPassw0rd!')
  assert.ok(admin.password_hash.startsWith('$2'))
  assert.equal(admin.password_hash.length, 60)
  assert.throws(() => initializeAdmin({
    username: 'second_admin', password: 'AnotherStrong1!', db
  }), /已存在/)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM admins').get().c, 1)
})

test('D1_管理员登录、身份查询、续期与登出', async () => {
  const bad = await request('/admin/auth/login', {
    method: 'POST',
    body: { username: 'root_admin', password: 'wrong-password' }
  })
  assert.equal(bad.status, 401)
  assert.equal(bad.body.code, 'ADMIN_INVALID_CREDENTIALS')

  const login = await request('/admin/auth/login', {
    method: 'POST',
    body: { username: 'root_admin', password: 'StrongPassw0rd!' }
  })
  assert.equal(login.body.code, 0)
  assert.equal(login.body.data.admin.role, 'super_admin')
  assert.equal(login.body.data.admin.passwordHash, undefined)
  const token = login.body.data.token

  const stored = db.prepare('SELECT token_hash FROM admin_sessions ORDER BY id DESC LIMIT 1').get()
  assert.equal(stored.token_hash, hashToken(token))
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM admin_sessions WHERE token_hash = ?').get(token).c, 0)

  const me = await request('/admin/auth/me', { adminToken: token })
  assert.equal(me.body.data.username, 'root_admin')

  const refreshed = await request('/admin/auth/refresh', { method: 'POST', adminToken: token })
  assert.equal(refreshed.body.code, 0)
  const oldMe = await request('/admin/auth/me', { adminToken: token })
  assert.equal(oldMe.status, 401)
  assert.equal(oldMe.body.code, 'ADMIN_LOGIN_EXPIRED')

  const logout = await request('/admin/auth/logout', { method: 'POST', adminToken: refreshed.body.data.token })
  assert.equal(logout.body.code, 0)
  const afterLogout = await request('/admin/auth/me', { adminToken: refreshed.body.data.token })
  assert.equal(afterLogout.status, 401)
})

test('D1_普通身份与无令牌不能访问管理接口', async () => {
  const anonymous = await request('/admin/admins')
  assert.equal(anonymous.status, 401)
  assert.equal(anonymous.body.code, 'ADMIN_LOGIN_REQUIRED')

  const guest = await request('/auth/guest', { method: 'POST' })
  const asUserToken = await request('/admin/admins', { adminToken: guest.body.data.token })
  assert.equal(asUserToken.status, 401)

  const login = await request('/auth/login', { method: 'POST', body: { code: 'D1_USER#1' } })
  const asWechatUser = await request('/admin/admins', { adminToken: login.body.data.token })
  assert.equal(asWechatUser.status, 401)
})

test('D1_operator 权限限制与禁用后立即失效', async () => {
  const bcrypt = require('bcryptjs')
  const now = Date.now()
  db.prepare(`
    INSERT INTO admins (username, password_hash, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, 'operator', 'active', ?, ?)
  `).run('operator_01', bcrypt.hashSync('OperatorPass1!', 10), '运营', now, now)

  const login = await request('/admin/auth/login', {
    method: 'POST',
    body: { username: 'operator_01', password: 'OperatorPass1!' }
  })
  assert.equal(login.body.data.admin.role, 'operator')

  const forbidden = await request('/admin/admins', { adminToken: login.body.data.token })
  assert.equal(forbidden.status, 403)
  assert.equal(forbidden.body.code, 'ADMIN_FORBIDDEN')

  const root = await request('/admin/auth/login', {
    method: 'POST',
    body: { username: 'root_admin', password: 'StrongPassw0rd!' }
  })
  const admins = await request('/admin/admins', { adminToken: root.body.data.token })
  assert.equal(admins.body.data.length, 2)
  assert.equal(admins.body.data[0].password_hash, undefined)

  db.prepare("UPDATE admins SET status = 'disabled' WHERE username = 'operator_01'").run()
  const disabled = await request('/admin/auth/me', { adminToken: login.body.data.token })
  assert.equal(disabled.status, 401)
})
