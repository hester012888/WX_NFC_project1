// server/src/routes/admin.js - Web 管理后台统一入口
const express = require('express')
const adminAuth = require('../admin-auth')
const adminAuthRoutes = require('./admin/auth')

const router = express.Router()

router.use('/auth', adminAuthRoutes)
router.use(adminAuth.adminAuth)

router.use('/admins', require('./admin/admins'))
router.use('/operation-logs', require('./admin/logs'))
router.use('/activities', require('./admin/activities'))
router.use('/points', require('./admin/points'))
router.use('/nfc-tags', require('./admin/nfc-tags'))
router.use('/users', require('./admin/users'))
router.use('/checkins', require('./admin/checkins'))
router.use(require('./admin/devices'))

router.use((req, res) => {
  res.status(404).json({ code: 404, message: '管理接口不存在' })
})

module.exports = router
