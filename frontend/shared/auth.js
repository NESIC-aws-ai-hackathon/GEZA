/**
 * auth.js — GEZA 認証モジュール
 * Cognito ホスト型 UI / User Pool を使用。
 * トークンは sessionStorage のみに保存する（AUTH-05）。
 * XSS 対策: DOM 挿入は textContent のみ使用。
 */
const AuthModule = (() => {
  const _SESSION_KEY_ID_TOKEN = "geza_id_token";
  const _SESSION_KEY_ACCESS_TOKEN = "geza_access_token";
  const _SESSION_KEY_REFRESH_TOKEN = "geza_refresh_token";

  const _USER_POOL_ID = window.GEZA_CONFIG?.userPoolId ?? "";
  const _CLIENT_ID = window.GEZA_CONFIG?.clientId ?? "";
  const _REGION = window.GEZA_CONFIG?.region ?? "ap-northeast-1";
  const _TOKEN_ENDPOINT = `https://cognito-idp.${_REGION}.amazonaws.com`;

  /** 現在の ID トークンを返す（なければ null） */
  function getIdToken() {
    return sessionStorage.getItem(_SESSION_KEY_ID_TOKEN);
  }

  /** 現在のアクセストークンを返す（なければ null） */
  function getAccessToken() {
    return sessionStorage.getItem(_SESSION_KEY_ACCESS_TOKEN);
  }

  /** ログイン済みかどうかを返す */
  function isAuthenticated() {
    const token = getIdToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  /** リフレッシュトークンでトークンを更新する */
  async function refreshTokens() {
    const refreshToken = sessionStorage.getItem(_SESSION_KEY_REFRESH_TOKEN);
    if (!refreshToken) throw new Error("No refresh token");

    const resp = await fetch(`${_TOKEN_ENDPOINT}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
      },
      body: JSON.stringify({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: _CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    });

    if (!resp.ok) {
      _clearTokens();
      throw new Error("Token refresh failed");
    }

    const data = await resp.json();
    const result = data.AuthenticationResult;
    sessionStorage.setItem(_SESSION_KEY_ID_TOKEN, result.IdToken);
    sessionStorage.setItem(_SESSION_KEY_ACCESS_TOKEN, result.AccessToken);
    return result.IdToken;
  }

  /** Cognito のホスト型 UI にリダイレクト */
  function redirectToLogin() {
    const loginUrl = window.GEZA_CONFIG?.loginUrl ?? "";
    window.location.assign(loginUrl);
  }

  /** ログアウト処理 */
  function logout() {
    _clearTokens();
    const logoutUrl = window.GEZA_CONFIG?.logoutUrl ?? "";
    window.location.assign(logoutUrl);
  }

  /** 認可コードからトークンを取得する（コールバックページで呼ぶ） */
  async function handleCallback(code) {
    const redirectUri = window.GEZA_CONFIG?.redirectUri ?? "";
    const domainUrl = window.GEZA_CONFIG?.cognitoDomainUrl ?? "";

    const resp = await fetch(`${domainUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: _CLIENT_ID,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!resp.ok) throw new Error("Token exchange failed");

    const data = await resp.json();
    sessionStorage.setItem(_SESSION_KEY_ID_TOKEN, data.id_token);
    sessionStorage.setItem(_SESSION_KEY_ACCESS_TOKEN, data.access_token);
    sessionStorage.setItem(_SESSION_KEY_REFRESH_TOKEN, data.refresh_token);
    return data.id_token;
  }

  function _clearTokens() {
    sessionStorage.removeItem(_SESSION_KEY_ID_TOKEN);
    sessionStorage.removeItem(_SESSION_KEY_ACCESS_TOKEN);
    sessionStorage.removeItem(_SESSION_KEY_REFRESH_TOKEN);
  }

  return {
    getIdToken,
    getAccessToken,
    isAuthenticated,
    refreshTokens,
    redirectToLogin,
    logout,
    handleCallback,
  };
})();

window.AuthModule = AuthModule;
