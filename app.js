// app.js
const config = require('./config/api.config')

App({
  globalData: {
    env: config.env,
    windowInfo: null
  },

  onLaunch() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.globalData.windowInfo = info
  }
})
