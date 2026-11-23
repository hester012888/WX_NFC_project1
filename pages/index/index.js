// pages/index/index - 首页：活动介绍、探索入口、进度概览
const service = require('../../utils/service')

Page({
  data: {
    activity: null,
    featured: [],
    stats: { checked: 0, total: 0, badges: 0, badgeTotal: 0, progress: 0 },
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
      this.setData({ ...data, loading: false })
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
