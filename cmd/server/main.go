package main

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kungoodbye/pln-core/internal/handler"
	"github.com/kungoodbye/pln-core/internal/middleware"
	"github.com/kungoodbye/pln-core/internal/store"
)

var (
	webDir   = ""
	version  = ""
	dataHash = ""
	coreHash = ""
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	webDir = os.Getenv("WEB_DIR")
	if webDir == "" {
		webDir = filepath.Join("..", "..", "web")
	}
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "."
	}

	loadHashes()

	// Initialize SQLite
	if err := store.Init(dataDir); err != nil {
		log.Fatalf("store init failed: %v", err)
	}
	defer store.Close()

	mux := http.NewServeMux()

	// == Static files (existing, unchanged) ==
	mux.HandleFunc("/web/alchemy_config.js", serveConfig)
	mux.HandleFunc("/web/alchemy_core.js", serveCore)
	mux.HandleFunc("/web/alchemy_db.json", serveData)

	// == Public API (existing, unchanged) ==
	mux.HandleFunc("/api/alchemy/version", handleVersion)
	mux.HandleFunc("/api/alchemy/search", handler.HandleSearch(webDir))

	// == Auth API (new) ==
	mux.HandleFunc("/api/wx/login", handler.HandleWxLogin)

	// == User API (new, requires auth) ==
	mux.HandleFunc("/api/user/favorite", middleware.AuthRequired(handler.HandleUserFavorite))
	mux.HandleFunc("/api/user/favorites", middleware.AuthRequired(handler.HandleUserFavorites))
	mux.HandleFunc("/api/user/history", middleware.AuthRequired(handler.HandleUserHistory))

	// Apply CORS (updated to allow POST/DELETE/PUT for new endpoints)
	corsHandler := corsMiddleware(mux)

	log.Printf("pln-core server starting on :%s", port)
	log.Printf("  web dir: %s", webDir)
	log.Printf("  data dir: %s", dataDir)
	log.Printf("  core hash: %s, data hash: %s", coreHash[:8], dataHash[:8])
	log.Printf("  auth: wx_configured=%v", os.Getenv("WX_APPID") != "")

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      corsHandler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}

func loadHashes() {
	cores, _ := os.ReadFile(filepath.Join(webDir, "alchemy_core.js"))
	coreHash = fmt.Sprintf("%x", md5.Sum(cores))

	data, _ := os.ReadFile(filepath.Join(webDir, "alchemy_db.json"))
	dataHash = fmt.Sprintf("%x", md5.Sum(data))

	version = time.Now().Format("20060102150405")
}

func serveConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	http.ServeFile(w, r, filepath.Join(webDir, "alchemy_config.js"))
}

func serveCore(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.Header().Set("ETag", fmt.Sprintf(`"%s"`, coreHash))
	http.ServeFile(w, r, filepath.Join(webDir, "alchemy_core.js"))
}

func serveData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("ETag", fmt.Sprintf(`"%s"`, dataHash))

	if match := r.Header.Get("If-None-Match"); match != "" {
		if strings.Trim(match, `"`) == dataHash {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	http.ServeFile(w, r, filepath.Join(webDir, "alchemy_db.json"))
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"version":   version,
		"core_hash": coreHash,
		"data_hash": dataHash,
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
