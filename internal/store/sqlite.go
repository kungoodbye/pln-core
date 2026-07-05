package store

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// Init opens/creates the SQLite database and runs migrations
func Init(dataDir string) error {
	if dataDir == "" {
		dataDir = "."
	}

	dbPath := filepath.Join(dataDir, "pln_alchemy.db")
	var err error
	db, err = sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return err
	}

	// Connection pool: SQLite is single-writer, keep it simple
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := db.Ping(); err != nil {
		return err
	}

	log.Printf("[store] SQLite opened: %s", dbPath)
	return runMigrations()
}

func runMigrations() error {
	migration := `
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
		slots       TEXT NOT NULL,
		result      TEXT NOT NULL,
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (openid) REFERENCES users(openid)
	);

	CREATE INDEX IF NOT EXISTS idx_history_openid ON history(openid);
	`

	_, err := db.Exec(migration)
	if err != nil {
		return err
	}
	log.Println("[store] migrations complete")
	return nil
}

// DB returns the database connection
func DB() *sql.DB { return db }

// Close shuts down the database
func Close() {
	if db != nil {
		db.Close()
	}
}

// EnsureUser creates a user record if it doesn't exist
func EnsureUser(openid string) error {
	_, err := db.Exec(
		`INSERT INTO users (openid) VALUES (?) ON CONFLICT(openid) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
		openid,
	)
	return err
}

// AddFavorite adds a favorite item for a user
func AddFavorite(openid, itemID string) error {
	_, err := db.Exec(
		`INSERT OR IGNORE INTO favorites (openid, item_id) VALUES (?, ?)`,
		openid, itemID,
	)
	return err
}

// RemoveFavorite removes a favorite item
func RemoveFavorite(openid, itemID string) error {
	_, err := db.Exec(
		`DELETE FROM favorites WHERE openid = ? AND item_id = ?`,
		openid, itemID,
	)
	return err
}

// GetFavorites returns all favorite item IDs for a user
func GetFavorites(openid string) ([]string, error) {
	rows, err := db.Query(
		`SELECT item_id FROM favorites WHERE openid = ? ORDER BY created_at DESC`,
		openid,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// AddHistory records a synthesis history entry
func AddHistory(openid, slotsJSON, resultJSON string) error {
	_, err := db.Exec(
		`INSERT INTO history (openid, slots, result) VALUES (?, ?, ?)`,
		openid, slotsJSON, resultJSON,
	)
	return err
}

// GetHistory returns synthesis history for a user
func GetHistory(openid string, limit, offset int) ([]map[string]interface{}, error) {
	rows, err := db.Query(
		`SELECT slots, result, created_at FROM history WHERE openid = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		openid, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var slots, result, createdAt string
		if err := rows.Scan(&slots, &result, &createdAt); err != nil {
			return nil, err
		}
		results = append(results, map[string]interface{}{
			"slots":      slots,
			"result":     result,
			"created_at": createdAt,
		})
	}
	return results, rows.Err()
}

// init ensures unused import is valid in minimal builds
var _ = os.DevNull
