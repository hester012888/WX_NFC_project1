// pages/spot/spot - 点位详情：图文 / 视频 / 音频 / 打卡
const service = require('../../utils/service')

Page({
  data: {
    id: '',
    uid: '',
    nfcHint: '',
    spot: {
      category: '文化点位',
      name: '点位加载中',
      subtitle: '',
      tags: [],
      media: { images: [], video: '', audio: '', videoTitle: '', audioTitle: '' }
    },
    loading: true,
    checking: false,
    showBadge: false,
    unlockedBadge: null,
    audioPlaying: false
  },

  onLoad(query) {
    this.setData({ id: query.id || '', uid: query.uid || '' })
    this.audioCtx = wx.createInnerAudioContext()
    this.audioCtx.onEnded(() => this.setData({ audioPlaying: false }))
    this.initByUid()
  },

  // NDEF 链接携带 UID 时，由服务层向后端查询绑定关系；失败则按普通链接进入
  async initByUid() {
    if (this.data.uid) {
      try {
        const resolved = await service.resolveNfc(this.data.uid)
        if (resolved) {
          this.setData({
            id: resolved.spotId,
            nfcHint: '已通过 NFC 标签进入「' + resolved.spot.name + '」'
          })
        }
      } catch (err) {
        // UID 无法识别时静默降级，仍允许按 id 参数浏览
      }
    }
    this.loadSpot()
  },

  async loadSpot() {
    if (!this.data.id) {
      this.setData({ loading: false })
      wx.showToast({ title: '缺少点位参数', icon: 'none' })
      return
    }
    try {
      const spot = await service.getSpot(this.data.id)
      this.setData({ spot, loading: false })
      if (spot && spot.media && spot.media.audio) {
        this.audioCtx.src = spot.media.audio
      }
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '点位加载失败', icon: 'none' })
    }
  },

  async onCheckin() {
    if (this.data.checking || !this.data.spot || this.data.spot.checked) return
    this.setData({ checking: true })
    try {
      const result = await service.checkIn({ spotId: this.data.id, uid: this.data.uid })
      this.setData({
        'spot.checked': true,
        checking: false,
        showBadge: !!result.badge,
        unlockedBadge: result.badge
      })
    } catch (err) {
      this.setData({ checking: false })
      wx.showToast({ title: err.message || '打卡失败', icon: 'none' })
    }
  },

  onAudio() {
    const media = this.data.spot && this.data.spot.media
    if (!media || !media.audio) {
      wx.showToast({ title: '语音导览资源待接入', icon: 'none' })
      return
    }
    if (this.data.audioPlaying) {
      this.audioCtx.pause()
      this.setData({ audioPlaying: false })
    } else {
      this.audioCtx.play()
      this.setData({ audioPlaying: true })
    }
  },

  onVideo() {
    const media = this.data.spot && this.data.spot.media
    if (!media || !media.video) {
      wx.showToast({ title: '视频资源待接入', icon: 'none' })
    }
  },

  closeBadge() {
    this.setData({ showBadge: false })
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  onUnload() {
    if (this.audioCtx) this.audioCtx.destroy()
  }
})
