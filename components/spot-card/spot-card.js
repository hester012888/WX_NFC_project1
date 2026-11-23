// components/spot-card - 点位卡片（首页 / 活动详情页复用）
Component({
  properties: {
    spot: {
      type: Object,
      value: {},
      observer(value) {
        this.setData({ categoryMark: this.markOf(value) })
      }
    },
    index: { type: Number, value: 0 }
  },

  data: {
    categoryMark: '景'
  },

  methods: {
    markOf(spot) {
      const text = spot && spot.category ? String(spot.category) : ''
      return text ? text.charAt(0) : '景'
    },
    onTap() {
      this.triggerEvent('tap', { id: this.data.spot.id })
    }
  }
})
