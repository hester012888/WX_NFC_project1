// server/tests/module-c.test.js - 模块 C：游客凭证、微信登录、账号合并与回归
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-module-c-'))
process.env.DB_PATH = path.join(tmpDir, 'module-c.db')
process.env.NODE_ENV = 'development'
process.env.WX_AUTH_MODE = 'mock'

const { openDb, setDb, closeDb } = require('../src/db')
const { migrate } = require('../src/migrate')
const seed = require('../src/seed')
const { createApp, initialize } = require('../src/app')
const repository = require('../src/repository')
const config = require('../src/config')
const { isTrustedAddress, requireTrustedSource } = require('../src/trusted-source')

let db = openDb(process.env.DB_PATH)
setDb(db)
migrate(db)
seed(db)

let server
let baseUrl

function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.visitorId ? { 'X-Visitor-Id': options.visitorId } : {}),
    ...(options.guestToken ? { 'X-Guest-Token': options.guestToken } : {}),
    ...(options.loginToken ? { Authorization: 'Bearer ' + options.loginToken } : {}),
    ...(options.headers || {})
  }
  const init = { method: options.method || 'GET', headers }
  if (options.body) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  return fetch(baseUrl + url, init).then(async (res) => ({ status: res.status, body: await res.json() }))
}

async function newGuest() {
  const res = await request('/auth/guest', { method: 'POST' })
  assert.equal(res.body.code, 0)
  return res.body.data
}

async function checkin(token, spotId) {
  return request('/checkins', {
    method: 'POST',
    guestToken: token,
    body: { spotId, uid: '' }
  })
}

