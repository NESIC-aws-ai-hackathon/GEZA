/**
 * GEZA プロトタイプ - facesjs統合版 v3
 *
 * v3 修正:
 * - 全パーツを <g id="face-group"> でラップ → 頭・髪・目が一体で揺れる
 * - 目/眉に CSS wrapper <g> を追加 → SVG transform 属性を壊さず CSS 制御
 * - preserveAspectRatio を xMidYMin slice に変更 → 中央配置+大きく表示
 * - 感情を5段階に拡張（怒り/苛立ち/失望/驚き/納得）
 * - 顔パーツを明示指定（female3 eye 等）で安定した見た目
 */

const API_URL = window.GEZA_API_URL || "/api/chat";

let conversationHistory = [];
let turnCount = 0;
let currentEmotion = "anger";
let currentAudio = null;
let visemeTimer = null;
let isSpeaking = false;
let blinkTimer = null;

// パーツ参照キャッシュ
let faceRefs = {
    svg: null,
    faceGroup: null,      // 全パーツラッパー
    mouthG: null,
    eyeLG: null,  eyeRG: null,
    browLG: null, browRG: null,
    eyeLWrap: null, eyeRWrap: null,   // CSS制御用ラッパー
    browLWrap: null, browRWrap: null,
    _eyeBaseTransform: "scaleY(1)",
};

let faceConfig = null;

// ============================================================
// facesjs 初期化
// ============================================================
function initFace() {
    const { generate, display } = window.facesjs;

    faceConfig = generate(undefined, { gender: "female", race: "asian" });

    // 安定した見た目のために明示指定
    faceConfig.fatness = 0.15;
    faceConfig.eye = { id: "female3", angle: 0 };
    faceConfig.eyebrow = { id: "female2", angle: -3 };
    faceConfig.mouth = { id: "closed", size: 1.0, flip: false };
    faceConfig.nose = { id: "nose1", size: 0.65, flip: false };
    faceConfig.ear = { id: "ear1", size: 0.7 };
    faceConfig.eyeLine = { id: "line1" };
    faceConfig.accessories = { id: "none" };
    faceConfig.glasses = { id: "none" };
    faceConfig.facialHair = { id: "none" };
    faceConfig.smileLine = { id: "none" };
    faceConfig.miscLine = { id: "none" };

    const container = document.getElementById("facesjs-container");
    display(container, faceConfig);

    // --- SVG 補正 ---
    const svg = container.querySelector("svg");
    // 中央配置 + 幅フィット（下部の体はクリップ）
    svg.setAttribute("preserveAspectRatio", "xMidYMin slice");

    // 全パーツを1つのグループにまとめる（一体で揺れるように）
    wrapAllInFaceGroup(svg);

    // 参照取得
    refreshFaceRefs(container);

    // 目・眉を CSS wrapper で包む（SVG transform を壊さない）
    wrapAnimatableFeatures();

    // facesjs 口を非表示 → overlay が担当
    if (faceRefs.mouthG) faceRefs.mouthG.style.opacity = "0";

    addMouthOverlay();
    initBlink();
    initIdleGaze();

    console.log("facesjs v3 init:", {
        faceGroup: !!faceRefs.faceGroup,
        mouth: !!faceRefs.mouthG, eyeL: !!faceRefs.eyeLG,
        eyeR: !!faceRefs.eyeRG, browLW: !!faceRefs.browLWrap,
    });
}

// 全描画要素を <g id="face-group"> に集約
function wrapAllInFaceGroup(svg) {
    const fg = document.createElementNS("http://www.w3.org/2000/svg", "g");
    fg.id = "face-group";
    const children = Array.from(svg.children);
    children.forEach(child => {
        const tag = child.tagName.toLowerCase();
        if (tag === "defs" || tag === "style") return;
        fg.appendChild(child);
    });
    svg.appendChild(fg);
}

// 目・眉を外側 <g> で包み CSS transform を安全に適用
function svgWrap(el, cls) {
    if (!el) return null;
    const w = document.createElementNS("http://www.w3.org/2000/svg", "g");
    w.setAttribute("class", cls);
    w.style.transformBox = "fill-box";
    w.style.transformOrigin = "center center";
    el.parentNode.insertBefore(w, el);
    w.appendChild(el);
    return w;
}

