// utils/service.js - 业务服务层：页面只依赖本文件，不感知数据来源与服务器地址
const config = require('../config/api.config')
const { request } = require('./request')
const mock = require('./mock')
const session = require('./session')

function getStats() {
  const checkins = session.getCheckins()
  const unlocked = mock.badges.filter((badge) =>
    checkins.some((item) => item.spotId === badge.spotId)
  ).length
  return {
    checked: checkins.length,
    total: mock.spots.length,
    badges: unlocked,
    badgeTotal: mock.badges.length,
    progress: Math.round((checkins.length / mock.spots.length) * 100)
  }
}

function decorateSpots() {
  const checkins = session.getCheckins()
  return mock.spots.map((spot) => ({
    ...spot,
    checked: checkins.some((item) => item.spotId === spot.id)
  }))
}

const service = {
  getStats,

  async getHomeData() {
    if (config.useMock) {
      return { activity: mock.activity, featured: decorateSpots().slice(0, 3), stats: getStats() }
    }
    return request({ url: '/home' })
  },

  async getActivity(id) {
    if (config.useMock) {
      return { activity: mock.activity, spots: decorateSpots(), stats: getStats(), currentId: id || mock.activity.id }
    }
    return request({ url: '/activities/' + id })
  },

  async getSpot(id) {
    if (config.useMock) {
      const spot = decorateSpots().find((item) => item.id === id)
      return spot || null
    }
    return request({ url: '/spots/' + id })
  },

  async getMapData() {
    if (config.useMock) {
      return { spots: decorateSpots(), activity: mock.activity }
    }
    return request({ url: '/map' })
  },

  async getBadges() {
    if (config.useMock) {
      const checkins = session.getCheckins()
      return mock.badges.map((badge) => {
        const record = checkins.find((item) => item.spotId === badge.spotId)
        return { ...badge, unlocked: !!record, unlockedAt: record ? record.time : '' }
      })
    }
    return request({ url: '/badges' })
  },

  async getProfile() {
    if (config.useMock) {
      const checkins = session.getCheckins().map((item) => {
        const spot = mock.spots.find((s) => s.id === item.spotId)
        return { ...item, spotName: spot ? spot.name : '未知点位' }
      })
      return { visitorId: session.getVisitorId(), activity: mock.activity, stats: getStats(), checkins }
    }
    return request({ url: '/profile' })
  },

  async checkIn({ spotId, uid = '' }) {
    if (config.useMock) {
      const spot = mock.spots.find((item) => item.id === spotId)
      if (!spot) throw new Error('点位不存在')
      const badge = mock.badges.find((item) => item.spotId === spotId) || null
      const record = { spotId, uid, time: Date.now() }
      session.addCheckin(record)
      return { record, badge, stats: getStats() }
    }
    return request({ url: '/checkins', method: 'POST', data: { spotId, uid } })
  },

  // NDEF 链接进入时预留：由 UID 查询活动与点位，正式环境在后端完成绑定查询
  async resolveNfc(uid) {
    if (!uid) return null
    if (config.useMock) return mock.resolveUid(uid)
    return request({ url: '/nfc/resolve', method: 'POST', data: { uid } })
  },

  // 仅模拟模式使用：清除本地打卡记录，方便重复测试
  resetDemoData() {
    session.clearCheckins()
  },

  // 专用读卡器事件上报预留（第二阶段接入真实设备）
  reportNfcEvent(uid) {
    if (config.useMock) return Promise.resolve({ accepted: true })
    return request({ url: config.nfcEventPath, method: 'POST', data: { uid, type: 'tag_read' } })
  }
}

module.exports = service