test.before(async () => {
  initialize()
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

test('S1_游客凭证签发与匿名身份隔离', async () => {
  const anonymousProfile = await request('/profile')
  assert.equal(anonymousProfile.body.data.visitorId, '')
  assert.deepEqual(anonymousProfile.body.data.checkins, [])

  const anonymousCheckin = await request('/checkins', {
    method: 'POST',
    body: { spotId: 'spot_city_gate' }
  })
  assert.equal(anonymousCheckin.status, 401)
  assert.equal(anonymousCheckin.body.code, 401)

  const guest = await newGuest()
  assert.ok(guest.token)
  assert.ok(guest.visitorId.startsWith('v_'))
  assert.equal(guest.tokenType, 'guest')

  const guestProfile = await request('/profile', { guestToken: guest.token })
  assert.equal(guestProfile.body.data.visitorId, guest.visitorId)

  const done = await checkin(guest.token, 'spot_city_gate')
  assert.equal(done.body.code, 0)
  const after = await request('/profile', { guestToken: guest.token })
  assert.equal(after.body.data.checkins.length, 1)

  const other = await newGuest()
  const otherProfile = await request('/profile', { guestToken: other.token })
  assert.deepEqual(otherProfile.body.data.checkins, [])
})

test('S1_X-Visitor-Id 请求头不能冒充他人身份', async () => {
  const owner = await newGuest()
  const attacker = await newGuest()
  await checkin(owner.token, 'spot_lake_view')

  const forged = await request('/checkins', {
    method: 'POST',
    guestToken: owner.token,
    visitorId: attacker.visitorId,
    body: { spotId: 'spot_old_street' }
  })
  assert.equal(forged.body.code, 0)

  const ownerProfile = await request('/profile', { guestToken: owner.token })
  assert.equal(ownerProfile.body.data.checkins.length, 2)
  const attackerProfile = await request('/profile', { guestToken: attacker.token })
  assert.equal(attackerProfile.body.data.checkins.length, 0)
})

test('S1_游客令牌续期撤销旧令牌', async () => {
  const guest = await newGuest()
  const refreshed = await request('/auth/guest/refresh', {
    method: 'POST',
    guestToken: guest.token
  })
  assert.equal(refreshed.body.code, 0)
  assert.notEqual(refreshed.body.data.token, guest.token)
  assert.equal(refreshed.body.data.visitorId, guest.visitorId)

  const oldToken = await request('/profile', { guestToken: guest.token })
  assert.equal(oldToken.status, 401)
  assert.equal(oldToken.body.code, 'GUEST_INVALID')

  const oldRefresh = await request('/auth/guest/refresh', { method: 'POST', guestToken: guest.token })
  assert.equal(oldRefresh.status, 401)

  const newToken = await request('/profile', { guestToken: refreshed.body.data.token })
  assert.equal(newToken.body.code, 0)

  const missing = await request('/auth/guest/refresh', { method: 'POST' })
  assert.equal(missing.status, 401)
})

test('S2_mock 登录签发登录令牌并绑定 openid', async () => {
  const guest = await newGuest()
  const login = await request('/auth/login', {
    method: 'POST',
    guestToken: guest.token,
    body: { code: 'ALICE#1' }
  })
  assert.equal(login.body.code, 0)
  assert.equal(login.body.data.tokenType, 'login')
  assert.equal(login.body.data.visitorId, guest.visitorId)

  const me = await request('/auth/me', { loginToken: login.body.data.token })
  assert.equal(me.body.data.loggedIn, true)
  assert.ok(me.body.data.openidMasked.includes('***'))

  const row = db.prepare('SELECT openid FROM users WHERE visitor_id = ?').get(guest.visitorId)
  assert.ok(row.openid.startsWith('mock_oid_'))

  const oldGuest = await request('/profile', { guestToken: guest.token })
  assert.equal(oldGuest.status, 401)
})

test('S2_重复登录复用账号且不信任客户端 openid', async () => {
  const first = await request('/auth/login', { method: 'POST', body: { code: 'BOB#1' } })
  const second = await request('/auth/login', { method: 'POST', body: { code: 'BOB#2' } })
  assert.equal(second.body.data.visitorId, first.body.data.visitorId)

  const row = db.prepare('SELECT openid FROM users WHERE visitor_id = ?').get(first.body.data.visitorId)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users WHERE openid = ?').get(row.openid).c, 1)

  const forged = await request('/auth/login', {
    method: 'POST',
    body: { code: 'CAROL#1', openid: 'FAKE_OPENID' }
  })
  const forgedRow = db.prepare('SELECT openid FROM users WHERE visitor_id = ?').get(forged.body.data.visitorId)
  assert.notEqual(forgedRow.openid, 'FAKE_OPENID')
})

test('S2_登录错误码、续期与登出', async () => {
  const invalid = await request('/auth/login', { method: 'POST', body: { code: 'MOCK_ERR_40029' } })
  assert.equal(invalid.status, 401)
  assert.equal(invalid.body.code, 'WX_CODE_INVALID')

  const limited = await request('/auth/login', { method: 'POST', body: { code: 'MOCK_ERR_45011' } })
  assert.equal(limited.status, 429)

  const login = await request('/auth/login', { method: 'POST', body: { code: 'DAVE#1' } })
  const refreshed = await request('/auth/refresh', {
    method: 'POST',
    loginToken: login.body.data.token
  })
  assert.equal(refreshed.body.code, 0)
  assert.equal(refreshed.body.data.visitorId, login.body.data.visitorId)

  const oldToken = await request('/auth/me', { loginToken: login.body.data.token })
  assert.equal(oldToken.status, 401)
  assert.equal(oldToken.body.code, 'LOGIN_EXPIRED')

  const logout = await request('/auth/logout', { method: 'POST', loginToken: refreshed.body.data.token })
  assert.equal(logout.body.code, 0)
  const afterLogout = await request('/auth/me', { loginToken: refreshed.body.data.token })
  assert.equal(afterLogout.status, 401)
})

test('S2_无效令牌一律 401 且不回退到请求头', async () => {
  const badLogin = await request('/health', { headers: { Authorization: 'Bearer invalid-token' } })
  assert.equal(badLogin.status, 401)
  assert.equal(badLogin.body.code, 'LOGIN_EXPIRED')

  const badGuest = await request('/home', { headers: { 'X-Guest-Token': 'invalid-guest' } })
  assert.equal(badGuest.status, 401)
  assert.equal(badGuest.body.code, 'GUEST_INVALID')

  const malformed = await request('/health', { headers: { Authorization: 'Basic abc' } })
  assert.equal(malformed.status, 401)

  const guest = await newGuest()
  const mixed = await request('/profile', {
    guestToken: guest.token,
    headers: { Authorization: 'Bearer invalid-token' },
    visitorId: guest.visitorId
  })
  assert.equal(mixed.status, 401)
})

test('S3_已验证游客凭证参与合并并保留打卡', async () => {
  const targetLogin = await request('/auth/login', { method: 'POST', body: { code: 'MERGE#1' } })
  const targetVisitor = targetLogin.body.data.visitorId
  await request('/checkins', {
    method: 'POST',
    loginToken: targetLogin.body.data.token,
    body: { spotId: 'spot_city_gate' }
  })

  const guest = await newGuest()
  const sourceVisitor = guest.visitorId
  await checkin(guest.token, 'spot_city_gate')
  await checkin(guest.token, 'spot_lake_view')

  const merged = await request('/auth/login', {
    method: 'POST',
    guestToken: guest.token,
    body: { code: 'MERGE#2' }
  })
  assert.equal(merged.body.data.visitorId, targetVisitor)

  const profile = await request('/profile', { loginToken: merged.body.data.token })
  assert.equal(profile.body.data.checkins.length, 2)
  assert.equal(profile.body.data.stats.checked, 2)

  const source = db.prepare('SELECT status, merged_into FROM users WHERE visitor_id = ?').get(sourceVisitor)
  assert.equal(source.status, 'disabled')
  assert.equal(source.merged_into, targetVisitor)

  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM checkin_records WHERE visitor_id = ? AND is_valid = 1').get(sourceVisitor).c, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM checkin_records WHERE visitor_id = ? AND is_valid = 1').get(targetVisitor).c, 2)

  const revoked = await request('/profile', { guestToken: guest.token })
  assert.equal(revoked.status, 401)

  assert.throws(() => repository.addCheckin(sourceVisitor, { spotId: 'spot_old_street' }), /身份/)
})

