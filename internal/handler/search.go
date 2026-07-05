package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// HandleSearch handles GET /api/alchemy/search?q=...
// Refactored from main.go for cleaner separation
func HandleSearch(webDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" || len(q) < 2 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		f, err := os.Open(filepath.Join(webDir, "alchemy_db.json"))
		if err != nil {
			log.Printf("[search] file open error: %v", err)
			http.Error(w, "data not found", http.StatusInternalServerError)
			return
		}
		defer f.Close()

		dec := json.NewDecoder(f)
		if _, err := dec.Token(); err != nil {
			http.Error(w, "invalid data", http.StatusInternalServerError)
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

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write([]byte("["))
		for i, r := range results {
			if i > 0 {
				w.Write([]byte(","))
			}
			w.Write(r)
		}
		w.Write([]byte("]"))
	}
}
