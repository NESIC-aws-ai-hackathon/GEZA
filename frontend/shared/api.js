/**
 * api.js — GEZA API クライアント
 * - 全リクエストに Authorization ヘッダー（ID トークン）を付与
 * - 401 受信時はトークン自動リフレッシュ → 1 度だけリトライ
 * - 非同期ジョブのポーリング: 1s→2s→4s→5s→5s... maxWait=60s maxInterval=5s
 * XSS 対策: DOM 挿入は呼び出し元で textContent を使うこと（ここでは DOM 操作しない）。
 */
const ApiClient = (() => {
  const MAX_INTERVAL_MS = 5000;
  const MAX_WAIT_MS = 60000;

  function _apiBase() {
    return window.GEZA_CONFIG?.apiBaseUrl ?? "";
  }

  async function _fetch(path, options = {}, retry = true) {
    const token = AuthModule.getIdToken();
    const headers = Object.assign(
      { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
      options.headers ?? {}
    );

    const resp = await fetch(`${_apiBase()}${path}`, Object.assign({}, options, { headers }));

    if (resp.status === 401 && retry) {
      try {
        await AuthModule.silentRefresh();
      } catch {
        AuthModule.requireAuth();
        throw new Error("Session expired");
      }
      return _fetch(path, options, false);
    }

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`API error ${resp.status}: ${body}`);
    }

    return resp.json();
  }

  /** GET リクエスト */
  function get(path) {
    return _fetch(path, { method: "GET" });
  }

  /** POST リクエスト */
  function post(path, body) {
    return _fetch(path, { method: "POST", body: JSON.stringify(body) });
  }

  /**
   * 非同期ジョブのポーリング
   * @param {string} jobId
   * @param {Function} onProgress - status 変化時に呼ばれるコールバック
   * @returns {Promise<object>} 完了した result
   */
  async function pollJob(jobId, onProgress) {
    const delays = [1000, 2000, 4000];
    let elapsed = 0;
    let attempt = 0;

    while (elapsed < MAX_WAIT_MS) {
      const waitMs = attempt < delays.length ? delays[attempt] : MAX_INTERVAL_MS;
      await new Promise((r) => setTimeout(r, waitMs));
      elapsed += waitMs;
      attempt++;

      const data = await get(`/jobs/${jobId}`);
      if (onProgress) onProgress(data.status);

      if (data.status === "COMPLETED") return data.result;
      if (data.status === "FAILED") throw new Error("Job failed");
    }

    throw new Error("Job timed out");
  }

  return { get, post, pollJob };
})();

window.ApiClient = ApiClient;
