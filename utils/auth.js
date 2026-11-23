// utils/auth.js - 游客凭证与微信登录状态管理（前端不保存 openid 与 AppSecret）
const config = require('../config/api.config')
const session = require('./session')

const GUEST_KEY = 'nfc_tour_guest_token'
const LOGIN_KEY = 'nfc_tour_login_token'

function getGuestToken() {
  return wx.getStorageSync(GUEST_KEY) || ''
}

function getLoginToken() {
  return wx.getStorageSync(LOGIN_KEY) || ''
}

function setGuestToken(token) {
  wx.setStorageSync(GUEST_KEY, token)
}

function setLoginToken(token) {
  wx.setStorageSync(LOGIN_KEY, token)
}

function clearGuestToken() {
  wx.removeStorageSync(GUEST_KEY)
}

function clearLoginToken() {
  wx.removeStorageSync(LOGIN_KEY)
}

function clearAll() {
  clearGuestToken()
  clearLoginToken()
}

// 认证接口使用独立请求，避免与 utils/request.js 形成循环依赖
function rawRequest(options) {
  const { url, method = 'POST', data = {}, header = {} } = options
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.baseUrl + url,
      method,
      data,
      header: { 'Content-Type': 'application/json', ...header },
      timeout: config.timeout,
      success(res) {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data)
        } else {
          reject(new Error((body && body.message) || `请求失败（${res.statusCode}）`))
        }
      },
      fail: reject
    })
  })
}

function ensureGuest() {
  if (getLoginToken() || getGuestToken()) return Promise.resolve(null)
  return rawRequest({ url: '/auth/guest' }).then((data) => {
    setGuestToken(data.token)
    session.setVisitorId(data.visitorId)
    return data
  })
}

function login() {
  if (config.useMock) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) return reject(new Error('获取登录 code 失败'))
        resolve(res.code)
      },
      fail: reject
    })
  }).then((code) => rawRequest({
    url: '/auth/login',
    data: { code },
    header: getGuestToken() ? { 'X-Guest-Token': getGuestToken() } : {}
  })).then((data) => {
    setLoginToken(data.token)
    clearGuestToken()
    session.setVisitorId(data.visitorId)
    return data
  })
}

function ensureIdentity() {
  if (config.useMock) return Promise.resolve(null)
  if (getLoginToken() || getGuestToken()) return Promise.resolve(null)
  return ensureGuest()
}

function onUnauthorized() {
  clearAll()
  if (config.useMock) return Promise.resolve(null)
  return ensureGuest().catch(() => null)
}

module.exports = {
  getGuestToken,
  getLoginToken,
  setGuestToken,
  setLoginToken,
  clearGuestToken,
  clearLoginToken,
  clearAll,
  rawRequest,
  ensureGuest,
  login,
  ensureIdentity,
  onUnauthorized
}