function wrapAnimatableFeatures() {
    faceRefs.eyeLWrap  = svgWrap(faceRefs.eyeLG, "eye-wrap");
    faceRefs.eyeRWrap  = svgWrap(faceRefs.eyeRG, "eye-wrap");
    faceRefs.browLWrap = svgWrap(faceRefs.browLG, "brow-wrap");
    faceRefs.browRWrap = svgWrap(faceRefs.browRG, "brow-wrap");
}

function refreshFaceRefs(container) {
    faceRefs.svg = container.querySelector("svg");
    if (!faceRefs.svg) return;
    faceRefs.faceGroup = faceRefs.svg.querySelector("#face-group");
    faceRefs.mouthG  = faceRefs.svg.querySelector('[data-feature="mouth"]');
    faceRefs.eyeLG   = faceRefs.svg.querySelector('[data-feature="eye"][data-index="0"]');
    faceRefs.eyeRG   = faceRefs.svg.querySelector('[data-feature="eye"][data-index="1"]');
    faceRefs.browLG  = faceRefs.svg.querySelector('[data-feature="eyebrow"][data-index="0"]');
    faceRefs.browRG  = faceRefs.svg.querySelector('[data-feature="eyebrow"][data-index="1"]');
}

// ============================================================
// 口パクオーバーレイ — face-group 内に追加
// ============================================================
function addMouthOverlay() {
    if (!faceRefs.mouthG || !faceRefs.faceGroup) return;
    const old = faceRefs.faceGroup.querySelector("#mouth-overlay");
    if (old) old.remove();

    const bb = faceRefs.mouthG.getBBox();
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.id = "mouth-overlay";
    g.setAttribute("transform", `translate(${cx}, ${cy})`);
    g.innerHTML = `<path id="mouth-shape" d="M -15,0 Q 0,-8 15,0"
        stroke="#a0504a" stroke-width="3" fill="#b85a4a" fill-opacity="0" stroke-linecap="round"/>`;
    faceRefs.faceGroup.appendChild(g);
}

// ============================================================
// 瞬き — wrapper の scaleY で実現（SVG transform は保持）
// ============================================================
function initBlink() { scheduleBlink(); }

function scheduleBlink() {
    const delay = 2500 + Math.random() * 4000;
    blinkTimer = setTimeout(() => { doBlink(); scheduleBlink(); }, delay);
}

function doBlink() {
    [faceRefs.eyeLWrap, faceRefs.eyeRWrap].forEach(w => {
        if (!w) return;
        w.style.transition = "transform 0.06s ease-in";
        w.style.transform = "scaleY(0.05)";
    });
    setTimeout(() => {
        const base = faceRefs._eyeBaseTransform || "scaleY(1)";
        [faceRefs.eyeLWrap, faceRefs.eyeRWrap].forEach(w => {
            if (!w) return;
            w.style.transition = "transform 0.12s ease-out";
            w.style.transform = base;
        });
    }, 80);
}

// ============================================================
// アイドル視線 — wrapper を微小 translate で揺らす
// ============================================================
function initIdleGaze() {
    function shift() {
        if (isSpeaking || !faceRefs.eyeLWrap) {
            setTimeout(shift, 4000 + Math.random() * 4000);
            return;
        }
        const ox = (Math.random() - 0.5) * 4;
        const oy = (Math.random() - 0.5) * 2.5;
        const base = faceRefs._eyeBaseTransform || "scaleY(1)";

        [faceRefs.eyeLWrap, faceRefs.eyeRWrap].forEach(w => {
            if (!w) return;
            w.style.transition = "transform 0.3s ease";
            w.style.transform = `${base} translate(${ox}px, ${oy}px)`;
        });

        setTimeout(() => {
            [faceRefs.eyeLWrap, faceRefs.eyeRWrap].forEach(w => {
                if (!w) return;
                w.style.transition = "transform 0.4s ease";
                w.style.transform = base;
            });
        }, 350 + Math.random() * 400);

        setTimeout(shift, 3500 + Math.random() * 5000);
    }
    setTimeout(shift, 2000);
}

