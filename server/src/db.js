// server/src/db.js - 全项目唯一的 SQLite 连接层（复用，不重复创建连接）
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const config = require('./config')

let instance = null

function openDb(dbPath = config.dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  return db
}

function getDb() {
  if (!instance) instance = openDb()
  return instance
}

// 仅供测试注入临时数据库使用
function setDb(db) {
  instance = db
}

function closeDb() {
  if (instance) {
    instance.close()
    instance = null
  }
}

module.exports = { openDb, getDb, setDb, closeDb }
