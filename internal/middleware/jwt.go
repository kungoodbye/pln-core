package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const contextKeyOpenID contextKey = "openid"

var jwtSecret []byte

func init() {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "pln-alchemy-dev-secret-change-in-production"
	}
	jwtSecret = []byte(secret)
}

// Claims contains the JWT payload
type Claims struct {
	OpenID string `json:"openid"`
	jwt.RegisteredClaims
}

// GenerateToken creates a JWT token for the given openid
func GenerateToken(openid string) (string, error) {
	claims := Claims{
		OpenID: openid,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(2 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "pln-alchemy",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// ValidateToken parses and validates a JWT token, returns the openid
// Returns "" and error if invalid
func ValidateToken(tokenStr string) (string, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return jwtSecret, nil
	})
	if err != nil {
		return "", err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return "", jwt.ErrSignatureInvalid
	}

	return claims.OpenID, nil
}

// AuthRequired is an HTTP middleware that checks for a valid JWT token
// and injects the openid into the request context
func AuthRequired(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "" {
			http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		// Expect "Bearer <token>"
		parts := strings.SplitN(auth, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
			return
		}

		openid, err := ValidateToken(parts[1])
		if err != nil {
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		// Store openid in context for downstream handlers
		ctx := context.WithValue(r.Context(), contextKeyOpenID, openid)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// OpenIDFromContext extracts the openid from request context
func OpenIDFromContext(r *http.Request) string {
	if v := r.Context().Value(contextKeyOpenID); v != nil {
		return v.(string)
	}
	return ""
}