// ============================================================
// 5段階感情設定
// ============================================================
const EMOTION_CONFIG = {
    anger: {
        label: "怒り",
        cssClass: "anger",
        browL: "rotate(14deg) translateY(-2px)",
        browR: "rotate(-14deg) translateY(-2px)",
        eyeScale: "scaleY(0.82)",
        mouthD: "M -16,0 Q 0,-9 16,0",
        mouthFill: 0,
    },
    irritation: {
        label: "苛立ち",
        cssClass: "irritation",
        browL: "rotate(7deg)",
        browR: "rotate(-7deg)",
        eyeScale: "scaleY(0.90)",
        mouthD: "M -12,0 Q 0,-4 12,0",
        mouthFill: 0,
    },
    disappointment: {
        label: "失望",
        cssClass: "disappointment",
        browL: "rotate(-8deg) translateY(4px)",
        browR: "rotate(8deg) translateY(4px)",
        eyeScale: "scaleY(0.78)",
        mouthD: "M -12,4 Q 0,-3 12,4",
        mouthFill: 0,
    },
    surprise: {
        label: "驚き",
        cssClass: "surprise",
        browL: "translateY(-7px)",
        browR: "translateY(-7px)",
        eyeScale: "scaleY(1.15)",
        mouthD: "M -8,-4 Q 0,10 8,-4 Q 0,3 -8,-4",
        mouthFill: 0.45,
    },
    acceptance: {
        label: "納得",
        cssClass: "acceptance",
        browL: "rotate(-2deg)",
        browR: "rotate(2deg)",
        eyeScale: "scaleY(1)",
        mouthD: "M -16,0 Q 0,10 16,0 Q 0,4 -16,0",
        mouthFill: 0.3,
    },
};

function setExpression(emotion, animate) {
    const cfg = EMOTION_CONFIG[emotion] || EMOTION_CONFIG.anger;

    // 眉毛 (wrapper 経由)
    [[faceRefs.browLWrap, cfg.browL], [faceRefs.browRWrap, cfg.browR]].forEach(([w, tf]) => {
        if (!w) return;
        w.style.transition = "transform 0.5s ease";
        w.style.transform = tf;
    });

    // 目 (wrapper 経由)
    faceRefs._eyeBaseTransform = cfg.eyeScale;
    [faceRefs.eyeLWrap, faceRefs.eyeRWrap].forEach(w => {
        if (!w) return;
        w.style.transition = "transform 0.5s ease";
        w.style.transform = cfg.eyeScale;
    });

    // 口
    if (!visemeTimer) setMouth(cfg.mouthD, cfg.mouthFill);

    // UI
    document.getElementById("emotion-label").textContent = cfg.label;
    const displayEl = document.getElementById("avatar-display");
    displayEl.className = "avatar-display " + cfg.cssClass;
    if (animate) {
        displayEl.classList.add("emotion-transition");
        setTimeout(() => displayEl.classList.remove("emotion-transition"), 600);
    }
}

function setMouth(d, fillOpacity) {
    const mouth = document.getElementById("mouth-shape");
    if (!mouth) return;
    mouth.setAttribute("d", d);
    mouth.setAttribute("fill-opacity", fillOpacity);
}

// ============================================================
// Viseme マッピング
// ============================================================
const VISEME_MOUTH = {
    "sil": { d: null, fill: 0 },
    "p":   { d: "M -8,0 L 8,0", fill: 0 },
    "t":   { d: "M -12,0 Q 0,2 12,0", fill: 0 },
    "S":   { d: "M -10,0 Q 0,3 10,0", fill: 0 },
    "T":   { d: "M -10,0 Q 0,2 10,0", fill: 0 },
    "f":   { d: "M -10,2 Q 0,-2 10,2", fill: 0 },
    "k":   { d: "M -12,0 Q 0,5 12,0", fill: 0.2 },
    "e":   { d: "M -13,0 Q 0,6 13,0", fill: 0.3 },
    "a":   { d: "M -14,-2 Q 0,10 14,-2 Q 0,4 -14,-2", fill: 0.5 },
    "o":   { d: "M -9,-3 Q 0,9 9,-3 Q 0,3 -9,-3", fill: 0.5 },
    "u":   { d: "M -7,-2 Q 0,6 7,-2 Q 0,2 -7,-2", fill: 0.4 },
    "i":   { d: "M -13,0 Q 0,5 13,0", fill: 0.2 },
    "r":   { d: "M -10,0 Q 0,6 10,0", fill: 0.2 },
    "@":   { d: "M -12,-2 Q 0,8 12,-2 Q 0,3 -12,-2", fill: 0.4 },
};

