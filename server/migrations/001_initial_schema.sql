-- 001_initial_schema.sql - 第一阶段业务表结构（SQLite）
-- 所有业务 ID 沿用现有字符串格式，避免破坏小程序端参数。

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slogan TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  rules_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS points (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  badge_id TEXT,
  latitude REAL NOT NULL DEFAULT 0,
  longitude REAL NOT NULL DEFAULT 0,
  cover_url TEXT NOT NULL DEFAULT '',
  cover_tone TEXT NOT NULL DEFAULT 'teal',
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  media_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_points_activity ON points(activity_id, sort_order);

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'teal',
  badge_desc TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- openid / union_id 为后续微信登录预留，当前始终为 NULL。
CREATE TABLE IF NOT EXISTS users (
  visitor_id TEXT PRIMARY KEY,
  openid TEXT UNIQUE,
  union_id TEXT,
  nickname TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nfc_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  raw_uid TEXT NOT NULL DEFAULT '',
  activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
  point_id TEXT REFERENCES points(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unbound')),
  bound_at INTEGER,
  unbound_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- 一个 UID 同一时刻只能有一个有效绑定；一个点位允许多个标签。
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfc_tags_active_uid ON nfc_tags(uid) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_nfc_tags_activity ON nfc_tags(activity_id, status);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_point ON nfc_tags(point_id, status);

CREATE TABLE IF NOT EXISTS checkin_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL REFERENCES users(visitor_id) ON DELETE CASCADE,
  point_id TEXT NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  uid TEXT NOT NULL DEFAULT '',
  client_time INTEGER NOT NULL,
  is_valid INTEGER NOT NULL DEFAULT 1 CHECK (is_valid IN (0, 1)),
  created_at INTEGER NOT NULL
);
-- 重复打卡不产生第二条有效记录。
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_valid
  ON checkin_records(visitor_id, point_id) WHERE is_valid = 1;
CREATE INDEX IF NOT EXISTS idx_checkin_visitor ON checkin_records(visitor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL DEFAULT '',
  uid TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'tag_read',
  payload_json TEXT NOT NULL DEFAULT '{}',
  activity_id TEXT,
  point_id TEXT,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_events_created ON device_events(created_at DESC);
