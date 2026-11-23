// pages/map/map - 探索地图：点位标记与推荐路线
const service = require('../../utils/service')

Page({
  data: {
    spots: [],
    markers: [],
    polyline: [],
    center: { latitude: 30.25, longitude: 120.158 },
    stats: { checked: 0, total: 0, progress: 0 },
    loading: true
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 1 })
    }
    this.loadData()
  },

  async loadData() {
    try {
      const data = await service.getMapData()
      const spots = data.spots || []
      const markers = spots.map((spot) => ({
        id: spot.order,
        latitude: spot.latitude,
        longitude: spot.longitude,
        name: spot.name,
        callout: {
          content: spot.order + '. ' + spot.name,
          color: '#17313a',
          fontSize: 12,
          bgColor: '#ffffff',
          borderRadius: 8,
          padding: 8,
          display: 'ALWAYS',
          textAlign: 'center'
        }
      }))
      const polyline = spots.length
        ? [{
            points: spots.map((spot) => ({ latitude: spot.latitude, longitude: spot.longitude })),
            color: '#0c8c86',
            width: 4,
            dottedLine: true,
            arrowLine: true
          }]
        : []
      const first = spots[0]
      this.setData({
        spots,
        markers,
        polyline,
        center: first ? { latitude: first.latitude - 0.012, longitude: first.longitude - 0.008 } : this.data.center,
        stats: (await service.getStats()) || this.data.stats,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '地图数据加载失败', icon: 'none' })
    }
  },

  onMarkerTap(e) {
    const spot = this.data.spots.find((item) => item.order === e.detail.markerId)
    if (spot) this.goSpot({ currentTarget: { dataset: { id: spot.id } } })
  },

  goSpot(e) {
    wx.navigateTo({ url: '/pages/spot/spot?id=' + e.currentTarget.dataset.id })
  },

  goActivity() {
    wx.navigateTo({ url: '/pages/activity/activity' })
  }
})
