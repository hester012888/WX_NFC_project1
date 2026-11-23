// server/src/routes/admin.js - 管理后台统一入口（未来阶段在此挂载资源路由）
const express = require('express')
const { getDb } = require('../db')
const adminAuth = require('../admin-auth')
const adminAuthRoutes = require('./admin/auth')
const { publicAdmin } = adminAuth

const router = express.Router()

router.use('/auth', adminAuthRoutes)
router.use(adminAuth.adminAuth)

router.get('/admins', adminAuth.requireRole('super_admin'), (req, res, next) => {
  try {
    const list = getDb().prepare('SELECT * FROM admins ORDER BY id').all().map(publicAdmin)
    res.json({ code: 0, message: 'ok', data: list })
  } catch (err) {
    next(err)
  }
})

router.use('/activities', require('./admin/activities'))
router.use('/points', require('./admin/points'))

router.use((req, res) => {
  res.status(501).json({ code: 501, message: '该管理接口将在后续阶段实现' })
})

module.exports = router
