-- 002_auth_sessions.sql - 游客凭证、微信登录会话与账号合并标记

CREATE TABLE IF NOT EXISTS login_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  token_type TEXT NOT NULL CHECK (token_type IN ('guest', 'login')),
  visitor_id TEXT NOT NULL REFERENCES users(visitor_id) ON DELETE CASCADE,
  openid TEXT,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  refreshed_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_login_sessions_visitor ON login_sessions(visitor_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_login_sessions_expiry ON login_sessions(expires_at);

ALTER TABLE users ADD COLUMN merged_into TEXT;
ALTER TABLE users ADD COLUMN last_login_at INTEGER;
