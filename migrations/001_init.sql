-- 飘流炼金工具 — 用户数据库初始化
-- SQLite 建表迁移

CREATE TABLE IF NOT EXISTS users (
    openid      TEXT PRIMARY KEY,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorites (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    openid      TEXT NOT NULL,
    item_id     TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(openid, item_id),
    FOREIGN KEY (openid) REFERENCES users(openid)
);

CREATE INDEX IF NOT EXISTS idx_favorites_openid ON favorites(openid);

CREATE TABLE IF NOT EXISTS history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    openid      TEXT NOT NULL,
    slots       TEXT NOT NULL,       -- JSON 序列化的槽位数据
    result      TEXT NOT NULL,       -- JSON 序列化的结果
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (openid) REFERENCES users(openid)
);

CREATE INDEX IF NOT EXISTS idx_history_openid ON history(openid);
