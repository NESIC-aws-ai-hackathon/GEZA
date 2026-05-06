/**
 * apology-meter.js — GEZA 謝罪角度アセスメント（ApologyMeter）
 *
 * prototype/apology-meter.html から移植・モジュール化
 * 依存: なし（Web Audio API は自動初期化）
 * XSS-01: 外部文字列は textContent のみで挿入。
 */
const ApologyMeter = (() => {
  "use strict";

  // ── 14ステージ定義 ──────────────────────────────────────────────
  const STAGES = [
    { idx:0,  deg:0,   file:"geza_00_0deg_upright.png",              name:"直立不動",    posture:"背筋を伸ばし微動だにしない",      lv:"Lv.0 無",       zone:"daily",   se:"silent",  zoneLabel:"🟢 日常",     zoneColor:"var(--z-daily)" },
    { idx:1,  deg:15,  file:"geza_01_15deg_head_down.png",           name:"目礼",        posture:"首だけわずかに傾ける",            lv:"Lv.1 微",       zone:"daily",   se:"knock",   zoneLabel:"🟢 日常",     zoneColor:"var(--z-daily)" },
    { idx:2,  deg:30,  file:"geza_02_30deg_light_bow.png",           name:"会釈",        posture:"腰から軽く上体を倒す",            lv:"Lv.2 軽",       zone:"daily",   se:"peko",    zoneLabel:"🟢 日常",     zoneColor:"var(--z-daily)" },
    { idx:3,  deg:45,  file:"geza_03_45deg_business_bow.png",        name:"敬礼",        posture:"腰から45°、手は太ももに",        lv:"Lv.3 中",       zone:"biz",     se:"sharan",  zoneLabel:"🟡 ビジネス", zoneColor:"var(--z-biz)" },
    { idx:4,  deg:60,  file:"geza_04_60deg_deep_bow.png",            name:"最敬礼",      posture:"腰から深く、背中は平ら",          lv:"Lv.4 重",       zone:"biz",     se:"goon",    zoneLabel:"🟡 ビジネス", zoneColor:"var(--z-biz)" },
    { idx:5,  deg:75,  file:"geza_05_75deg_deeper_apology.png",      name:"深謝",        posture:"最敬礼よりさらに深く",            lv:"Lv.5 深刻",     zone:"crisis",  se:"dododo",  zoneLabel:"🟠 危機",     zoneColor:"var(--z-crisis)" },
    { idx:6,  deg:90,  file:"geza_06_90deg_right_angle_bow.png",     name:"直角のお辞儀",posture:"上体が完全に水平",               lv:"Lv.6 危機",     zone:"crisis",  se:"jaan",    zoneLabel:"🟠 危機",     zoneColor:"var(--z-crisis)" },
    { idx:7,  deg:100, file:"geza_07_100deg_dogeza.png",             name:"土下座",      posture:"膝をつき額を床に",                lv:"Lv.7 覚悟",     zone:"resolve", se:"dogoon",  zoneLabel:"🔴 覚悟",     zoneColor:"var(--z-resolve)" },
    { idx:8,  deg:110, file:"geza_08_110deg_dogeza_press_crack.png", name:"土下座プレス",posture:"額を床にめり込ませる",            lv:"Lv.8 絶望",     zone:"resolve", se:"mishi",   zoneLabel:"🔴 覚悟",     zoneColor:"var(--z-resolve)" },
    { idx:9,  deg:120, file:"geza_09_120deg_prone_arms_side.png",    name:"寝下座",      posture:"全身を床に伏せる",                lv:"Lv.9 壊滅",     zone:"resolve", se:"zuzuzu",  zoneLabel:"🔴 覚悟",     zoneColor:"var(--z-resolve)" },
    { idx:10, deg:135, file:"geza_10_135deg_prone_arms_forward.png", name:"這い寝下座",  posture:"四肢を投げ出し大地と同化",        lv:"Lv.10 消滅願望",zone:"beyond",  se:"shiin",   zoneLabel:"⚫ 超越",     zoneColor:"var(--z-beyond)" },
    { idx:11, deg:150, file:"geza_11_150deg_chirichiri_kogegeza.png",name:"焦げ寝下座",  posture:"摩擦熱で体が焦げ始める",          lv:"Lv.11 超越",    zone:"beyond",  se:"juuuu",   zoneLabel:"⚫ 超越",     zoneColor:"var(--z-beyond)" },
    { idx:12, deg:165, file:"geza_12_165deg_full_flame.png",         name:"焼き寝下座",  posture:"全身が燃え上がる",                lv:"Lv.12 概念化",  zone:"ascend",  se:"gooo",    zoneLabel:"✨ 昇天",     zoneColor:"var(--z-ascend)" },
    { idx:13, deg:180, file:"geza_13_180deg_kogegeza_chirichiri.png",name:"炭化寝下座",  posture:"完全燃焼、炭と化す",              lv:"Lv.MAX 昇天",   zone:"ascend",  se:"shuuu",   zoneLabel:"✨ 昇天",     zoneColor:"var(--z-ascend)" },
  ];

  const ZONES = [
    { id:"daily",   label:"🟢 日常",     min:0,   max:30,  color:"var(--z-daily)",   bg:"rgba(46,204,113,.12)" },
    { id:"biz",     label:"🟡 ビジネス", min:31,  max:60,  color:"var(--z-biz)",     bg:"rgba(241,196,15,.12)" },
    { id:"crisis",  label:"🟠 危機",     min:61,  max:90,  color:"var(--z-crisis)",  bg:"rgba(230,126,34,.12)" },
    { id:"resolve", label:"🔴 覚悟",     min:91,  max:120, color:"var(--z-resolve)", bg:"rgba(231,76,60,.12)" },
    { id:"beyond",  label:"⚫ 超越",     min:121, max:150, color:"var(--z-beyond)",  bg:"rgba(44,44,44,.35)" },
    { id:"ascend",  label:"✨ 昇天",     min:151, max:180, color:"var(--z-ascend)",  bg:"rgba(240,208,96,.12)" },
  ];

  const ZONE_RGB = {
    daily:   "46, 175, 100",
    biz:     "30, 100, 180",
    crisis:  "210, 110, 30",
    resolve: "200, 50, 40",
    beyond:  "70, 30, 110",
    ascend:  "200, 160, 40",
  };

  const BASE = "/icons/pictgram/trimmed/";

  // ── ヘルパー ──────────────────────────────────────────────────
  function getZone(d) {
    return ZONES.find((z) => d >= z.min && d <= z.max) || ZONES[ZONES.length - 1];
  }

  function getStage(d) {
    let best = STAGES[0];
    for (const s of STAGES) {
      if (s.deg <= d) best = s;
    }
    return best;
  }

  // ── Web Audio ──────────────────────────────────────────────────
  let _actx;
  function _ctx() {
    if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
    return _actx;
  }

  function _mkNoise(c, dur) {
    const len = c.sampleRate * dur;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    return src;
  }

  function _makeDist(amount) {
    const n = 256, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * 2 / n - 1;
      curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  function playStampSlam(intensity) {
    const c = _ctx();
    if (c.state === "suspended") c.resume();
    const t = c.currentTime;
    const vol = 0.75 + intensity * 0.4;

    // L1
    const n1 = _mkNoise(c, 0.24);
    const lp1 = c.createBiquadFilter(); lp1.type = "lowpass"; lp1.frequency.value = 160;
    const hp1 = c.createBiquadFilter(); hp1.type = "highpass"; hp1.frequency.value = 18;
    const ng1 = c.createGain();
    ng1.gain.setValueAtTime(vol * 1.2, t);
    ng1.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + intensity * 0.12);
    n1.connect(lp1); lp1.connect(hp1); hp1.connect(ng1); ng1.connect(c.destination); n1.start(t);

    // L2
    const oLow = c.createOscillator(), gLow = c.createGain();
    oLow.type = "sine"; oLow.frequency.setValueAtTime(80, t);
    oLow.frequency.exponentialRampToValueAtTime(16 + intensity * 8, t + 0.45 + intensity * 0.4);
    gLow.gain.setValueAtTime(vol * 1.4, t);
    gLow.gain.exponentialRampToValueAtTime(0.001, t + 0.55 + intensity * 0.45);
    oLow.connect(gLow); gLow.connect(c.destination); oLow.start(t); oLow.stop(t + 1.0);

    // L3
    const oBody = c.createOscillator(), gBody = c.createGain();
    oBody.type = "triangle"; oBody.frequency.setValueAtTime(60, t);
    oBody.frequency.exponentialRampToValueAtTime(20, t + 0.14);
    gBody.gain.setValueAtTime(vol * 1.0, t);
    gBody.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    oBody.connect(gBody); gBody.connect(c.destination); oBody.start(t); oBody.stop(t + 0.17);

    if (intensity >= 0.4) {
      const oS = c.createOscillator(), gS = c.createGain();
      oS.type = "sine"; oS.frequency.setValueAtTime(42, t);
      oS.frequency.exponentialRampToValueAtTime(13, t + 0.65 + intensity * 0.25);
      gS.gain.setValueAtTime(vol * 1.0 * intensity, t);
      gS.gain.exponentialRampToValueAtTime(0.001, t + 0.75 + intensity * 0.35);
      oS.connect(gS); gS.connect(c.destination); oS.start(t); oS.stop(t + 1.1);
    }

    if (intensity >= 0.7) {
      const oC = c.createOscillator(), gC = c.createGain();
      const dC = c.createWaveShaper(); dC.curve = _makeDist(20 + intensity * 35);
      const lpC = c.createBiquadFilter(); lpC.type = "lowpass"; lpC.frequency.value = 220;
      oC.type = "sine"; oC.frequency.setValueAtTime(55, t);
      oC.frequency.exponentialRampToValueAtTime(18, t + 0.5);
      gC.gain.setValueAtTime(vol * 0.65 * intensity, t);
      gC.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      oC.connect(dC); dC.connect(lpC); lpC.connect(gC); gC.connect(c.destination); oC.start(t); oC.stop(t + 0.55);
    }

    if (intensity >= 0.9) {
      const nR = _mkNoise(c, 1.3);
      const lpR = c.createBiquadFilter(); lpR.type = "lowpass"; lpR.frequency.value = 75;
      const gR = c.createGain();
      gR.gain.setValueAtTime(0, t + 0.05);
      gR.gain.linearRampToValueAtTime(vol * 0.42, t + 0.22);
      gR.gain.linearRampToValueAtTime(vol * 0.30, t + 0.7);
      gR.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      nR.connect(lpR); lpR.connect(gR); gR.connect(c.destination); nR.start(t + 0.05);
    }
  }

  function playZoneSE(seType) {
    const c = _ctx();
    if (c.state === "suspended") c.resume();
    const t = c.currentTime;

    if (seType === "silent") return;

    if (seType === "knock") {
      const o1 = c.createOscillator(), g1 = c.createGain();
      o1.type = "triangle"; o1.frequency.setValueAtTime(1200, t);
      o1.frequency.exponentialRampToValueAtTime(250, t + 0.03);
      g1.gain.setValueAtTime(0.7, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o1.connect(g1); g1.connect(c.destination); o1.start(t); o1.stop(t + 0.12);
      const o2 = c.createOscillator(), g2 = c.createGain();
      o2.type = "sine"; o2.frequency.setValueAtTime(400, t);
      o2.frequency.exponentialRampToValueAtTime(120, t + 0.1);
      g2.gain.setValueAtTime(0.5, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o2.connect(g2); g2.connect(c.destination); o2.start(t); o2.stop(t + 0.15);
      return;
    }

    if (seType === "peko") {
      const o1 = c.createOscillator(), g1 = c.createGain();
      o1.type = "sine"; o1.frequency.setValueAtTime(650, t);
      o1.frequency.exponentialRampToValueAtTime(200, t + 0.18);
      g1.gain.setValueAtTime(0.6, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o1.connect(g1); g1.connect(c.destination); o1.start(t); o1.stop(t + 0.3);
      const o2 = c.createOscillator(), g2 = c.createGain();
      o2.type = "sine"; o2.frequency.setValueAtTime(320, t + 0.02);
      o2.frequency.exponentialRampToValueAtTime(120, t + 0.2);
      g2.gain.setValueAtTime(0.4, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o2.connect(g2); g2.connect(c.destination); o2.start(t + 0.02); o2.stop(t + 0.28);
      return;
    }

    // 汎用SE: チャイム系（sharan / goon / その他）
    const freqs = seType === "jaan" ? [880, 1100, 1320] :
                  seType === "dogoon" ? [110, 165, 220] :
                  seType === "shiin"  ? [220, 330] :
                  [550, 880, 1100];
    freqs.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f, t + i * 0.04);
      g.gain.setValueAtTime(0.2, t + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8 + i * 0.1);
      o.connect(g); g.connect(c.destination); o.start(t + i * 0.04); o.stop(t + 1.2);
    });
  }

  // ── スタンプ HTML 生成 ────────────────────────────────────────
  function _buildStampHTML(stage, zone) {
    const rgb = ZONE_RGB[zone.id] || "184, 32, 22";
    return `
      <svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
        <defs>
          <filter id="am-stamp-worn" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.065 0.045" numOctaves="4" seed="7" result="noise"/>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4.5" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        </defs>
      </svg>
      <div class="am-stamp-stage">
        <div class="am-impact-flash" id="am-flash"></div>
        <div class="am-stamp-wrap" id="am-stamp-wrap" style="--sc:${rgb}">
          <div class="am-stamp-ring"></div>
          <div class="am-stamp-circle">
            <img id="am-stamp-img" src="${BASE}${stage.file}" alt="${stage.name}">
            <span class="am-stamp-label">${stage.name}</span>
          </div>
          <span class="am-stamp-degree">${stage.deg}<small>°</small></span>
          <span class="am-stamp-level">${stage.lv}</span>
        </div>
      </div>
      <div class="am-stage-info" id="am-stage-info">
        <div class="am-stage-name">${stage.name}</div>
        <div class="am-stage-posture">${stage.posture}</div>
        <div class="am-zone-badge" style="background:${zone.color};color:#fff">${zone.label}</div>
      </div>
      <div class="am-scale">
        <div class="am-pin" id="am-pin" style="left:0%"></div>
      </div>
      <div class="am-scale-labels">
        <span>0°</span><span>45°</span><span>90°</span><span>135°</span><span>180°</span>
      </div>`;
  }

  // ── スタンプアニメーション ────────────────────────────────────
  function _spawnShockwave(container, color) {
    const el = document.createElement("div");
    el.className = "am-shockwave";
    el.style.setProperty("--sw-c", color);
    container.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  function _spawnInkParticles(container) {
    for (let i = 0; i < 8; i++) {
      const p = document.createElement("div");
      p.className = "am-ink-p";
      const angle = (i / 8) * Math.PI * 2;
      const dist = 60 + Math.random() * 60;
      p.style.cssText = `
        left:50%;top:50%;
        --tx:${Math.cos(angle) * dist}px;
        --ty:${Math.sin(angle) * dist}px;
        background:rgb(${ZONE_RGB.resolve});
      `;
      container.appendChild(p);
      p.classList.add("am-ink-burst");
      setTimeout(() => p.remove(), 600);
    }
  }

  // ── 公開 API ──────────────────────────────────────────────────

  /**
   * 演出付きスタンプ表示
   * @param {HTMLElement} container - 表示先コンテナ要素
   * @param {number} degree - 謝罪角度 (0〜180)
   */
  function render(container, degree) {
    degree = Math.max(0, Math.min(180, Math.round(degree)));
    const stage = getStage(degree);
    const zone  = getZone(degree);

    container.innerHTML = _buildStampHTML(stage, zone);

    const wrap    = container.querySelector("#am-stamp-wrap");
    const flash   = container.querySelector("#am-flash");
    const stageEl = container.querySelector("#am-stage-info");
    const pin     = container.querySelector("#am-pin");

    const intensity = degree / 180;

    // スタンプアニメーション開始
    setTimeout(() => {
      wrap.classList.add("am-stamped");
      playStampSlam(intensity);

      // 衝撃エフェクト
      flash.classList.add("am-pop");
      _spawnShockwave(container.querySelector(".am-stamp-stage"), zone.color);
      if (degree >= 60) _spawnInkParticles(container.querySelector(".am-stamp-stage"));

      // SE
      setTimeout(() => playZoneSE(stage.se), 220);

      // ステージ情報フェードイン
      setTimeout(() => stageEl.classList.add("am-show"), 450);

      // スケールピン
      setTimeout(() => {
        pin.style.left = `${(degree / 180) * 100}%`;
      }, 100);
    }, 80);
  }

  /**
   * 演出なしで角度だけ更新（スライダー連動用）
   * @param {HTMLElement} container
   * @param {number} degree
   */
  function setDegree(container, degree) {
    degree = Math.max(0, Math.min(180, Math.round(degree)));
    const stage = getStage(degree);
    const zone  = getZone(degree);
    const img = container.querySelector("#am-stamp-img");
    if (img) img.src = BASE + stage.file;
    const lbl = container.querySelector(".am-stamp-label");
    if (lbl) lbl.textContent = stage.name;
    const deg = container.querySelector(".am-stamp-degree");
    if (deg) deg.textContent = `${degree}°`;
    const lv = container.querySelector(".am-stamp-level");
    if (lv) lv.textContent = stage.lv;
    const pin = container.querySelector("#am-pin");
    if (pin) pin.style.left = `${(degree / 180) * 100}%`;
    const namEl = container.querySelector(".am-stage-name");
    if (namEl) namEl.textContent = stage.name;
    const posEl = container.querySelector(".am-stage-posture");
    if (posEl) posEl.textContent = stage.posture;
    const zEl = container.querySelector(".am-zone-badge");
    if (zEl) {
      zEl.textContent = zone.label;
      zEl.style.background = zone.color;
    }
  }

  /**
   * ステージ情報を返す（演出なし）
   * @param {number} degree
   * @returns {{stage_name, posture, lv, zone, zoneLabel, zoneColor, file}}
   */
  function getStageInfo(degree) {
    degree = Math.max(0, Math.min(180, Math.round(degree)));
    const stage = getStage(degree);
    const zone  = getZone(degree);
    return {
      stage_name: stage.name,
      posture:    stage.posture,
      lv:         stage.lv,
      zone:       zone.id,
      zoneLabel:  zone.label,
      zoneColor:  zone.color,
      file:       BASE + stage.file,
    };
  }

  return { render, setDegree, getStageInfo, STAGES, ZONES };
})();

window.ApologyMeter = ApologyMeter;
