// pages/profile/profile - 个人中心：打卡记录、徽章与活动进度
const service = require('../../utils/service')

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function levelOf(progress) {
  const value = Number(progress) || 0
  if (value >= 100) return '城市收藏家'
  if (value >= 50) return '深度漫游者'
  if (value > 0) return '文化探索者'
  return '初访探索者'
}

Page({
  data: {
    profile: { visitorId: '' },
    stats: { checked: 0, total: 0, badges: 0, badgeTotal: 0, progress: 0 },
    checkins: [],
    levelName: '初访探索者',
    loading: true,
    menus: [
      { id: 'badges', icon: 'badge', title: '我的徽章', desc: '查看收集的成就', url: '/pages/badges/badges', tab: true },
      { id: 'map', icon: 'map', title: '探索地图', desc: '查看点位与路线', url: '/pages/map/map', tab: true },
      { id: 'activity', icon: 'activity', title: '活动详情', desc: '了解活动规则与进度', url: '/pages/activity/activity', tab: false },
      { id: 'nfc', icon: 'nfc', title: 'NFC 玩法说明', desc: '触碰标签开启故事', url: '/pages/activity/activity?id=nfc-guide', tab: false }
    ]
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 3 })
    }
    this.loadData()
  },

  async loadData() {
    try {
      const data = await service.getProfile()
      const checkins = (data.checkins || []).map((item) => ({ ...item, timeText: formatTime(item.time) }))
      const stats = data.stats || this.data.stats
      this.setData({
        profile: data,
        stats,
        checkins,
        levelName: levelOf(stats.progress),
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '个人信息加载失败', icon: 'none' })
    }
  },

  onMenuTap(e) {
    const { url, tab } = e.currentTarget.dataset
    if (tab === 'true') {
      wx.switchTab({ url })
    } else {
      wx.navigateTo({ url })
    }
  },

  onReset() {
    wx.showModal({
      title: '重置演示数据',
      content: '将清除本机的打卡记录与徽章解锁状态，仅用于本地测试。',
      success: (res) => {
        if (!res.confirm) return
        service.resetDemoData()
        this.loadData()
        wx.showToast({ title: '已重置', icon: 'success' })
      }
    })
  }
})
