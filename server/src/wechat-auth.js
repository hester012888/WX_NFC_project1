// server/src/wechat-auth.js - code2session：真实微信接口结构与开发 mock 模式
const crypto = require('crypto')
const config = require('./config')

function authError(message, status, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function validateCode(rawCode) {
  if (typeof rawCode !== 'string') throw authError('缺少登录 code', 400, 'INVALID_CODE')
  const code = rawCode.trim()
  if (!code || code.length > 128 || !/^[A-Za-z0-9_#-]+$/.test(code)) {
    throw authError('登录 code 格式非法', 400, 'INVALID_CODE')
  }
  return code
}

function mapWechatError(errcode, errmsg) {
  if (errcode === 40029 || errcode === 40163 || errcode === 40226) {
    return authError('登录 code 无效、已使用或存在风险', 401, 'WX_CODE_INVALID')
  }
  if (errcode === 45011 || errcode === 45009) {
    return authError('微信登录请求过于频繁，请稍后重试', 429, 'WX_RATE_LIMIT')
  }
  return authError(`微信登录失败（${errcode}）${errmsg || ''}`.slice(0, 80), 401, 'WX_LOGIN_FAILED')
}

function mockExchange(code) {
  if (code === 'MOCK_ERR_40029') throw authError('登录 code 无效或已使用', 401, 'WX_CODE_INVALID')
  if (code === 'MOCK_ERR_45011') throw authError('微信登录请求过于频繁，请稍后重试', 429, 'WX_RATE_LIMIT')
  if (code === 'MOCK_ERR_NETWORK') throw authError('微信登录服务暂时不可用', 503, 'WX_UNAVAILABLE')
  // 约定：code 中 # 前的部分决定同一 openid，便于测试重复登录
  const seed = code.includes('#') ? code.split('#')[0] : code
  const openid = 'mock_oid_' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16)
  return { openid, unionid: null }
}

async function exchangeCode(rawCode) {
  const code = validateCode(rawCode)
  if (config.wxAuthMode === 'mock') return mockExchange(code)
  if (!config.wxAppid || !config.wxAppsecret) {
    throw authError('服务器未配置微信登录参数', 503, 'WX_NOT_CONFIGURED')
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', config.wxAppid)
  url.searchParams.set('secret', config.wxAppsecret)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) throw authError('微信登录服务不可用', 503, 'WX_UNAVAILABLE')
    const data = await res.json()
    if (data.errcode) throw mapWechatError(data.errcode, data.errmsg)
    if (!data.openid) throw authError('微信登录未返回 openid', 401, 'WX_LOGIN_FAILED')
    return { openid: data.openid, unionid: data.unionid || null }
  } catch (err) {
    if (err.status) throw err
    throw authError('微信登录服务暂时不可用', 503, 'WX_UNAVAILABLE')
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { exchangeCode }