// ============================================================
// 発話モーション — face-group に .speaking
// ============================================================
function startSpeakingMotion() {
    isSpeaking = true;
    const fg = document.getElementById("face-group");
    if (fg) fg.classList.add("speaking");
}

function stopSpeakingMotion() {
    isSpeaking = false;
    const fg = document.getElementById("face-group");
    if (fg) fg.classList.remove("speaking");
}

// ============================================================
// Viseme 口パクエンジン
// ============================================================
function playVisemes(visemes) {
    stopVisemes();
    if (!visemes || visemes.length === 0) return;

    const startTime = performance.now();
    let index = 0;

    function scheduleNext() {
        if (index >= visemes.length) {
            const cfg = EMOTION_CONFIG[currentEmotion] || EMOTION_CONFIG.anger;
            setMouth(cfg.mouthD, cfg.mouthFill);
            visemeTimer = null;
            return;
        }
        const v = visemes[index];
        const elapsed = performance.now() - startTime;
        const delay = Math.max(0, v.time - elapsed);

        visemeTimer = setTimeout(() => {
            const shape = VISEME_MOUTH[v.value] || VISEME_MOUTH["sil"];
            if (shape.d) {
                setMouth(shape.d, shape.fill);
            } else {
                const cfg = EMOTION_CONFIG[currentEmotion] || EMOTION_CONFIG.anger;
                setMouth(cfg.mouthD, cfg.mouthFill);
            }
            index++;
            scheduleNext();
        }, delay);
    }
    scheduleNext();
}

function stopVisemes() {
    if (visemeTimer) { clearTimeout(visemeTimer); visemeTimer = null; }
}

// ============================================================
// 感情マッピング（5段階）
// ============================================================
function updateAvatar(emotion) {
    const mapped = mapEmotions(emotion);
    const changed = mapped !== currentEmotion;
    currentEmotion = mapped;
    setExpression(mapped, changed);
}

function mapEmotions(emotion) {
    if (emotion === "anger") return "anger";
    if (["intimidation", "exasperation"].includes(emotion)) return "irritation";
    if (["surprise"].includes(emotion)) return "surprise";
    if (["acceptance", "calm"].includes(emotion)) return "acceptance";
    return "disappointment";
}

// ============================================================
// メッセージ送信
// ============================================================
async function sendMessage() {
    const input = document.getElementById("user-input");
    const message = input.value.trim();
    if (!message) return;

    addChatMessage("user", message);
    input.value = "";

    const sendBtn = document.getElementById("send-btn");
    sendBtn.disabled = true;
    sendBtn.textContent = "送信中...";

    const e2eStart = performance.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, history: conversationHistory }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const e2eEnd = performance.now();
        const e2eLatency = Math.round(e2eEnd - e2eStart);

        if (response.status === 429) {
            addChatMessage("system", "サーバーが混雑中です。3秒後に再送信します…");
            await new Promise(r => setTimeout(r, 3000));
            sendBtn.disabled = false;
            sendBtn.textContent = "送信";
            input.value = message;
            return sendMessage();
        }
        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();

        conversationHistory.push({ role: "user", content: message });
        conversationHistory.push({ role: "assistant", content: JSON.stringify({
            emotion: data.emotion, emotion_ja: data.emotion_ja,
            reply: data.reply, anger_level: data.anger_level,
            trust_level: data.trust_level,
            ng_words_detected: data.ng_words_detected,
            evaluation: data.evaluation,
        })});
        turnCount++;

        updateAvatar(data.emotion);
        updateGauges(data.anger_level, data.trust_level);
        addChatMessage("assistant", data.reply);

        if (data.audio_base64) {
            playAudioWithVisemes(data.audio_base64, data.visemes || []);
        }

        if (data.ng_words_detected && data.ng_words_detected.length > 0) {
            showNgWords(data.ng_words_detected);
            document.getElementById("avatar-display").classList.add("shake");
            setTimeout(() => document.getElementById("avatar-display").classList.remove("shake"), 1000);
        } else {
            hideNgWords();
        }

        showMetrics({
            bedrockLatency: data._metrics?.bedrock_latency_ms || 0,
            pollyLatency: data._metrics?.polly_latency_ms || 0,
            e2eLatency,
            inputTokens: data._metrics?.input_tokens || 0,
            outputTokens: data._metrics?.output_tokens || 0,
        });

    } catch (error) {
        if (error.name === "AbortError") {
            addChatMessage("system", "応答がタイムアウトしました。もう一度送信してください。");
        } else {
            addChatMessage("system", `エラー: ${error.message}`);
        }
        console.error("Send error:", error);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "送信";
    }
}

