/**
 * top.js — GEZA トップページコントローラー（U1）
 *
 * 依存: config.js / auth.js / state.js / avatar.js / anger-gauge.js
 *       assets/facesjs.min.js（window.faces）
 *
 * XSS-01 準拠: ユーザー入力の DOM 挿入は textContent のみ使用
 * facesjs SVG 挿入のみ innerHTML 例外（ライブラリ生成コンテンツ）
 */

(function () {
  "use strict";

  // ================================================================
  // 定数
  // ================================================================
  const INITIAL_ANGER      = 80;
  const INITIAL_TRUST      = 10;
  const INITIAL_DIFFICULTY = 50;

  const MODE_CONFIG = [
    {
      id: "real",
      label: "実案件モード",
      icon: "💼",
      desc: "実際の謝罪の練習",
      target: "pages/inception.html",
      available: false,
    },
    {
      id: "story",
      label: "ストーリーモード",
      icon: "📖",
      desc: "物語の謝罪シナリオ",
      target: "pages/story.html",
      available: false,
    },
    {
      id: "karte",
      label: "謝罪カルテ",
      icon: "📋",
      desc: "謝罪履歴と分析",
      target: "pages/karte.html",
      available: false,
    },
    {
      id: "manager",
      label: "上司向けFB",
      icon: "👔",
      desc: "上司へのフィードバック",
      target: "pages/manager.html",
      available: false,
    },
  ];

  // ================================================================
  // StateManager 初期値セットアップ
  // ================================================================
  function _initState() {
    StateManager.set("auth", {
      isAuthenticated: false,
      idToken: null,
      accessToken: null,
      tokenExpiry: null,
    });
    StateManager.set("bossAvatar", {
      faceConfig: null,
      angerLevel: INITIAL_ANGER,
      trustLevel: INITIAL_TRUST,
      difficultyLevel: INITIAL_DIFFICULTY,
    });
    StateManager.set("ui", {
      currentSection: "login",
      mfaChallengeActive: false,
      cognitoSession: null,
      challengeParameters: {},
      isLoading: false,
      loginError: null,
      mfaError: null,
    });
  }

  // ================================================================
  // セクション表示切り替え
  // ================================================================
  function _showSection(sectionId) {
    // ローディングを非表示
    const loading = document.getElementById("app-loading");
    if (loading) loading.hidden = true;

    document.querySelectorAll(".page-section").forEach((s) => {
      s.hidden = true;
    });
    const target = document.getElementById(sectionId);
    if (target) target.hidden = false;
    StateManager.set("ui", Object.assign({}, StateManager.get("ui"), {
      currentSection: sectionId === "login-section" ? "login" : "top",
    }));
  }

  // ================================================================
  // アバター初期化（faceConfig 生成のみ、描画はログイン成功後）
  // ================================================================
  function _initAvatar() {
    if (!window.facesjs) {
      console.warn("facesjs not loaded");
      return;
    }
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const faceConfig = window.facesjs.generate({ seed: arr[0] });
    StateManager.set("bossAvatar", Object.assign({}, StateManager.get("bossAvatar"), { faceConfig }));
    // 描画は _onLoginSuccess() → requestAnimationFrame で実施
  }

  function _renderAvatar(containerId, faceConfig) {
    if (!window.facesjs) return;
    try {
      window.facesjs.display(containerId, faceConfig);

      const container = document.getElementById(containerId);
      if (!container) return;
      const svg = container.querySelector("svg");
      if (!svg) return;

      // preserveAspectRatio: 上部中央寄せ + スライス（顔を上端に）
      svg.setAttribute("preserveAspectRatio", "xMidYMin slice");

      // 全パーツを face-group でラップ → headIdle アニメーション適用
      if (!svg.querySelector("#face-group")) {
        const fg = document.createElementNS("http://www.w3.org/2000/svg", "g");
        fg.id = "face-group";
        Array.from(svg.children).forEach(function (child) {
          const tag = child.tagName.toLowerCase();
          if (tag === "defs" || tag === "style") return;
          fg.appendChild(child);
        });
        svg.appendChild(fg);
      }
    } catch (e) {
      console.warn("Avatar render error", e);
    }
  }

  // ================================================================
  // ログイン成功時のアバター拡大トランジション（W-2）
  // ================================================================
  function _expandAvatar() {
    const loginContainer = document.getElementById("avatar-container-login");
    if (loginContainer) {
      loginContainer.classList.replace("small", "large");
    }
    if (window.AvatarController) {
      AvatarController.startAnimation();
    }
  }

  // ================================================================
  // 認証状態チェック（並行実行 B）
  // ================================================================
  async function _checkAuthState() {
    const refreshToken = localStorage.getItem("geza_refresh_token");
    if (!refreshToken) {
      _showSection("login-section");
      return;
    }

    try {
      await AuthModule.silentRefresh();
      _onLoginSuccess();
    } catch {
      // refreshToken が無効 → ログイン画面
      _showSection("login-section");
    }
  }

  // ================================================================
  // ログイン成功後の処理
  // ================================================================
  function _onLoginSuccess() {
    StateManager.set("auth", Object.assign({}, StateManager.get("auth"), {
      isAuthenticated: true,
    }));
    _setupGauges();
    _setupModeSelector();
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.hidden = false;
    _showSection("top-section");

    // セクション表示後にアバター描画（getBBox が正しく動作するよう rAF で遅延）
    requestAnimationFrame(function () {
      const boss = StateManager.get("bossAvatar");
      if (boss && boss.faceConfig) {
        _renderAvatar("avatar-container-top", boss.faceConfig);
      }
    });
  }

  // ================================================================
  // ログインフォームのセットアップ
  // ================================================================
  function _setupLoginForm() {
    const form       = document.getElementById("login-form");
    const emailInput = document.getElementById("email-input");
    const passInput  = document.getElementById("password-input");
    const passToggle = document.getElementById("password-toggle");
    const loginBtn   = document.getElementById("login-btn");
    const errorDiv   = document.getElementById("login-error");

    if (!form) return;

    // パスワード表示トグル
    if (passToggle) {
      passToggle.addEventListener("click", function () {
        const isText = passInput.type === "text";
        passInput.type = isText ? "password" : "text";
        // textContent で更新（XSS-01 準拠）
        passToggle.textContent = isText ? "👁" : "🙈";
      });
    }

    // 入力変化でエラークリア
    emailInput && emailInput.addEventListener("input", () => _clearError(errorDiv));
    passInput  && passInput.addEventListener("input",  () => _clearError(errorDiv));

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const email    = (emailInput?.value ?? "").trim();
      const password = passInput?.value ?? "";

      // バリデーション
      const emailErr = _validateEmail(email);
      if (emailErr) { _showError(errorDiv, emailErr); return; }
      const passErr = _validatePassword(password);
      if (passErr)  { _showError(errorDiv, passErr);  return; }

      _setLoading(loginBtn, true);
      _clearError(errorDiv);

      try {
        const result = await AuthModule.login(email, password);

        if (result.challengeName === "SOFTWARE_TOKEN_MFA") {
          // MFA チャレンジ
          StateManager.set("ui", Object.assign({}, StateManager.get("ui"), {
            mfaChallengeActive: true,
            cognitoSession: result.cognitoSession,
          }));
          _showMFAForm();
        } else if (result.challengeName === "NEW_PASSWORD_REQUIRED") {
          // 初回パスワード変更チャレンジ
          StateManager.set("ui", Object.assign({}, StateManager.get("ui"), {
            cognitoSession: result.cognitoSession,
            challengeParameters: result.challengeParameters ?? {},
          }));
          _showNewPasswordForm();
        } else if (result.challengeName === "MFA_SETUP") {
          // MFA 未設定 → TOTP 設定フロー
          await _startTOTPSetup(result.cognitoSession);
        } else {
          // MFA なし
          _onLoginSuccess();
        }
      } catch (err) {
        _showError(errorDiv, _cognitoErrorMessage(err.code));
      } finally {
        _setLoading(loginBtn, false);
      }
    });
  }

  // ================================================================
  // MFA フォームのセットアップ
  // ================================================================
  function _setupMFAForm() {
    const mfaForm   = document.getElementById("mfa-form");
    const totpInput = document.getElementById("totp-input");
    const mfaBtn    = document.getElementById("mfa-submit-btn");
    const errorDiv  = document.getElementById("mfa-error");
    const backBtn   = document.getElementById("mfa-back-btn");

    if (!mfaForm) return;

    totpInput && totpInput.addEventListener("input", () => _clearError(errorDiv));

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        _hideMFAForm();
        StateManager.set("ui", Object.assign({}, StateManager.get("ui"), {
          mfaChallengeActive: false,
          cognitoSession: null,
        }));
      });
    }

    mfaForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const code = (totpInput?.value ?? "").trim();

      if (!/^\d{6}$/.test(code)) {
        _showError(errorDiv, "6桁の認証コードを入力してください");
        return;
      }

      const ui = StateManager.get("ui");
      _setLoading(mfaBtn, true);
      _clearError(errorDiv);

      try {
        await AuthModule.submitMFA(code, ui.cognitoSession);
        _onLoginSuccess();
      } catch (err) {
        console.error("[MFA] error code:", err.code, "session:", ui.cognitoSession ? "set" : "null", err);
        _showError(errorDiv, _cognitoErrorMessage(err.code));
        // セッション無効・期限切れ → ログインフォームへ戻す
        const resetCodes = ["NotAuthorizedException", "ExpiredCodeException", "InvalidParameterException"];
        if (!err.code || resetCodes.includes(err.code)) {
          setTimeout(() => _hideMFAForm(), 2000);
        }
      } finally {
        _setLoading(mfaBtn, false);
        if (totpInput) totpInput.value = "";
      }
    });
  }

  function _showMFAForm() {
    const loginForm = document.getElementById("login-form");
    const mfaForm   = document.getElementById("mfa-form");
    if (loginForm) loginForm.hidden = true;
    if (mfaForm)   mfaForm.hidden   = false;
    document.getElementById("totp-input")?.focus();
  }

  function _hideMFAForm() {
    const loginForm = document.getElementById("login-form");
    const mfaForm   = document.getElementById("mfa-form");
    if (loginForm) loginForm.hidden = false;
    if (mfaForm)   mfaForm.hidden   = true;
  }

  // ================================================================
  // 新パスワードフォーム（NEW_PASSWORD_REQUIRED チャレンジ）
  // ================================================================
  function _showNewPasswordForm() {
    ["login-form", "mfa-form", "totp-setup-form"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    const form = document.getElementById("new-password-form");
    if (form) form.hidden = false;
    document.getElementById("new-password-input")?.focus();
  }

  function _setupNewPasswordForm() {
    const form       = document.getElementById("new-password-form");
    const pwInput    = document.getElementById("new-password-input");
    const pwConfirm  = document.getElementById("new-password-confirm-input");
    const pwToggle   = document.getElementById("new-password-toggle");
    const submitBtn  = document.getElementById("new-password-btn");
    const errorDiv   = document.getElementById("new-password-error");

    if (!form) return;

    if (pwToggle) {
      pwToggle.addEventListener("click", function () {
        const isText = pwInput.type === "text";
        pwInput.type = isText ? "password" : "text";
        pwToggle.textContent = isText ? "👁" : "🙈";
      });
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const newPw   = pwInput?.value ?? "";
      const confirm = pwConfirm?.value ?? "";

      // バリデーション
      if (newPw.length < 12) {
        _showError(errorDiv, "パスワードは12文字以上で入力してください");
        return;
      }
      if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/[0-9]/.test(newPw) || !/[^A-Za-z0-9]/.test(newPw)) {
        _showError(errorDiv, "大文字・小文字・数字・記号をすべて含めてください");
        return;
      }
      if (newPw !== confirm) {
        _showError(errorDiv, "パスワードが一致しません");
        return;
      }

      _setLoading(submitBtn, true);
      _clearError(errorDiv);

      try {
        const ui = StateManager.get("ui");
        const result = await AuthModule.submitNewPassword(
          newPw,
          ui.cognitoSession,
          ui.challengeParameters ?? {}
        );

        if (result.challengeName === "MFA_SETUP") {
          await _startTOTPSetup(result.cognitoSession);
        } else if (result.challengeName === "SOFTWARE_TOKEN_MFA") {
          StateManager.set("ui", Object.assign({}, StateManager.get("ui"), {
            mfaChallengeActive: true,
            cognitoSession: result.cognitoSession,
          }));
          _showMFAForm();
        } else {
          _onLoginSuccess();
        }
      } catch (err) {
        console.error("[NewPassword] error code:", err.code, err);
        _showError(errorDiv, _cognitoErrorMessage(err.code));
      } finally {
        _setLoading(submitBtn, false);
      }
    });
  }

  // ================================================================
  // TOTP 設定フォーム（MFA_SETUP チャレンジ）
  // ================================================================
  async function _startTOTPSetup(cognitoSession) {
    try {
      const { secretCode, cognitoSession: newSession } = await AuthModule.setupTOTP(cognitoSession);
      StateManager.set("ui", Object.assign({}, StateManager.get("ui"), {
        cognitoSession: newSession,
      }));

      // シークレットキーをテキストで表示
      const secretEl = document.getElementById("totp-secret-display");
      if (secretEl) secretEl.textContent = secretCode;  // XSS-01 準拠

      // QR コード生成（otpauth URI 形式）
      const accountName = encodeURIComponent(AuthModule._currentEmail ?? "user");
      const issuer      = encodeURIComponent("GEZA");
      const otpauthUri  = `otpauth://totp/${issuer}:${accountName}?secret=${secretCode}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      const qrContainer = document.getElementById("totp-qr-container");
      if (qrContainer) {
        qrContainer.innerHTML = "";  // 既存QRをクリア
        if (window.QRCode) {
          new window.QRCode(qrContainer, {
            text: otpauthUri,
            width: 180,
            height: 180,
            colorDark: "#1A1A1A",
            colorLight: "#FFFFFF",
            correctLevel: window.QRCode.CorrectLevel.M,
          });
        }
      }

      ["login-form", "mfa-form", "new-password-form"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
      });
      const setupForm = document.getElementById("totp-setup-form");
      if (setupForm) setupForm.hidden = false;
      document.getElementById("totp-setup-code-input")?.focus();
    } catch (err) {
      _showGlobalBanner("TOTP の設定取得に失敗しました。ページを再読み込みしてください。");
    }
  }

  function _setupTOTPSetupForm() {
    const form       = document.getElementById("totp-setup-form");
    const codeInput  = document.getElementById("totp-setup-code-input");
    const submitBtn  = document.getElementById("totp-setup-btn");
    const errorDiv   = document.getElementById("totp-setup-error");
    const copyBtn    = document.getElementById("totp-secret-copy-btn");

    if (!form) return;

    // コピーボタン
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        const secretEl = document.getElementById("totp-secret-display");
        const secret = secretEl?.textContent ?? "";
        if (secret && navigator.clipboard) {
          navigator.clipboard.writeText(secret).then(() => {
            copyBtn.textContent = "コピー済み ✓";
            setTimeout(() => { copyBtn.textContent = "コピー"; }, 2000);
          }).catch(() => {});
        }
      });
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const code = (codeInput?.value ?? "").trim();

      if (!/^\d{6}$/.test(code)) {
        _showError(errorDiv, "6桁の認証コードを入力してください");
        return;
      }

      _setLoading(submitBtn, true);
      _clearError(errorDiv);

      try {
        const ui = StateManager.get("ui");
        const { cognitoSession: mfaSession } = await AuthModule.verifyTOTPSetup(code, ui.cognitoSession);
        console.log("[TOTP setup] SUCCESS, mfaSession:", mfaSession ? "set" : "null");

        if (codeInput) codeInput.value = "";

        // TOTP設定完了。セッション引き継ぎは不安定なため、再ログインを促す
        _showGlobalBanner(
          "認証アプリの登録が完了しました。メールアドレスと新しいパスワードで再度ログインしてください。",
          "success"
        );
        // フォーム状態をリセットしてログイン画面へ
        StateManager.set("ui", Object.assign({}, StateManager.get("ui"), {
          cognitoSession: null,
          challengeParameters: {},
          mfaChallengeActive: false,
        }));
        ["totp-setup-form", "mfa-form", "new-password-form"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.hidden = true;
        });
        const loginForm = document.getElementById("login-form");
        if (loginForm) loginForm.hidden = false;
      } catch (err) {
        console.error("[TOTP verify] error:", err.code, err);
        _showError(errorDiv, _cognitoErrorMessage(err.code) ?? "認証コードが正しくありません。もう一度お試しください");
        if (codeInput) codeInput.value = "";
      } finally {
        _setLoading(submitBtn, false);
      }
    });
  }

  // ================================================================
  // ゲージセットアップ
  // ================================================================
  function _setupGauges() {
    const boss = StateManager.get("bossAvatar") ?? {};

    // 怒り度（anger-gauge.js 利用）
    if (window.AngerGauge) {
      AngerGauge.init("anger-gauge");
      AngerGauge.update(boss.angerLevel ?? INITIAL_ANGER);
    }

    // 信頼度
    _renderSimpleGauge("trust-gauge", boss.trustLevel ?? INITIAL_TRUST, "trust");
    // 難易度
    _renderSimpleGauge("difficulty-gauge", boss.difficultyLevel ?? INITIAL_DIFFICULTY, "difficulty");
  }

  function _renderSimpleGauge(containerId, value, cssClass) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // XSS-01: innerHTML は信頼済み固定構造のみ使用
    const clamped = Math.max(0, Math.min(100, value));
    container.innerHTML = `
      <div class="gauge-bar-track">
        <div class="gauge-bar-fill ${cssClass}" style="width:${clamped}%"></div>
      </div>
    `;
    // ラベルの数値は textContent で更新
    const valueEl = container.closest(".gauge-item")?.querySelector(".gauge-value");
    if (valueEl) valueEl.textContent = `${clamped}`;
  }

  // ================================================================
  // モードセレクターセットアップ
  // ================================================================
  function _setupModeSelector() {
    const selector = document.getElementById("mode-selector");
    if (!selector) return;

    // ボタン要素を DOM から取得してイベント付与
    selector.querySelectorAll(".mode-btn").forEach((btn) => {
      if (btn.dataset.status === "available") {
        btn.addEventListener("click", function () {
          const target = btn.dataset.target;
          if (target) window.location.assign(target);
        });
      }
    });
  }

  // ================================================================
  // ログアウト
  // ================================================================
  function _setupLogout() {
    const logoutBtn = document.getElementById("logout-btn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async function () {
      try {
        await AuthModule.logout();
      } catch {
        // エラーでもログイン画面へ
      }
      StateManager.set("auth", { isAuthenticated: false, idToken: null, accessToken: null, tokenExpiry: null });
      // ヘッダーのログアウトボタンを非表示
      logoutBtn.hidden = true;
      _showSection("login-section");
    });
  }

  // ================================================================
  // モードボタン描画（HTML を動的生成する場合の補助）
  // DOM はindex.html で静的に定義するため通常は不要
  // ================================================================

  // ================================================================
  // バリデーション
  // ================================================================
  function _validateEmail(email) {
    if (!email) return "メールアドレスを入力してください";
    // RFC 5322 簡易チェック
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "有効なメールアドレスを入力してください";
    }
    return null;
  }

  function _validatePassword(password) {
    if (!password) return "パスワードを入力してください";
    if (password.length < 12) return "パスワードは12文字以上で入力してください";
    return null;
  }

  // ================================================================
  // エラーハンドリング
  // ================================================================
  function _cognitoErrorMessage(code) {
    const map = {
      NotAuthorizedException:        "メールアドレスまたはパスワードが正しくありません",
      UserNotFoundException:          "メールアドレスまたはパスワードが正しくありません",
      CodeMismatchException:          "認証コードが正しくありません。もう一度お試しください",
      ExpiredCodeException:           "認証コードの有効期限が切れました。ログインからやり直してください",
      PasswordResetRequiredException: "パスワードのリセットが必要です。管理者にお問い合わせください",
      UserNotConfirmedException:      "アカウントが確認されていません。管理者にお問い合わせください",
      InvalidPasswordException:       "パスワードがポリシーを満たしていません（12文字以上・大文字・小文字・数字・記号を含む）",
      InvalidParameterException:      "入力内容に問題があります。管理者にお問い合わせください",
    };
    return map[code] ?? "エラーが発生しました。しばらくしてからお試しください";
  }

  function _showError(el, message) {
    if (!el) return;
    el.textContent = message;  // XSS-01 準拠
    el.hidden = false;
  }

  function _clearError(el) {
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
  }

  function _showGlobalBanner(message, type = "error") {
    const banner = document.getElementById("global-banner");
    if (!banner) return;
    banner.textContent = message;  // XSS-01 準拠
    banner.className = "global-banner visible";
    if (type === "success") banner.classList.add("success");
    // success バナーは 4 秒後に自動消去
    if (type === "success") {
      setTimeout(() => { banner.classList.remove("visible", "success"); }, 4000);
    }
  }

  // ================================================================
  // ローディング状態
  // ================================================================
  function _setLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    const spinner = btn.querySelector(".loading-spinner");
    const label   = btn.querySelector(".btn-label");
    if (spinner) spinner.style.display = isLoading ? "inline-block" : "none";
    if (label)   label.style.opacity   = isLoading ? "0.6" : "1";
  }

  // ================================================================
  // エントリーポイント
  // ================================================================
  function init() {
    _initState();

    // A / B を並行実行
    _initAvatar();          // A: アバター生成・描画（同期）
    _setupLoginForm();
    _setupMFAForm();
    _setupNewPasswordForm();
    _setupTOTPSetupForm();
    _setupLogout();

    // B: 認証状態チェック（非同期）
    _checkAuthState().catch(() => {
      _showSection("login-section");
    });
  }

  // DOM 準備完了後に初期化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
