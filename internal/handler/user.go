package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/kungoodbye/pln-core/internal/middleware"
	"github.com/kungoodbye/pln-core/internal/store"
)

// HandleUserFavorite handles POST/DELETE /api/user/favorite
func HandleUserFavorite(w http.ResponseWriter, r *http.Request) {
	openid := middleware.OpenIDFromContext(r)

	switch r.Method {
	case http.MethodPost:
		handleAddFavorite(w, r, openid)
	case http.MethodDelete:
		handleRemoveFavorite(w, r, openid)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func handleAddFavorite(w http.ResponseWriter, r *http.Request, openid string) {
	var req struct {
		ItemID string `json:"item_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ItemID == "" {
		http.Error(w, `{"error":"item_id required"}`, http.StatusBadRequest)
		return
	}

	if err := store.AddFavorite(openid, req.ItemID); err != nil {
		log.Printf("[user] add favorite failed: %v", err)
		http.Error(w, `{"error":"failed to add favorite"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"item_id": req.ItemID,
	})
}

func handleRemoveFavorite(w http.ResponseWriter, r *http.Request, openid string) {
	var req struct {
		ItemID string `json:"item_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ItemID == "" {
		http.Error(w, `{"error":"item_id required"}`, http.StatusBadRequest)
		return
	}

	if err := store.RemoveFavorite(openid, req.ItemID); err != nil {
		log.Printf("[user] remove favorite failed: %v", err)
		http.Error(w, `{"error":"failed to remove favorite"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"item_id": req.ItemID,
	})
}

// HandleUserFavorites handles GET /api/user/favorites
func HandleUserFavorites(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	openid := middleware.OpenIDFromContext(r)
	ids, err := store.GetFavorites(openid)
	if err != nil {
		log.Printf("[user] get favorites failed: %v", err)
		http.Error(w, `{"error":"failed to load favorites"}`, http.StatusInternalServerError)
		return
	}

	if ids == nil {
		ids = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"favorites": ids,
	})
}

// HandleUserHistory handles POST/GET /api/user/history
func HandleUserHistory(w http.ResponseWriter, r *http.Request) {
	openid := middleware.OpenIDFromContext(r)

	switch r.Method {
	case http.MethodPost:
		handleAddHistory(w, r, openid)
	case http.MethodGet:
		handleGetHistory(w, r, openid)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func handleAddHistory(w http.ResponseWriter, r *http.Request, openid string) {
	var req struct {
		Slots  string `json:"slots"`
		Result string `json:"result"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}

	// Serialize to JSON strings for storage
	slotsJSON, _ := json.Marshal(req.Slots)
	resultJSON, _ := json.Marshal(req.Result)

	if err := store.AddHistory(openid, string(slotsJSON), string(resultJSON)); err != nil {
		log.Printf("[user] add history failed: %v", err)
		http.Error(w, `{"error":"failed to save history"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

func handleGetHistory(w http.ResponseWriter, r *http.Request, openid string) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 50
	offset := 0
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}

	results, err := store.GetHistory(openid, limit, offset)
	if err != nil {
		log.Printf("[user] get history failed: %v", err)
		http.Error(w, `{"error":"failed to load history"}`, http.StatusInternalServerError)
		return
	}

	if results == nil {
		results = []map[string]interface{}{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"history": results,
	})
}
