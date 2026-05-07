/**
 * transcribe.js — GEZA TranscribeClient（U3）
 * Cognito Identity Pool 経由で Amazon Transcribe Streaming に接続し、
 * 音声をリアルタイムでテキストに変換する。
 *
 * XSS-01: DOM 操作なし（コールバック経由でテキストを返す）
 * PRIVACY-01: 音声は WebSocket で直接 Transcribe に送信。Lambda/DynamoDB には保存しない
 * 依存: auth.js（getCognitoIdentityCredentials）
 */
class TranscribeClient {
  constructor() {
    this._ws          = null;
    this._audioContext = null;
    this._processor   = null;
    this._stream      = null;
    this._onTranscript = null;
    this._silenceTimer = null;
    this._running      = false;
    this._SILENCE_MS   = 3000;
    this._REGION       = window.GEZA_CONFIG?.region ?? "ap-northeast-1";
    this._SAMPLE_RATE  = 16000;
  }

  /**
   * Transcribe Streaming を開始する。
   * @param {Function} onTranscript - (text: string, isFinal: boolean) => void
   */
  async startStreaming(onTranscript) {
    if (this._running) this.stop();
    this._onTranscript = onTranscript;
    this._running = true;

    // 1. Cognito Identity Pool から一時認証情報を取得
    const creds = await AuthModule.getCognitoIdentityCredentials();

    // 2. マイク入力取得
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // 3. AudioContext でリサンプリング（16kHz PCM）
    this._audioContext = new AudioContext({ sampleRate: this._SAMPLE_RATE });
    const source = this._audioContext.createMediaStreamSource(this._stream);

    // ScriptProcessorNode（Safari 互換）
    const bufferSize = 4096;
    this._processor = this._audioContext.createScriptProcessor(bufferSize, 1, 1);
    source.connect(this._processor);
    this._processor.connect(this._audioContext.destination);

    // 4. SigV4 署名 WebSocket URL 生成
    const wsUrl = await this._buildSignedUrl(creds);

    // 5. WebSocket 接続
    this._ws = new WebSocket(wsUrl);
    this._ws.binaryType = "arraybuffer";

    this._ws.onopen = () => {
      this._processor.onaudioprocess = (e) => {
        if (!this._running || this._ws?.readyState !== WebSocket.OPEN) return;
        const pcm = e.inputBuffer.getChannelData(0);
        const chunk = this._encodePcm(pcm);
        const frame = this._buildEventStreamFrame(chunk);
        this._ws.send(frame);
        this._resetSilenceTimer();
      };
    };

    this._ws.onmessage = (evt) => {
      try {
        const decoded = this._decodeEventStream(evt.data);
        if (!decoded) return;
        const payload = JSON.parse(decoded);
        const results = payload?.Transcript?.Results ?? [];
        for (const result of results) {
          const alt = result.Alternatives?.[0];
          if (!alt) continue;
          const text    = alt.Transcript ?? "";
          const isFinal = !result.IsPartial;
          if (text && this._onTranscript) {
            this._onTranscript(text, isFinal);
            if (isFinal) this._resetSilenceTimer();
          }
        }
      } catch {
        // パースエラーは無視
      }
    };

    this._ws.onerror = () => { this.stop(); };
    this._ws.onclose = () => { this._running = false; };

    this._resetSilenceTimer();
  }

  /** ストリーミングを停止し WebSocket をクローズする */
  stop() {
    this._running = false;
    clearTimeout(this._silenceTimer);
    if (this._processor) {
      this._processor.onaudioprocess = null;
      this._processor.disconnect();
      this._processor = null;
    }
    if (this._audioContext) {
      this._audioContext.close().catch(() => {});
      this._audioContext = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.close();
    }
    this._ws = null;
  }

  // ── 内部ヘルパー ──────────────────────────────────────

  _resetSilenceTimer() {
    clearTimeout(this._silenceTimer);
    this._silenceTimer = setTimeout(() => {
      if (this._running) this.stop();
    }, this._SILENCE_MS);
  }

