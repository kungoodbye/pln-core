package wx

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// SessionResponse is the result from WeChat code2Session API
type SessionResponse struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	UnionID    string `json:"unionid,omitempty"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

var (
	appID     string
	appSecret string
)

func init() {
	appID = os.Getenv("WX_APPID")
	appSecret = os.Getenv("WX_SECRET")
}

// GetAppID returns the configured WeChat AppID
func GetAppID() string { return appID }

// IsConfigured checks if WeChat credentials are set
func IsConfigured() bool { return appID != "" && appSecret != "" }

// Code2Session exchanges a wx.login code for openid and session_key
func Code2Session(code string) (*SessionResponse, error) {
	if !IsConfigured() {
		return nil, fmt.Errorf("WX_APPID or WX_SECRET not configured")
	}

	url := fmt.Sprintf(
		"https://api.weixin.qq.com/sns/jscode2session?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
		appID, appSecret, code,
	)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("code2Session request failed: %w", err)
	}
	defer resp.Body.Close()

	var result SessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("code2Session parse failed: %w", err)
	}

	if result.ErrCode != 0 {
		return nil, fmt.Errorf("code2Session error: %s (code %d)", result.ErrMsg, result.ErrCode)
	}

	return &result, nil
}
