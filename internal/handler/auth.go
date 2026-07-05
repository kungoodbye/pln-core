package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/kungoodbye/pln-core/internal/middleware"
	"github.com/kungoodbye/pln-core/internal/store"
	"github.com/kungoodbye/pln-core/internal/wx"
)

// HandleWxLogin handles POST /api/wx/login
// Body: {"code": "..."}
// Response: {"token": "...", "openid": "...", "expires_in": 7200}
func HandleWxLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		http.Error(w, `{"error":"invalid request body, code required"}`, http.StatusBadRequest)
		return
	}

	session, err := wx.Code2Session(req.Code)
	if err != nil {
		log.Printf("[auth] code2Session failed: %v", err)
		http.Error(w, `{"error":"login failed, please try again"}`, http.StatusInternalServerError)
		return
	}

	// Ensure user exists in db
	if err := store.EnsureUser(session.OpenID); err != nil {
		log.Printf("[auth] ensure user failed: %v", err)
	}

	// Generate JWT
	token, err := middleware.GenerateToken(session.OpenID)
	if err != nil {
		log.Printf("[auth] token generation failed: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token":      token,
		"openid":     session.OpenID,
		"expires_in": 7200,
	})
}
