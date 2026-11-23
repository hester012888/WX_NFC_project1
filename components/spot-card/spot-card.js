// components/spot-card - 点位卡片（首页 / 活动详情页复用）
Component({
  properties: {
    spot: { type: Object, value: {} },
    index: { type: Number, value: 0 }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.spot.id })
    }
  }
})