test('S3_请求头指向其他账号时不合并历史数据', async () => {
  const target = await request('/auth/login', { method: 'POST', body: { code: 'HDR#1' } })
  const victimGuest = await newGuest()
  await checkin(victimGuest.token, 'spot_stone_bridge')

  const freshGuest = await newGuest()
  const login = await request('/auth/login', {
    method: 'POST',
    guestToken: freshGuest.token,
    visitorId: victimGuest.visitorId,
    body: { code: 'HDR#2' }
  })
  assert.equal(login.body.data.visitorId, target.body.data.visitorId)

  const targetProfile = await request('/profile', { loginToken: login.body.data.token })
  assert.equal(targetProfile.body.data.checkins.length, 0)
  const victimProfile = await request('/profile', { guestToken: victimGuest.token })
  assert.equal(victimProfile.body.data.checkins.length, 1)
  assert.equal(db.prepare('SELECT merged_into FROM users WHERE visitor_id = ?').get(victimGuest.visitorId).merged_into, null)
})

test('S4_原有 API、RUK 事件与 UID 管理保护回归', async () => {
  const health = await request('/health')
  assert.equal(health.body.data.status, 'up')

  const home = await request('/home')
  assert.equal(home.body.code, 0)
  const activity = await request('/activities/act_city_memory_2026')
  assert.equal(activity.body.data.spots.length, 6)
  const spot = await request('/spots/spot_city_gate')
  assert.equal(spot.body.code, 0)
  const map = await request('/map')
  assert.equal(map.body.data.spots.length, 6)
  const badges = await request('/badges')
  assert.equal(badges.body.data.length, 6)
  const media = await request('/media')
  assert.deepEqual(media.body.data, [])

  const resolved = await request('/nfc/resolve', {
    method: 'POST',
    body: { uid: 'DEMO_UID_0003' }
  })
  assert.equal(resolved.body.data.spotId, 'spot_old_street')

  const event = await request('/nfc/events', {
    method: 'POST',
    body: { uid: 'DEMO_UID_0004', deviceId: 'ruk_final' }
  })
  assert.deepEqual(event.body.data, {
    accepted: true,
    type: 'tag_read',
    deviceId: 'ruk_final',
    activityId: 'act_city_memory_2026',
    spotId: 'spot_stone_bridge'
  })

  const tags = await request('/nfc/tags')
  assert.equal(tags.body.code, 0)

  const admin = await request('/admin/activities')
  assert.equal(admin.status, 401)

  assert.equal(isTrustedAddress('127.0.0.1'), true)
  assert.equal(isTrustedAddress('10.0.0.8'), true)
  assert.equal(isTrustedAddress('8.8.8.8'), false)

  let status = 0
  const res = { status(code) { status = code; return this }, json() { return this } }
  let nextCalled = false
  requireTrustedSource({ headers: {}, socket: { remoteAddress: '8.8.8.8' } }, res, () => { nextCalled = true })
  assert.equal(status, 403)
  assert.equal(nextCalled, false)

  const savedToken = config.nfcAdminToken
  config.nfcAdminToken = 'internal-token'
  requireTrustedSource(
    { headers: { 'x-admin-token': 'internal-token' }, socket: { remoteAddress: '8.8.8.8' } },
    res,
    () => { nextCalled = true }
  )
  assert.equal(nextCalled, true)
  config.nfcAdminToken = savedToken
})
