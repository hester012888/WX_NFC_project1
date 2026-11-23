// server/src/routes/admin.js - 独立网页管理后台接口预留（挂载于 /api/admin）
// 第二阶段规划：
//   GET/POST    /api/admin/activities          活动管理
//   GET/POST    /api/admin/spots               点位管理
//   GET/POST    /api/admin/bindings            NFC UID 与点位绑定
//   GET/POST    /api/admin/media               图片 / 视频 / 音频（阿里云 OSS 签名）
//   GET         /api/admin/checkins            游客打卡记录
//   GET/POST    /api/admin/badges              徽章配置
// 正式实现前需补充管理员鉴权（JWT / Session）与数据库持久化。

const express = require('express')
const router = express.Router()

const reserved = (req, res) => res.status(501).json({
  code: 501,
  message: '管理后台接口已预留，将在第二阶段实现'
})

router.get('/activities', reserved)
router.post('/activities', reserved)
router.get('/spots', reserved)
router.post('/spots', reserved)
router.get('/bindings', reserved)
router.post('/bindings', reserved)
router.get('/media', reserved)
router.post('/media', reserved)
router.get('/checkins', reserved)
router.get('/badges', reserved)
router.post('/badges', reserved)

module.exports = router
