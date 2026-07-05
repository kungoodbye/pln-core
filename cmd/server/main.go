package main

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	webDir     = ""
	version    = ""
	dataHash   = ""
	coreHash   = ""
	hashTime   time.Time
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

	loadHashes()

	mux := http.NewServeMux()

	// Static files with caching
	mux.HandleFunc("/web/alchemy_config.js", serveConfig)
	mux.HandleFunc("/web/alchemy_core.js", serveCore)
	mux.HandleFunc("/web/alchemy_db.json", serveData)

	// API
	mux.HandleFunc("/api/alchemy/version", handleVersion)
	mux.HandleFunc("/api/alchemy/search", handleSearch)

	// CORS for dev
	handler := corsMiddleware(mux)

	log.Printf("pln-core server starting on :%s, web dir: %s", port, webDir)
	log.Printf("core hash: %s, data hash: %s", coreHash[:8], dataHash[:8])

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
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

	hashTime = time.Now()
	version = hashTime.Format("20060102150405")
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

func handleSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" || len(q) < 2 {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	f, err := os.Open(filepath.Join(webDir, "alchemy_db.json"))
	if err != nil {
		http.Error(w, "data not found", 500)
		return
	}
	defer f.Close()

	// Simple streaming search in JSON array
	dec := json.NewDecoder(f)
	if _, err := dec.Token(); err != nil { // skip opening [
		http.Error(w, "invalid data", 500)
		return
	}

	var results []json.RawMessage
	q = strings.ToLower(q)
	for dec.More() {
		var item json.RawMessage
		if err := dec.Decode(&item); err != nil {
			break
		}
		s := strings.ToLower(string(item))
		if strings.Contains(s, q) {
			results = append(results, item)
			if len(results) >= 20 {
				break
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte("["))
	for i, r := range results {
		if i > 0 {
			w.Write([]byte(","))
		}
		w.Write(r)
	}
	w.Write([]byte("]"))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(200)
			return
		}
		next.ServeHTTP(w, r)
	})
}

var _ = io.Discard
