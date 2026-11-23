// pages/badges/badges - 徽章系统：收集进度与徽章详情
const service = require('../../utils/service')

function progressClass(value) {
  const rounded = Math.max(0, Math.min(100, Math.round((Number(value) || 0) / 10) * 10))
  return 'progress-w' + rounded
}

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

Page({
  data: {
    badges: [],
    unlockedCount: 0,
    collectionPercent: 0,
    progressClass: 'progress-w0',
    current: null,
    showDetail: false,
    loading: true
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 2 })
    }
    this.loadData()
  },

  async loadData() {
    try {
      const raw = await service.getBadges()
      const badges = raw.map((item) => ({
        ...item,
        unlockedAt: item.unlockedAt ? formatTime(item.unlockedAt) : ''
      }))
      const unlockedCount = badges.filter((item) => item.unlocked).length
      const collectionPercent = badges.length ? Math.round((unlockedCount / badges.length) * 100) : 0
      this.setData({
        badges,
        unlockedCount,
        collectionPercent,
        progressClass: progressClass(collectionPercent),
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '徽章加载失败', icon: 'none' })
    }
  },

  onBadgeTap(e) {
    const id = e.currentTarget.dataset.id
    const badge = this.data.badges.find((item) => item.id === id)
    if (badge) this.setData({ current: badge, showDetail: true })
  },

  closeDetail() {
    this.setData({ showDetail: false })
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  }
})
