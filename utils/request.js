// utils/request.js - 统一 HTTP 请求封装（业务页面不直接调用 wx.request）
const config = require('../config/api.config')
const { getVisitorId } = require('./session')

function request(options) {
  const { url, method = 'GET', data = {}, header = {} } = options

  return new Promise((resolve, reject) => {
    wx.request({
      url: config.baseUrl + url,
      method,
      data,
      timeout: config.timeout,
      header: {
        'Content-Type': 'application/json',
        'X-Visitor-Id': getVisitorId(),
        ...header
      },
      success(res) {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data)
        } else {
          reject(new Error((body && body.message) || `请求失败（${res.statusCode}）`))
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

module.exports = { request }
