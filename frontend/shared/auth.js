/**
 * auth.js — GEZA 認証モジュール（U1 更新版）
 *
 * 認証方式: Cognito REST API 直接呼び出し（USER_PASSWORD_AUTH + SOFTWARE_TOKEN_MFA）
 * トークン保管:
 *   - refreshToken → localStorage['geza_refresh_token']（ページ再ロード後も維持）
 *   - idToken / accessToken → モジュール内メモリ変数のみ（XSS-01 / AUTH-05 準拠）
 * セキュリティ: DOM 挿入は textContent のみ使用。
 */
const AuthModule = (() => {
  const _LS_REFRESH_KEY = "geza_refresh_token";

  const _REGION    = window.GEZA_CONFIG?.region     ?? "ap-northeast-1";
  const _CLIENT_ID = window.GEZA_CONFIG?.clientId   ?? "";
  const _ENDPOINT  = `https://cognito-idp.${_REGION}.amazonaws.com/`;

  // ---- メモリ内トークン（ページリロードで消える） ----
  let _idToken     = null;
  let _accessToken = null;
  let _tokenExpiry = null;  // epoch ms
  let _currentEmail = null; // チャレンジ継続用

  // ---- 公開: トークン取得 ----

  function getIdToken()     { return _idToken; }
  function getAccessToken() { return _accessToken; }

  /** 認証済みかどうかを返す（メモリ or localStorage で判定） */
  function isAuthenticated() {
    if (_accessToken && _tokenExpiry && _tokenExpiry > Date.now()) return true;
    return !!localStorage.getItem(_LS_REFRESH_KEY);
  }

  // ---- 公開: 認証フロー ----

  /**
   * メール + パスワードでログイン
   * @returns {{ challengeName: string|null, cognitoSession: string|null }} | tokens
   */
  async function login(email, password) {
    _currentEmail = email; // チャレンジ継続のためメモリに保持
    const resp = await _cognitoPost("AWSCognitoIdentityProviderService.InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: _CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const data = await _parseResponse(resp);

    if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      return {
        challengeName: "NEW_PASSWORD_REQUIRED",
        cognitoSession: data.Session,
        challengeParameters: data.ChallengeParameters ?? {},
      };
    }
    if (data.ChallengeName === "SOFTWARE_TOKEN_MFA") {
      return { challengeName: "SOFTWARE_TOKEN_MFA", cognitoSession: data.Session };
    }
    if (data.ChallengeName === "MFA_SETUP") {
      return { challengeName: "MFA_SETUP", cognitoSession: data.Session };
    }

    // MFA 不要 or 既に MFA 通過の場合（管理者設定次第）
    _handleAuthSuccess(data.AuthenticationResult);
    return { challengeName: null, cognitoSession: null };
  }

  /**
   * 管理者作成ユーザーの初回パスワード変更（NEW_PASSWORD_REQUIRED チャレンジ）
   * @param {string} newPassword
   * @param {string} cognitoSession  login() から受け取った Session
   * @param {Object} [challengeParameters={}]  login() から受け取った ChallengeParameters
   */
  async function submitNewPassword(newPassword, cognitoSession, challengeParameters = {}) {
    const challengeResponses = {
      USERNAME: _currentEmail,
      NEW_PASSWORD: newPassword,
    };

    // requiredAttributes に応じた属性を追加
    let requiredAttrs = [];
    try { requiredAttrs = JSON.parse(challengeParameters.requiredAttributes ?? "[]"); } catch { /**/ }
    let userAttrs = {};
    try { userAttrs = JSON.parse(challengeParameters.userAttributes ?? "{}"); } catch { /**/ }

    for (const attr of requiredAttrs) {
      const val = userAttrs[attr] ?? (attr === "email" ? (_currentEmail ?? "") : "");
      if (val) challengeResponses[`userAttributes.${attr}`] = val;
    }

    // requiredAttributes が空でも Cognito がメール属性を必須とするケースに備えて常に含める
    if (_currentEmail && !challengeResponses["userAttributes.email"]) {
      challengeResponses["userAttributes.email"] = _currentEmail;
    }

    const resp = await _cognitoPost("AWSCognitoIdentityProviderService.RespondToAuthChallenge", {
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ClientId: _CLIENT_ID,
      Session: cognitoSession,
      ChallengeResponses: challengeResponses,
    });
    const data = await _parseResponse(resp);

    if (data.ChallengeName === "MFA_SETUP") {
      return { challengeName: "MFA_SETUP", cognitoSession: data.Session };
    }
    if (data.ChallengeName === "SOFTWARE_TOKEN_MFA") {
      return { challengeName: "SOFTWARE_TOKEN_MFA", cognitoSession: data.Session };
    }
    if (data.AuthenticationResult) {
      _handleAuthSuccess(data.AuthenticationResult);
      return { challengeName: null, cognitoSession: null };
    }
    throw new Error(`Unexpected challenge: ${data.ChallengeName}`);
  }

  /**
   * TOTP 設定: シークレットキーを取得する（MFA_SETUP チャレンジ後に呼ぶ）
   * @param {string} cognitoSession
   * @returns {{ secretCode: string, cognitoSession: string }}
   */
  async function setupTOTP(cognitoSession) {
    const resp = await _cognitoPost("AWSCognitoIdentityProviderService.AssociateSoftwareToken", {
      Session: cognitoSession,
    });
    const data = await _parseResponse(resp);
    return { secretCode: data.SecretCode, cognitoSession: data.Session };
  }

  /**
   * TOTP 設定: 認証アプリの 6 桁コードで設定を確認する
   * @param {string} code  認証アプリに表示された 6 桁コード
   * @param {string} cognitoSession  setupTOTP() から受け取った Session
   * @returns {{ cognitoSession: string }}  SOFTWARE_TOKEN_MFA チャレンジ用 Session
   */
  async function verifyTOTPSetup(code, cognitoSession) {
    const resp = await _cognitoPost("AWSCognitoIdentityProviderService.VerifySoftwareToken", {
      Session: cognitoSession,
      UserCode: code,
      FriendlyDeviceName: "GEZA App",
    });
    const data = await _parseResponse(resp);
    if (data.Status !== "SUCCESS") throw new Error("TOTP verification failed");
    return { cognitoSession: data.Session };
  }

  /**
   * TOTP コードで MFA チャレンジに応答する
   * @param {string} totpCode  6桁数字コード
   * @param {string} cognitoSession  initiateAuth から受け取った Session トークン
   */
  async function submitMFA(totpCode, cognitoSession) {
    const resp = await _cognitoPost("AWSCognitoIdentityProviderService.RespondToAuthChallenge", {
      ChallengeName: "SOFTWARE_TOKEN_MFA",
      ClientId: _CLIENT_ID,
      Session: cognitoSession,
      ChallengeResponses: {
        USERNAME: _currentEmail ?? "",
        SOFTWARE_TOKEN_MFA_CODE: totpCode,
      },
    });

    const data = await _parseResponse(resp);
    _handleAuthSuccess(data.AuthenticationResult);
  }

  /**
   * ページロード時のサイレントリフレッシュ
   * localStorage の refreshToken を使って idToken / accessToken を再取得する。
   * @throws {Error} refreshToken がない or 期限切れの場合
   */
  async function silentRefresh() {
    const refreshToken = localStorage.getItem(_LS_REFRESH_KEY);
    if (!refreshToken) throw new Error("No refresh token");

    const resp = await _cognitoPost("AWSCognitoIdentityProviderService.InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: _CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    });

    const data = await _parseResponse(resp);
    _handleAuthSuccess(data.AuthenticationResult, /* keepRefresh= */ true);
  }

  /**
   * アクセストークンを返す（期限 5 分未満なら先にリフレッシュ）
   * API 呼び出し前に使用する。
   */
  async function getValidAccessToken() {
    if (_tokenExpiry && _tokenExpiry - Date.now() < 5 * 60 * 1000) {
      await silentRefresh();
    }
    return _accessToken;
  }

  /**
   * Cognito Identity Pool から Transcribe 用一時認証情報を取得する（U3）
   * @returns {{ accessKeyId, secretAccessKey, sessionToken }}
   */
  async function getCognitoIdentityCredentials() {
    const idToken = _idToken;
    if (!idToken) throw new Error("ID token is not available. Please login first.");

    const region         = window.GEZA_CONFIG?.region         ?? "ap-northeast-1";
    const identityPoolId = window.GEZA_CONFIG?.identityPoolId ?? "";
    const userPoolId     = window.GEZA_CONFIG?.userPoolId     ?? "";
    const providerName   = `cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    const identityEndpoint = `https://cognito-identity.${region}.amazonaws.com/`;

    // Step 1: GetId
    const getIdResp = await fetch(identityEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityService.GetId",
      },
      body: JSON.stringify({
        IdentityPoolId: identityPoolId,
        Logins: { [providerName]: idToken },
      }),
    });
    if (!getIdResp.ok) throw new Error(`GetId failed: ${getIdResp.status}`);
    const { IdentityId } = await getIdResp.json();

    // Step 2: GetCredentialsForIdentity
    const getCredsResp = await fetch(identityEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityService.GetCredentialsForIdentity",
      },
      body: JSON.stringify({
        IdentityId,
        Logins: { [providerName]: idToken },
      }),
    });
    if (!getCredsResp.ok) throw new Error(`GetCredentials failed: ${getCredsResp.status}`);
    const data = await getCredsResp.json();
    const creds = data.Credentials;
    return {
      accessKeyId:     creds.AccessKeyId,
      secretAccessKey: creds.SecretKey,
      sessionToken:    creds.SessionToken,
    };
  }

  /**
   * グローバルサインアウト（全デバイスのセッション無効化）
   */  async function logout() {
    if (_accessToken) {
      try {
        await _cognitoPost("AWSCognitoIdentityProviderService.GlobalSignOut", {
          AccessToken: _accessToken,
        });
      } catch {
        // ログアウト失敗は無視してローカルクリアを優先
      }
    }
    _clearTokens();
  }

  /**
   * 認証ガード — 未認証なら index.html にリダイレクト
   * @returns {boolean} 認証済みなら true
   */
  function requireAuth() {
    if (!localStorage.getItem(_LS_REFRESH_KEY)) {
      window.location.replace("index.html");
      return false;
    }
    return true;
  }

  // ---- 内部ヘルパー ----

  function _handleAuthSuccess(result, keepRefresh = false) {
    if (!result) throw new Error("AuthenticationResult is missing");
    _idToken     = result.IdToken;
    _accessToken = result.AccessToken;
    // exp フィールド（秒）をミリ秒に変換してキャッシュ
    try {
      const payload = JSON.parse(atob(_idToken.split(".")[1]));
      _tokenExpiry = payload.exp * 1000;
    } catch {
      _tokenExpiry = Date.now() + 3600 * 1000;  // fallback: 1 時間
    }
    if (!keepRefresh && result.RefreshToken) {
      localStorage.setItem(_LS_REFRESH_KEY, result.RefreshToken);
    }
  }

  function _clearTokens() {
    _idToken     = null;
    _accessToken = null;
    _tokenExpiry = null;
    localStorage.removeItem(_LS_REFRESH_KEY);
  }

  async function _cognitoPost(target, body) {
    return fetch(_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": target,
      },
      body: JSON.stringify(body),
    });
  }

  async function _parseResponse(resp) {
    const data = await resp.json();
    if (!resp.ok) {
      const code = data.__type ?? data.code ?? "UnknownError";
      const err  = new Error(data.message ?? "Cognito error");
      err.code   = code;
      if (!resp.ok && (code === "NotAuthorizedException" || code === "InvalidParameterException")) {
        _clearTokens();
      }
      throw err;
    }
    return data;
  }

  return {
    getIdToken,
    getAccessToken,
    getValidAccessToken,
    isAuthenticated,
    get _currentEmail() { return _currentEmail; },
    login,
    submitNewPassword,
    setupTOTP,
    verifyTOTPSetup,
    submitMFA,
    silentRefresh,
    logout,
    requireAuth,
    getCognitoIdentityCredentials,
  };
})();

window.AuthModule = AuthModule;

