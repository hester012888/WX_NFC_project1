// server/src/admin-init.js - 一次性管理员初始化（无默认账号，无公开注册）
const bcrypt = require('bcryptjs')
const { getDb, closeDb } = require('./db')
const { migrate } = require('./migrate')

function initializeAdmin({ username, password, displayName = '', role = 'super_admin', db = getDb() } = {}) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(username.trim())) {
    throw new Error('管理员用户名需为 3-32 位字母、数字、下划线或连字符')
  }
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('管理员密码长度至少 12 位')
  }
  if (!['super_admin', 'operator'].includes(role)) {
    throw new Error('管理员角色只能是 super_admin 或 operator')
  }
  if (db.prepare('SELECT COUNT(*) AS c FROM admins').get().c > 0) {
    throw new Error('管理员已存在，一次性初始化入口已关闭')
  }

  const hash = bcrypt.hashSync(password, 12)
  const now = Date.now()
  db.prepare(`
    INSERT INTO admins (username, password_hash, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(username.trim(), hash, displayName, role, now, now)
  return { username: username.trim(), role }
}

if (require.main === module) {
  const db = getDb()
  migrate(db)
  try {
    const result = initializeAdmin({
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
      displayName: process.env.ADMIN_DISPLAY_NAME || '',
      role: process.env.ADMIN_ROLE || 'super_admin',
      db
    })
    console.log(`管理员初始化成功：${result.username}（${result.role}）`)
  } catch (err) {
    console.error(`初始化失败：${err.message}`)
    process.exitCode = 1
  } finally {
    closeDb()
  }
}

module.exports = { initializeAdmin }
