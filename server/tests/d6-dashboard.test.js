// server/tests/d6-dashboard.test.js - D6：Web 管理后台静态资源与真实 API 接入
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-d6-'))
process.env.DB_PATH = path.join(tmpDir, 'd6.db')
process.env.NODE_ENV = 'development'
process.env.WX_AUTH_MODE = 'mock'

const { openDb, setDb, closeDb } = require('../src/db')
const { migrate } = require('../src/migrate')
const seed = require('../src/seed')
const { createApp } = require('../src/app')
const { initializeAdmin } = require('../src/admin-init')

const db = openDb(process.env.DB_PATH)
setDb(db)
migrate(db)
seed(db)
initializeAdmin({ username: 'root_admin', password: 'StrongPassw0rd!', role: 'super_admin', db })

const adminDir = path.join(__dirname, '..', 'admin')
const indexHtml = fs.readFileSync(path.join(adminDir, 'index.html'), 'utf8')
const appJs = fs.readFileSync(path.join(adminDir, 'app.js'), 'utf8')
const stylesCss = fs.readFileSync(path.join(adminDir, 'styles.css'), 'utf8')

let server
let rootUrl

test.before(async () => {
  server = await new Promise((resolve) => {
    const instance = createApp().listen(0, () => resolve(instance))
  })
  rootUrl = 'http://127.0.0.1:' + server.address().port
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('D6_后台静态页面可匿名访问且资源完整', async () => {
  const page = await fetch(rootUrl + '/admin/')
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type') || '', /text\/html/)
  const html = await page.text()
  assert.ok(html.includes('NFC 文旅管理后台'))
  assert.ok(html.includes('id="login-view"'))
  assert.ok(html.includes('src="./app.js"'))

  const script = await fetch(rootUrl + '/admin/app.js')
  assert.equal(script.status, 200)
  assert.match(script.headers.get('content-type') || '', /javascript/)
  assert.equal(await script.text(), appJs)

  const style = await fetch(rootUrl + '/admin/styles.css')
  assert.equal(style.status, 200)
  assert.match(style.headers.get('content-type') || '', /css/)
  assert.equal(await style.text(), stylesCss)
})

test('D6_前端脚本语法正确且只调用真实后端接口', () => {
  assert.doesNotThrow(() => new Function(appJs))
  assert.ok(appJs.includes("var API_BASE = '/api/admin'"))
  assert.ok(appJs.includes('fetch('))
  assert.ok(appJs.includes('/auth/login'))
  assert.ok(appJs.includes('/operation-logs'))
  assert.ok(!appJs.includes('/mock/'))
  assert.ok(!appJs.includes('root_admin'))
  assert.ok(!appJs.includes('StrongPassw0rd!'))
  assert.ok(!appJs.includes('DEMO_UID'))
})

test('D6_静态页面不绕过管理接口鉴权', async () => {
  const missing = await fetch(rootUrl + '/api/admin/activities')
  assert.equal(missing.status, 401)
  const body = await missing.json()
  assert.equal(body.code, 'ADMIN_LOGIN_REQUIRED')

  const login = await fetch(rootUrl + '/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'root_admin', password: 'StrongPassw0rd!' })
  })
  assert.equal(login.status, 200)
  const token = (await login.json()).data.token

  const allowed = await fetch(rootUrl + '/api/admin/activities', {
    headers: { Authorization: 'Bearer ' + token }
  })
  assert.equal(allowed.status, 200)
  assert.equal((await allowed.json()).code, 0)
})