  /** Float32Array → Int16 PCM バイナリ */
  _encodePcm(floatArray) {
    const buf = new ArrayBuffer(floatArray.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < floatArray.length; i++) {
      const s = Math.max(-1, Math.min(1, floatArray[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }

  /**
   * Amazon Transcribe Streaming イベントストリームフレームを構築する。
   * フォーマット: https://docs.aws.amazon.com/transcribe/latest/dg/streaming-format.html
   */
  _buildEventStreamFrame(pcmBytes) {
    const headers = this._encodeHeaders({
      ":content-type": "application/octet-stream",
      ":event-type":   "AudioEvent",
      ":message-type": "event",
    });
    const totalLength = 4 + 4 + 4 + headers.byteLength + pcmBytes.byteLength + 4;
    const buf = new ArrayBuffer(totalLength);
    const view = new DataView(buf);
    view.setUint32(0, totalLength, false);
    view.setUint32(4, headers.byteLength, false);
    // CRC フィールドは 0（Transcribe は検証しない）
    view.setUint32(8, 0, false);
    new Uint8Array(buf, 12, headers.byteLength).set(new Uint8Array(headers));
    new Uint8Array(buf, 12 + headers.byteLength, pcmBytes.byteLength).set(pcmBytes);
    // trailing CRC
    view.setUint32(totalLength - 4, 0, false);
    return buf;
  }

  _encodeHeaders(headers) {
    const parts = [];
    for (const [name, value] of Object.entries(headers)) {
      const nameBytes  = new TextEncoder().encode(name);
      const valueBytes = new TextEncoder().encode(value);
      const part = new Uint8Array(1 + nameBytes.length + 2 + 1 + 2 + valueBytes.length);
      let offset = 0;
      part[offset++] = nameBytes.length;
      part.set(nameBytes, offset); offset += nameBytes.length;
      // type: string = 7
      part[offset++] = 0;
      part[offset++] = 7;
      part[offset++] = 0;
      part[offset++] = (valueBytes.length >> 8) & 0xff;
      part[offset++] = valueBytes.length & 0xff;
      part.set(valueBytes, offset);
      parts.push(part);
    }
    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { result.set(p, pos); pos += p.length; }
    return result.buffer;
  }

  /** イベントストリームデコード（ペイロード文字列を返す） */
  _decodeEventStream(data) {
    try {
      const view = new DataView(data);
      const totalLength   = view.getUint32(0, false);
      const headersLength = view.getUint32(4, false);
      if (totalLength !== data.byteLength) return null;
      const payloadStart = 12 + headersLength;
      const payloadEnd   = totalLength - 4;
      const payloadBytes = new Uint8Array(data, payloadStart, payloadEnd - payloadStart);
      return new TextDecoder().decode(payloadBytes);
    } catch {
      return null;
    }
  }

  /** SigV4 署名付き WebSocket URL を生成する */
  async _buildSignedUrl(creds) {
    const region   = this._REGION;
    const endpoint = `transcribestreaming.${region}.amazonaws.com`;
    const path     = "/stream-transcription-websocket";
    const query = [
      "language-code=ja-JP",
      `media-encoding=pcm`,
      `sample-rate=${this._SAMPLE_RATE}`,
    ].join("&");

    const now       = new Date();
    const dateStamp = _isoDate(now);
    const amzDate   = _isoDateTime(now);
    const service   = "transcribe";
    const credScope = `${dateStamp}/${region}/${service}/aws4_request`;

    const signedHeaders = "host";
    const canonicalHeaders = `host:${endpoint}\n`;

    const canonicalQuery = [
      `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
      `X-Amz-Credential=${encodeURIComponent(`${creds.accessKeyId}/${credScope}`)}`,
      `X-Amz-Date=${amzDate}`,
      `X-Amz-Expires=300`,
      `X-Amz-Security-Token=${encodeURIComponent(creds.sessionToken)}`,
      `X-Amz-SignedHeaders=${signedHeaders}`,
      query,
    ].join("&");

    const canonicalRequest = [
      "GET",
      path,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", // empty body hash
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credScope,
      await _sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = await _getSigningKey(creds.secretAccessKey, dateStamp, region, service);
    const signature  = await _hmacHex(signingKey, stringToSign);

    const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return `wss://${endpoint}${path}?${finalQuery}`;
  }
}

// ── SigV4 ユーティリティ ─────────────────────────────────────────────────────

function _isoDate(d) {
  return d.toISOString().replace(/-/g, "").slice(0, 8);
}

function _isoDateTime(d) {
  return d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

async function _sha256Hex(message) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function _hmac(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", typeof key === "string" ? new TextEncoder().encode(key) : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function _hmacHex(key, message) {
  const buf = await _hmac(key, message);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function _getSigningKey(secretKey, dateStamp, region, service) {
  const kDate    = await _hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion  = await _hmac(kDate, region);
  const kService = await _hmac(kRegion, service);
  return _hmac(kService, "aws4_request");
}

window.TranscribeClient = TranscribeClient;
