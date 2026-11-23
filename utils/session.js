// utils/session.js - 游客身份与本地打卡缓存（第一阶段无登录，使用匿名 visitorId）
const VISITOR_KEY = 'nfc_tour_visitor_id'
const CHECKIN_KEY = 'nfc_tour_checkins'

function getVisitorId() {
  let id = wx.getStorageSync(VISITOR_KEY)
  if (!id) {
    id = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
    wx.setStorageSync(VISITOR_KEY, id)
  }
  return id
}

function setVisitorId(id) {
  wx.setStorageSync(VISITOR_KEY, id)
}

function getCheckins() {
  const list = wx.getStorageSync(CHECKIN_KEY)
  return Array.isArray(list) ? list : []
}

function addCheckin(record) {
  const list = getCheckins()
  if (!list.some((item) => item.spotId === record.spotId)) {
    list.unshift(record)
    wx.setStorageSync(CHECKIN_KEY, list)
  }
  return getCheckins()
}

function clearCheckins() {
  wx.removeStorageSync(CHECKIN_KEY)
}

module.exports = { getVisitorId, setVisitorId, getCheckins, addCheckin, clearCheckins }
