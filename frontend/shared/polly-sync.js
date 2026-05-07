/**
 * polly-sync.js — GEZA PollySyncController（U3）
 * Polly MP3 を再生しつつ Viseme タイムコードに合わせてアバターの口パクを同期する。
 *
 * XSS-01: DOM 操作なし（コールバック経由）
 * 依存: avatar.js（AvatarController）
 */
class PollySyncController {
  constructor(avatarController) {
    this._avatar   = avatarController;
    this._audio    = null;
    this._timers   = [];
    this._blobUrl  = null;
  }

  /**
   * MP3 base64 を再生しつつ Viseme を同期する。
   * @param {string} audioBase64 - Polly MP3 base64 文字列
   * @param {Array<{time: number, value: string}>} visemes - Viseme タイムコード配列
   * @returns {Promise<void>} - 音声再生完了で resolve
   */
  playWithSync(audioBase64, visemes) {
    this.stop(); // 前回の再生を中断

    return new Promise((resolve, reject) => {
      try {
        const binary = atob(audioBase64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        this._blobUrl = URL.createObjectURL(blob);

        this._audio = new Audio(this._blobUrl);

        this._audio.onplay = () => {
          this._scheduleVisemes(visemes);
        };

        this._audio.onended = () => {
          this._clearTimers();
          if (this._avatar) this._avatar.setMouthViseme("sil");
          this._revokeBlobUrl();
          resolve();
        };

        this._audio.onerror = (e) => {
          this._clearTimers();
          this._revokeBlobUrl();
          reject(new Error(`Audio playback error: ${e.type}`));
        };

        this._audio.play().catch((err) => {
          this._clearTimers();
          this._revokeBlobUrl();
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /** 再生を中断し口を sil に戻す */
  stop() {
    this._clearTimers();
    if (this._audio) {
      this._audio.onplay  = null;
      this._audio.onended = null;
      this._audio.onerror = null;
      this._audio.pause();
      this._audio = null;
    }
    this._revokeBlobUrl();
    if (this._avatar) this._avatar.setMouthViseme("sil");
  }

  // ── 内部ヘルパー ──────────────────────────────────────

  _scheduleVisemes(visemes) {
    if (!visemes || !this._avatar) return;
    for (const { time, value } of visemes) {
      const id = setTimeout(() => {
        if (this._avatar) this._avatar.setMouthViseme(value);
      }, time);
      this._timers.push(id);
    }
  }

  _clearTimers() {
    this._timers.forEach((id) => clearTimeout(id));
    this._timers = [];
  }

  _revokeBlobUrl() {
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
  }
}

window.PollySyncController = PollySyncController;
