// pages/index/index - 首页：活动介绍、探索入口、进度概览
const service = require('../../utils/service')

function progressClass(value) {
  const rounded = Math.max(0, Math.min(100, Math.round((Number(value) || 0) / 10) * 10))
  return 'progress-w' + rounded
}

Page({
  data: {
    activity: null,
    featured: [],
    stats: { checked: 0, total: 0, badges: 0, badgeTotal: 0, progress: 0 },
    brandMark: '城',
    heroEdition: 'NFC 城市探索计划',
    progressClass: 'progress-w0',
    loading: true
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 })
    }
  },

  async loadData() {
    try {
      const data = await service.getHomeData()
      const activity = data.activity || {}
      const brandMark = (String(activity.name || '城').trim().charAt(0) || '城')
      const year = String(activity.period || '').match(/\d{4}/)
      this.setData({
        ...data,
        brandMark,
        heroEdition: year ? year[0] + ' 城市探索计划' : 'NFC 城市探索计划',
        progressClass: progressClass(data.stats && data.stats.progress),
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  goActivity() {
    const id = this.data.activity ? this.data.activity.id : ''
    wx.navigateTo({ url: '/pages/activity/activity?id=' + id })
  },

  goQuick(e) {
    const { url, tab } = e.currentTarget.dataset
    if (tab === 'true') {
      wx.switchTab({ url })
    } else {
      wx.navigateTo({ url })
    }
  },

  goSpot(e) {
    wx.navigateTo({ url: '/pages/spot/spot?id=' + e.detail.id })
  }
})
