// pages/activity/activity - 活动详情：介绍、规则、进度
const service = require('../../utils/service')

function progressClass(value) {
  const rounded = Math.max(0, Math.min(100, Math.round((Number(value) || 0) / 10) * 10))
  return 'progress-w' + rounded
}

Page({
  data: {
    activityId: '',
    activity: { name: '活动详情', rules: [] },
    spots: [],
    stats: { checked: 0, total: 0, badges: 0, badgeTotal: 0, progress: 0 },
    activityMark: '旅',
    periodYear: '',
    ruleCount: 0,
    progressClass: 'progress-w0',
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
      const activity = data.activity || {}
      const year = String(activity.period || '').match(/\d{4}/)
      this.setData({
        ...data,
        activityMark: String(activity.name || '旅').trim().charAt(0) || '旅',
        periodYear: year ? year[0] : '',
        ruleCount: (activity.rules || []).length,
        progressClass: progressClass(data.stats && data.stats.progress),
        loading: false
      })
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