// ============================================================
// 音声 + Viseme 同期再生
// ============================================================
function playAudioWithVisemes(base64Data, visemes) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    stopVisemes();

    const audioBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const blob = new Blob([audioBytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);

    currentAudio.onplay = () => {
        playVisemes(visemes);
        startSpeakingMotion();
    };
    currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        stopVisemes();
        stopSpeakingMotion();
        const cfg = EMOTION_CONFIG[currentEmotion] || EMOTION_CONFIG.anger;
        setMouth(cfg.mouthD, cfg.mouthFill);
    };
    currentAudio.play().catch(err => console.warn("Audio play failed:", err));
}

// ============================================================
// ユーティリティ
// ============================================================
function quickMessage(text) {
    document.getElementById("user-input").value = text;
    sendMessage();
}

function updateGauges(angerLevel, trustLevel) {
    document.getElementById("anger-bar").style.width = angerLevel + "%";
    document.getElementById("trust-bar").style.width = trustLevel + "%";
    document.getElementById("anger-value").textContent = angerLevel;
    document.getElementById("trust-value").textContent = trustLevel;
}

function addChatMessage(role, text) {
    const chatLog = document.getElementById("chat-log");
    const div = document.createElement("div");
    div.className = "chat-message " + role;
    const p = document.createElement("p");
    p.textContent = text;
    div.appendChild(p);
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function showMetrics(m) {
    document.getElementById("metrics-panel").style.display = "block";
    document.getElementById("metric-bedrock").textContent = m.bedrockLatency + " ms";
    document.getElementById("metric-polly").textContent = m.pollyLatency + " ms";
    document.getElementById("metric-e2e").textContent = m.e2eLatency + " ms";
    document.getElementById("metric-input-tokens").textContent = m.inputTokens;
    document.getElementById("metric-output-tokens").textContent = m.outputTokens;
}

function showNgWords(words) {
    document.getElementById("ng-panel").style.display = "block";
    document.getElementById("ng-words").textContent = "検知: " + words.join(", ");
}
function hideNgWords() { document.getElementById("ng-panel").style.display = "none"; }

// ============================================================
// モーション確認デモ関数
// ============================================================
function demoEmotion(emotion) {
    currentEmotion = emotion;
    setExpression(emotion, true);
}

function demoBlink() {
    doBlink();
    setTimeout(doBlink, 300);
}

function demoSpeak() {
    if (isSpeaking) { stopSpeakingMotion(); return; }
    startSpeakingMotion();
    // 口パクデモ（あ→い→う→え→お→閉じ）
    const seq = ["a","i","u","e","o","a","o","sil"];
    let i = 0;
    function next() {
        if (i >= seq.length || !isSpeaking) {
            stopSpeakingMotion();
            const cfg = EMOTION_CONFIG[currentEmotion] || EMOTION_CONFIG.anger;
            setMouth(cfg.mouthD, cfg.mouthFill);
            return;
        }
        const shape = VISEME_MOUTH[seq[i]] || VISEME_MOUTH["sil"];
        if (shape.d) setMouth(shape.d, shape.fill);
        else {
            const cfg = EMOTION_CONFIG[currentEmotion] || EMOTION_CONFIG.anger;
            setMouth(cfg.mouthD, cfg.mouthFill);
        }
        i++;
        setTimeout(next, 180);
    }
    next();
}

// ============================================================
// 初期化
// ============================================================
initFace();
setExpression("anger", false);

document.getElementById("user-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
