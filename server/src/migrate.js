// server/src/migrate.js - 可追踪的 SQL 迁移执行器
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { getDb, closeDb } = require('./db')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)
}

function migrate(db = getDb()) {
  ensureTable(db)
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version))
  const insert = db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)')
  let count = 0

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    const checksum = crypto.createHash('sha256').update(sql).digest('hex')
    db.transaction(() => {
      db.exec(sql)
      insert.run(file, checksum, Date.now())
    })()
    count += 1
  }
  return count
}

if (require.main === module) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_MIGRATE !== '1') {
    console.error('生产环境禁止直接迁移；请显式设置 ALLOW_PROD_MIGRATE=1 并确认备份。')
    process.exit(1)
  }
  const db = getDb()
  console.log(`本次执行迁移文件数：${migrate(db)}`)
  closeDb()
}

module.exports = { migrate }
