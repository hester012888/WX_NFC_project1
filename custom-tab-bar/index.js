// 自定义底部导航：使用 CSS 绘制图标，无需图片资源，兼容 iOS / Android
Component({
  data: {
    active: 0,
    list: [
      { path: '/pages/index/index', text: '首页', icon: 'home' },
      { path: '/pages/map/map', text: '地图', icon: 'map' },
      { path: '/pages/badges/badges', text: '徽章', icon: 'badge' },
      { path: '/pages/profile/profile', text: '我的', icon: 'user' }
    ]
  },
  methods: {
    onTap(e) {
      const { path, index } = e.currentTarget.dataset
      if (Number(index) === this.data.active) return
      wx.switchTab({ url: path })
    }
  }
})
