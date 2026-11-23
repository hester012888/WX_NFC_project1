// server/tests/d2-content.test.js - D2：活动与点位管理
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-d2-'))
process.env.DB_PATH = path.join(tmpDir, 'd2.db')
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
    method: 'POST',
    body: { username: 'root_admin', password: 'StrongPassw0rd!' }
  })
  adminToken = login.body.data.token
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('D2_活动 CRUD、搜索分页与归档', async () => {
  const created = await request('/admin/activities', {
    method: 'POST',
    adminToken,
    body: {
      name: '秋季文化活动', slogan: '探索秋天', period: '2026.09-11', location: '城区',
      summary: '简介', description: '详细描述', rules: [{ title: '规则一', desc: '说明' }]
    }
  })
  assert.equal(created.body.code, 0)
  const id = created.body.data.id
  assert.ok(id.startsWith('act_'))
  assert.equal(created.body.data.rules[0].title, '规则一')

  const list = await request('/admin/activities?keyword=秋季&page=1&pageSize=10', { adminToken })
  assert.equal(list.body.data.total, 1)
  assert.equal(list.body.data.list[0].id, id)

  const updated = await request('/admin/activities/' + id, {
    method: 'PUT',
    adminToken,
    body: { name: '秋季文化活动（更新）', status: 'draft' }
  })
  assert.equal(updated.body.data.name, '秋季文化活动（更新）')
  assert.equal(updated.body.data.status, 'draft')

  const status = await request('/admin/activities/' + id + '/status', {
    method: 'PATCH', adminToken, body: { status: 'active' }
  })
  assert.equal(status.body.data.status, 'active')

  const archived = await request('/admin/activities/' + id + '/archive', { method: 'POST', adminToken })
  assert.equal(archived.body.data.status, 'archived')
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM points WHERE activity_id = ?').get(id).c, 0)

  const invalid = await request('/admin/activities', {
    method: 'POST', adminToken, body: { name: '' }
  })
  assert.equal(invalid.status, 400)
})

test('D2_点位 CRUD、排序、启停与活动归属校验', async () => {
  const activity = await request('/admin/activities', {
    method: 'POST', adminToken, body: { name: '点位测试活动' }
  })
  const activityId = activity.body.data.id

  const point = await request('/admin/points', {
    method: 'POST',
    adminToken,
    body: {
      activityId, name: '测试点位', subtitle: '副标题', sortOrder: 3,
      latitude: 30.25, longitude: 120.15, badgeId: 'badge_test',
      coverUrl: '', coverTone: 'blue', media: { images: [], video: '', audio: '' }, tags: ['测试']
    }
  })
  assert.equal(point.body.code, 0)
  const pointId = point.body.data.id
  assert.equal(point.body.data.badgeId, 'badge_test')
  assert.equal(point.body.data.media.video, '')

  const updated = await request('/admin/points/' + pointId, {
    method: 'PUT', adminToken, body: { name: '测试点位改', coverTone: 'green' }
  })
  assert.equal(updated.body.data.name, '测试点位改')
  assert.equal(updated.body.data.coverTone, 'green')

  const sorted = await request('/admin/points/' + pointId + '/sort', {
    method: 'POST', adminToken, body: { sortOrder: 9 }
  })
  assert.equal(sorted.body.data.sortOrder, 9)

  const disabled = await request('/admin/points/' + pointId + '/disable', { method: 'POST', adminToken })
  assert.equal(disabled.body.data.status, 'inactive')
  const enabled = await request('/admin/points/' + pointId + '/enable', { method: 'POST', adminToken })
  assert.equal(enabled.body.data.status, 'active')

  const byActivity = await request('/admin/points?activityId=' + activityId, { adminToken })
  assert.equal(byActivity.body.data.total, 1)

  const invalid = await request('/admin/points', {
    method: 'POST', adminToken, body: { activityId: 'act_missing', name: '错误点位' }
  })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.code, 'ACTIVITY_NOT_FOUND')
})

test('D2_小程序读取与打卡记录不受后台停用影响', async () => {
  const guest = await request('/auth/guest', { method: 'POST' })
  const checkin = await request('/checkins', {
    method: 'POST',
    guestToken: guest.body.data.token,
    body: { spotId: 'spot_city_gate' }
  })
  assert.equal(checkin.body.code, 0)

  await request('/admin/points/spot_city_gate/disable', { method: 'POST', adminToken })

  const profile = await request('/profile', { guestToken: guest.body.data.token })
  assert.equal(profile.body.data.checkins.length, 1)

  const home = await request('/home')
  assert.equal(home.body.code, 0)
  const spot = await request('/spots/spot_city_gate')
  assert.equal(spot.status, 404, '停用点位不再出现在小程序公开点位列表')
})

test('D2_操作已写入审计日志', () => {
  const actions = db.prepare('SELECT action FROM admin_operation_logs ORDER BY id').all().map((row) => row.action)
  assert.ok(actions.includes('activity.create'))
  assert.ok(actions.includes('point.create'))
  assert.ok(actions.includes('point.disable'))
})
