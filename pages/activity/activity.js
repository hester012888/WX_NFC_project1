// pages/activity/activity - 活动详情：介绍、规则、进度
const service = require('../../utils/service')

Page({
  data: {
    activityId: '',
    activity: { name: '活动详情', rules: [] },
    spots: [],
    stats: { checked: 0, total: 0, badges: 0, badgeTotal: 0, progress: 0 },
    loading: true
  },

  onLoad(query) {
    this.setData({ activityId: query.id || '' })
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    try {
      const data = await service.getActivity(this.data.activityId)
      this.setData({ ...data, loading: false })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '活动加载失败', icon: 'none' })
    }
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  goSpot(e) {
    wx.navigateTo({ url: '/pages/spot/spot?id=' + e.detail.id })
  }
})
