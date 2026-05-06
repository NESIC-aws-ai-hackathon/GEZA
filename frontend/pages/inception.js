/**
 * inception.js — GEZA 謝罪コンシェルジュ インセプションページ（U2）
 *
 * 依存: config.js / auth.js / state.js / api.js / avatar.js / apology-meter.js / facesjs.min.js
 * XSS-01: AI生成テキストは全て textContent のみ使用
 * AUTH: 未認証時は index.html へリダイレクト
 */
(function () {
  "use strict";

  // ================================================================
  // 定数
  // ================================================================
  const STEPS = ["input", "probe", "assessment", "opponent", "plan", "schedule", "day-support"];
  const MAX_REGEN = 3;
  const DAY_CHECKLIST = [
    "手土産を用意した",
    "謝罪場所・時間を確保した",
    "NGワードを頭に入れた",
    "第一声を声に出して練習した",
    "服装・身だしなみを整えた",
    "スマートフォンはマナーモードにした",
  ];

  const OPPONENT_PRESETS = {
    default:     {},
    serious:     { hairColor: "#2c2c2c", eye: { id: "eye9" } },
    angry:       { hairColor: "#8b0000", eye: { id: "eye10", angle: -8 } },
    disappointed:{ hairColor: "#5a5a5a" },
    mild:        { hairColor: "#c8a97e", eye: { id: "eye1", angle: 4 } },
  };

  // アバター設定ディープオーバーライド（facesjs.override がエクスポート非対応のためインライン実装）
  function _deepApply(obj, overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== null && typeof v === "object" && !Array.isArray(v) && obj[k] && typeof obj[k] === "object") {
        _deepApply(obj[k], v);
      } else {
        obj[k] = v;
      }
    }
  }

  // アバター外見マッピング
  const HAIR_COLOR_MAP = {
    black:  "#1a1a1a",
    brown:  "#6b3a2a",
    blonde: "#c8a044",
    gray:   "#8a8a8a",
    red:    "#8b1010",
  };
  const GLASSES_IDS = ["glasses1", "glasses2", "glasses3"];

  // 服装選択は LLMへの指示のみに使用。
  // facesjs はスポーツアバター用ライブラリのためスーツSVGを持たない。
  // baseball4 + teamColors[1]=アウター色, [2]=シャツ色 でスーツ風に表現。
  const SUIT_COLOR_MAP = {
    black: ["#222222", "#111111", "#f0f0f0"],   // ボタン黒・アウター黒・シャツ白
    navy:  ["#1a2a5c", "#1a2a5c", "#f0f0f0"],   // ネイビー
    gray:  ["#555555", "#444444", "#f0f0f0"],   // グレー
    beige: ["#c9a87c", "#c9a87c", "#f8f4ef"],   // ベージュ（女性カジュアルスーツ風）
    brown: ["#6b4226", "#6b4226", "#f5f0ea"],   // ブラウン
  };
  const OUTFIT_CONFIG = {
    casual:  { jersey: "hockey2",   teamColors: ["#3a7bd5", "#1a1a6e", "#e74c3c"] },
    uniform: { jersey: "baseball2", teamColors: ["#1a3a6c", "#f0f0f0", "#c0392b"] },
  };
  function _getOutfitConfig(outfitKey, suitColorKey) {
    if (outfitKey === "suit") {
      const tc = SUIT_COLOR_MAP[suitColorKey] || SUIT_COLOR_MAP["black"];
      return { jersey: "baseball4", teamColors: tc };
    }
    return OUTFIT_CONFIG[outfitKey] || null;
  }
  let _incidentSummary = "";
  let _relationship = "";
  let _categories = "";
  let _conversationHistory = [];
  let _probeRound = 0;
  let _enrichedSummary = "";
  let _consultHistory = [];   // { role, content }[]
  let _pendingRevisedPlan = null;  // revised_plan 一時保存
  const MAX_CONSULT_TURNS = 10;
  let _assessmentResult = null;  // { ai_degree, stage_name, stage_description, reasons, recommended_approach }
  let _selfDegree = 45;
  let _opponentProfile = null;   // { type, personality, gender, anger_level, trust_level, tolerance, anger_points, ng_words, first_message, avatar_seed }
  let _opponentAppearance = {}; // フォーム入力値（gender/race/hairColor/glasses/outfit/tone）
  let _faceConfig = null;
  let _regenCount = 0;
  let _planJobId = null;
  let _apologyPlan = null;       // { first_words, full_script, timing, gift, todo_list }
  let _sessionId = null;
  let _currentPreset = "default";

  // ================================================================
  // ユーティリティ
  // ================================================================
  function _showSection(sectionId) {
    document.querySelectorAll(".inc-step").forEach((el) => { el.hidden = true; });
    const el = document.getElementById(sectionId);
    if (el) el.hidden = false;

    const idx = STEPS.indexOf(sectionId.replace("step-", ""));
    const indicator = document.getElementById("step-indicator");
    if (indicator) indicator.textContent = `Step ${idx + 1} / ${STEPS.length}`;

    window.scrollTo(0, 0);
  }

  function _showLoading(show) {
    const loading = document.getElementById("app-loading");
    const app = document.getElementById("inception-app");
    if (loading) loading.style.display = show ? "flex" : "none";
    if (app) app.hidden = show;
  }

  function _withLoading(buttonId, asyncFn) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn._originalText = btn._originalText || btn.textContent;
      btn.disabled = true;
      btn.textContent = "処理中...";
    }
    return asyncFn().finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn._originalText || btn.textContent;
      }
    });
  }

  function _setError(elId, msg) {
    const el = document.getElementById(elId);
    if (el) el.textContent = msg || "";
  }

  // ================================================================
  // Step 1: やらかし入力
  // ================================================================
  function _initStep1() {
    document.getElementById("btn-start-analyze").addEventListener("click", () => {
      _setError("input-error", "");
      const summary = (document.getElementById("incident-summary").value || "").trim();
      if (!summary) {
        _setError("input-error", "やらかし内容を入力してください");
        return;
      }
      if (summary.length > 2000) {
        _setError("input-error", "2000文字以内で入力してください");
        return;
      }
      _incidentSummary = summary;
      _relationship = document.getElementById("relationship").value;
      _categories = document.getElementById("categories").value;
      _conversationHistory = [];
      _probeRound = 0;

      _withLoading("btn-start-analyze", () => {
        return _startProbe();
      }).catch((err) => {
        _setError("input-error", `エラー: ${err.message || "分析に失敗しました"}`);
      });
    });
  }

  async function _startProbe() {
    // assess-apology と probe-incident(round=1) を同時呼び出し
    const [assessResult, probeResult] = await Promise.all([
      ApiClient.post("/apology/assess", {
        incident_summary: _incidentSummary,
        relationship: _relationship,
        categories: _categories,
      }),
      ApiClient.post("/incident/probe", {
        incident_summary: _incidentSummary,
        conversation_history: [],
        round: 1,
      }),
    ]);

    _assessmentResult = assessResult;

    _showSection("step-probe");

    if (probeResult.status === "completed") {
      _enrichedSummary = probeResult.enriched_summary || "";
      _showSection("step-assessment");
      _renderAssessment();
    } else {
      _probeRound = 1;
      _addChatBubble("ai", probeResult.question || "詳しく教えてください。");
    }
  }

  // ================================================================
  // Step 2: 深掘りチャット
  // ================================================================
  function _addChatBubble(role, text) {
    const area = document.getElementById("chat-area");
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;  // XSS-01
    area.appendChild(bubble);
    area.scrollTop = area.scrollHeight;
  }

  function _initStep2() {
    const sendBtn = document.getElementById("btn-chat-send");
    const answerEl = document.getElementById("chat-answer");

    sendBtn.addEventListener("click", () => _handleProbeAnswer());
    answerEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _handleProbeAnswer(); }
    });

    document.getElementById("btn-skip-probe").addEventListener("click", () => {
      _enrichedSummary = "";
      _showSection("step-assessment");
      _renderAssessment();
    });
  }

  function _handleProbeAnswer() {
    const answer = (document.getElementById("chat-answer").value || "").trim();
    if (!answer) {
      _setError("probe-error", "回答を入力してください");
      return;
    }
    if (answer.length > 500) {
      _setError("probe-error", "500文字以内で入力してください");
      return;
    }
    _setError("probe-error", "");
    document.getElementById("chat-answer").value = "";

    _addChatBubble("user", answer);

    _conversationHistory.push({ role: "user", content: answer });
    _probeRound++;

    document.getElementById("btn-chat-send").disabled = true;

    ApiClient.post("/incident/probe", {
      incident_summary: _incidentSummary,
      conversation_history: _conversationHistory,
      round: _probeRound,
    }).then((result) => {
      if (result.status === "completed") {
        _enrichedSummary = result.enriched_summary || "";
        setTimeout(() => {
          _showSection("step-assessment");
          _renderAssessment();
        }, 400);
      } else {
        const question = result.question || "もう少し詳しく教えてください。";
        _conversationHistory.push({ role: "assistant", content: question });
        _addChatBubble("ai", question);
        document.getElementById("btn-chat-send").disabled = false;
      }
    }).catch((err) => {
      _setError("probe-error", `エラー: ${err.message || "通信に失敗しました"}`);
      document.getElementById("btn-chat-send").disabled = false;
    });
  }

  // ================================================================
  // Step 3: アセスメント
  // ================================================================
  function _initStep3() {
    // スーツ選択時のみ色選択を表示
    const outfitSel = document.getElementById("opp-outfit");
    const suitColorCol = document.getElementById("suit-color-col");
    outfitSel.addEventListener("change", () => {
      suitColorCol.style.display = outfitSel.value === "suit" ? "" : "none";
    });

    // 相手生成ボタンを初期化時に登録（btn-reveal-result 内部に入れ子にしない）
    document.getElementById("btn-generate-opponent").addEventListener("click", () => {
      if (!_assessmentResult) return;  // アセスメント未完了の場合は無視
      _opponentAppearance = {
        gender:    document.getElementById("opp-gender").value,
        race:      document.getElementById("opp-race").value,
        hairColor: document.getElementById("opp-hair-color").value,
        glasses:   document.getElementById("opp-glasses").value,
        outfit:    document.getElementById("opp-outfit").value,
        suitColor: document.getElementById("opp-suit-color").value,
        tone:      document.getElementById("opp-tone").value,
      };
      _withLoading("btn-generate-opponent", () => _generateOpponent())
        .catch((err) => {
          const errEl = document.getElementById("assessment-gen-error");
          if (errEl) errEl.textContent = `エラー: ${err.message || "生成に失敗しました"}`;
        });
    });
  }

  function _renderAssessment() {
    if (!_assessmentResult) return;
    const { ai_degree, reasons, recommended_approach } = _assessmentResult;

    // 自己申告スライダー初期化（AI診断値の70%を初期値に）
    const selfInitial = Math.round(ai_degree * 0.7);
    _selfDegree = selfInitial;
    const slider = document.getElementById("self-degree-slider");
    slider.value = _selfDegree;
    document.getElementById("self-degree-val").textContent = _selfDegree;

    // スライダー変更時：プレビュー表示
    function _updateSelfPreview() {
      _selfDegree = parseInt(slider.value, 10);
      document.getElementById("self-degree-val").textContent = _selfDegree;
      const preview = document.getElementById("self-meter-preview");
      if (preview && window.ApologyMeter) {
        const info = ApologyMeter.getStageInfo(_selfDegree);
        preview.textContent = `${info.stage_name}（${info.zoneLabel}）`;
        preview.style.color = info.zoneColor;
      }
    }
    slider.addEventListener("input", _updateSelfPreview);
    _updateSelfPreview();

    // 「診断する」ボタン
    document.getElementById("btn-reveal-result").addEventListener("click", () => {
      _selfDegree = parseInt(slider.value, 10);

      // 自己申告カードを薄く表示（操作不可に）
      const selfCard = document.getElementById("self-report-card");
      selfCard.classList.add("revealed");

      // 結果エリアを表示
      const resultEl = document.getElementById("assessment-result");
      resultEl.hidden = false;

      // スタンプ演出（ApologyMeter.render が SE 音も内包）
      const container = document.getElementById("meter-container");
      ApologyMeter.render(container, ai_degree);

      // 高強度は画面フラッシュ + スクリーンシェイク
      if (ai_degree >= 75) {
        const overlay = document.createElement("div");
        overlay.className = "am-flash-overlay";
        const rgb = ai_degree >= 135 ? "240,208,96" :
                    ai_degree >= 100 ? "231,76,60" : "230,126,34";
        overlay.style.background = `rgba(${rgb},${Math.min(0.35, ai_degree / 400)})`;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.remove(), 700);

        if (ai_degree >= 90) {
          document.body.classList.add("screen-shake");
          setTimeout(() => document.body.classList.remove("screen-shake"), 600);
        }
      }

      // スクロール（スタンプが見えるように）
      setTimeout(() => {
        resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);

      // 少し遅れてバーと根拠を表示（スタンプ演出を楽しんでから）
      setTimeout(() => {
        _updateGapBars(ai_degree, _selfDegree);
        _renderReasons(reasons, recommended_approach);
      }, 900);

      // 相手生成ボタンのイベントは _initStep3() で登録済み
    }, { once: true });
  }

  function _renderReasons(reasons, recommendedApproach) {
    const list = document.getElementById("reasons-list");
    list.innerHTML = "";
    (reasons || []).forEach((r) => {
      const row = document.createElement("div");
      row.className = "factor-row";

      const header = document.createElement("div");
      header.className = "factor-header";

      const wt = document.createElement("span");
      wt.className = `factor-weight ${r.weight === "中" ? "mid" : r.weight === "低" ? "low" : ""}`;
      wt.textContent = r.weight || "高";  // XSS-01

      const factorTxt = document.createElement("span");
      factorTxt.textContent = r.factor || "";  // XSS-01
      factorTxt.style.fontWeight = "600";

      header.appendChild(wt);
      header.appendChild(factorTxt);
      row.appendChild(header);

      // 詳細説明（description フィールド）
      if (r.description) {
        const desc = document.createElement("div");
        desc.className = "factor-desc";
        desc.textContent = r.description;  // XSS-01
        row.appendChild(desc);
      }

      list.appendChild(row);
    });

    // 推奨アプローチ
    const approachEl = document.getElementById("recommended-approach");
    if (approachEl) {
      const label = document.createElement("div");
      label.style.cssText = "font-size:.7rem;color:var(--accent,#e74c3c);font-weight:700;margin-bottom:6px";
      label.textContent = "💡 推奨アプローチ";
      approachEl.textContent = "";
      approachEl.appendChild(label);
      const txt = document.createElement("div");
      txt.textContent = recommendedApproach || "";  // XSS-01
      approachEl.appendChild(txt);
    }
  }

  function _updateGapBars(aiDeg, userDeg) {
    document.getElementById("bar-ai").style.width = `${(aiDeg / 180) * 100}%`;
    document.getElementById("bar-ai").textContent = `${aiDeg}°`;
    document.getElementById("bar-user").style.width = `${(userDeg / 180) * 100}%`;
    document.getElementById("bar-user").textContent = `${userDeg}°`;

    const gap = aiDeg - userDeg;
    const gapEl = document.getElementById("gap-msg");
    const detailEl = document.getElementById("gap-detail");

    let gapText, gapDetail;

    if (Math.abs(gap) <= 10) {
      gapEl.style.borderLeftColor = "#2ecc71";
      gapEl.style.background = "rgba(46,204,113,.1)";
      gapText = "✅ AI判定とほぼ一致！ 現実的な自己評価です。";
      gapDetail = "自分のやらかし度を客観的に捉えられています。この精度の高い自己認識が謝罪成功の重要な鍵です。";
    } else if (gap > 60) {
      gapText = `⚠️ AI判定より ${gap}° 低く見積もっています（楽観バイアス・強）`;
      gapDetail = `相手はあなたが思っているより深刻に受け取っています。謝罪が軽すぎると「反省していない」「また繰り返す」と判断されるリスクがあります。AI判定（${aiDeg}°）に近いレベルの誠意ある謝罪を意識してください。`;
    } else if (gap > 20) {
      gapText = `⚠️ AI判定より ${gap}° 低く見積もっています（楽観バイアス）`;
      gapDetail = `やや楽観的な評価です。相手の立場で考えると、受けた影響や感じた不信感がより大きい可能性があります。謝罪の深さが足りないと感じさせないよう、相手視点でのシミュレーションが有効です。`;
    } else if (gap > 0) {
      gapText = `AI判定より ${gap}° わずかに低い評価です`;
      gapDetail = "ほぼ適正な評価です。相手がわずかにシリアスに受け取っている可能性を念頭に置きながら謝罪に臨みましょう。";
    } else if (gap < -60) {
      gapText = `AI判定より ${Math.abs(gap)}° 高く見積もっています（自責過剰）`;
      gapDetail = `過剰な謝罪は相手に「大げさ」「何か隠しているのでは」という不自然な印象を与えることがあります。謝罪は問題の解決のためのものです。AI判定（${aiDeg}°）を参考に、適切なレベルに調整しましょう。`;
    } else if (gap < -20) {
      gapText = `AI判定より ${Math.abs(gap)}° 高く見積もっています（やや過剰な自責）`;
      gapDetail = "責任感の強さは誠実さとして伝わる面もありますが、過剰になると謝罪の焦点が「自分の苦しさ」にズレてしまいます。相手が何を求めているかに集中しましょう。";
    } else {
      gapText = `AI判定より ${Math.abs(gap)}° 高い自己評価です`;
      gapDetail = "少し厳しめの自己評価ですが、誠実な姿勢として相手に伝わることもあります。";
    }

    gapEl.textContent = gapText;  // XSS-01
    if (detailEl) detailEl.textContent = gapDetail;  // XSS-01
  }

  // ================================================================
  // Step 4: 相手確認
  // ================================================================
  async function _generateOpponent() {
    const result = await ApiClient.post("/opponent/generate", {
      incident_summary: _incidentSummary,
      enriched_summary: _enrichedSummary,
      ai_degree: _assessmentResult ? _assessmentResult.ai_degree : 0,
      stage_name: _assessmentResult ? _assessmentResult.stage_name : "",
      relationship: _relationship,
      opponent_gender:   _opponentAppearance.gender   !== "any" ? _opponentAppearance.gender   : "",
      opponent_race:     _opponentAppearance.race     !== "any" ? _opponentAppearance.race     : "",
      opponent_tone:     _opponentAppearance.tone     !== "any" ? _opponentAppearance.tone     : "",
      opponent_outfit:   _opponentAppearance.outfit   !== "any" ? _opponentAppearance.outfit   : "",
    });

    _opponentProfile = result;
    _currentPreset = "default";
    _renderOpponent(result);
    _showSection("step-opponent");
  }

  function _renderOpponent(profile) {
    // textContent による安全な挿入（XSS-01）
    document.getElementById("opp-type").textContent = profile.type || "";
    document.getElementById("opp-personality").textContent = profile.personality || "";
    document.getElementById("opp-anger").textContent = `${profile.anger_level ?? "-"}/100`;
    document.getElementById("opp-trust").textContent = `${profile.trust_level ?? "-"}/100`;
    document.getElementById("opp-tolerance").textContent = `${profile.tolerance ?? "-"}/100`;
    document.getElementById("opp-first-msg").textContent = profile.first_message || "";

    // 怒りポイント / NGワード
    const angerPointsEl = document.getElementById("opp-anger-points");
    angerPointsEl.textContent = "";
    (profile.anger_points || []).forEach((pt) => {
      const span = document.createElement("span");
      span.textContent = `⚡ ${pt}　`;
      angerPointsEl.appendChild(span);
    });

    const ngEl = document.getElementById("opp-ng-words");
    ngEl.textContent = "";
    (profile.ng_words || []).forEach((w) => {
      const span = document.createElement("span");
      span.textContent = `🚫 ${w}　`;
      ngEl.appendChild(span);
    });

    // アバター生成（性別・人種をオプションで指定）
    const avatarGender = (() => {
      const g = _opponentAppearance.gender;
      if (g === "male" || g === "female") return g;
      return profile.gender === "female" ? "female" : "male";
    })();
    const avatarRace = (() => {
      const r = _opponentAppearance.race;
      return (r && r !== "any") ? r : "asian";
    })();
    const seed = profile.avatar_seed || 42;

    // 外見オーバーライドを generate() の第1引数にまとめて渡す（facesjs.override は未エクスポートのため）
    const avatarOverrides = { seed };
    const hcKey = _opponentAppearance.hairColor;
    if (hcKey && hcKey !== "any" && HAIR_COLOR_MAP[hcKey]) {
      avatarOverrides.hair = { color: HAIR_COLOR_MAP[hcKey] };
    }
    if (_opponentAppearance.glasses === "on") {
      avatarOverrides.glasses = { id: GLASSES_IDS[seed % GLASSES_IDS.length] };
    } else if (_opponentAppearance.glasses === "off") {
      avatarOverrides.glasses = { id: "none" };
    }
    // 服装: baseball4 + teamColors でスーツ風に表現（スーツ色は suitColor から決定）
    const outfitCfg = _getOutfitConfig(_opponentAppearance.outfit, _opponentAppearance.suitColor);
    if (outfitCfg) {
      avatarOverrides.jersey = { id: outfitCfg.jersey };
      avatarOverrides.teamColors = outfitCfg.teamColors;
    }
    _faceConfig = window.facesjs.generate(avatarOverrides, { gender: avatarGender, race: avatarRace });

    _renderOpponentAvatar();

    // 再生成カウント表示
    document.getElementById("regen-count").textContent = _regenCount;
    document.getElementById("btn-regen-opponent").disabled = _regenCount >= MAX_REGEN;
  }

  function _renderOpponentAvatar() {
    if (!_faceConfig) return;
    const presetOverrides = OPPONENT_PRESETS[_currentPreset] || {};
    let config = _faceConfig;
    if (Object.keys(presetOverrides).length > 0) {
      // deep clone してプリセットを適用（facesjs.override は未エクスポート）
      config = JSON.parse(JSON.stringify(_faceConfig));
      _deepApply(config, presetOverrides);
    }
    requestAnimationFrame(() => {
      window.facesjs.display("opponent-avatar", config);
    });
  }

  function _initStep4() {
    // プリセット
    document.getElementById("preset-row").addEventListener("click", (e) => {
      const btn = e.target.closest(".preset-btn");
      if (!btn) return;
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _currentPreset = btn.dataset.preset;
      _renderOpponentAvatar();
    });

    // 再生成
    document.getElementById("btn-regen-opponent").addEventListener("click", () => {
      if (_regenCount >= MAX_REGEN) return;
      _regenCount++;
      _withLoading("btn-regen-opponent", () => _generateOpponent())
        .catch((err) => _setError("opponent-error", err.message));
    });

    // OK
    document.getElementById("btn-opponent-ok").addEventListener("click", () => {
      _withLoading("btn-opponent-ok", () => _submitPlanJob())
        .catch((err) => _setError("opponent-error", err.message));
    });
  }

  // ================================================================
  // Step 5: 謝罪プラン（SQS polling）
  // ================================================================
  async function _submitPlanJob() {
    const payload = {
      incident_summary: _incidentSummary,
      enriched_summary: _enrichedSummary,
      ai_degree: _assessmentResult ? _assessmentResult.ai_degree : 0,
      stage_name: _assessmentResult ? _assessmentResult.stage_name : "",
      opponent_type: _opponentProfile ? _opponentProfile.type : "",
      opponent_personality: _opponentProfile ? _opponentProfile.personality : "",
      opponent_anger_level: _opponentProfile ? _opponentProfile.anger_level : 0,
      opponent_ng_words: _opponentProfile ? (_opponentProfile.ng_words || []).join("、") : "",
      opponent_anger_points: _opponentProfile ? (_opponentProfile.anger_points || []).join("、") : "",
    };

    const result = await ApiClient.post("/plan/generate", payload);
    _planJobId = result.jobId;

    _showSection("step-plan");
    document.getElementById("plan-loading").hidden = false;
    document.getElementById("plan-content").hidden = true;
    document.getElementById("plan-error").hidden = true;

    try {
      const planResult = await ApiClient.pollJob(_planJobId, (status) => {
        const loadingEl = document.getElementById("plan-loading");
        if (loadingEl) {
          const p = loadingEl.querySelector("p");
          if (p) p.textContent = `生成中... (${status})`;
        }
      });

      // planResult はJSON文字列の場合がある（Claudeがmarkdownブロック付きで返す場合を考慮）
      let plan = planResult;
      if (typeof planResult === "string") {
        // ```json ... ``` または ``` ... ``` を除去してからパース
        const cleaned = planResult.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
        try { plan = JSON.parse(cleaned); } catch { /* テキストとして使用 */ }
      }
      _apologyPlan = plan;
      _renderPlan(plan);
      await _saveSession();
    } catch (err) {
      _showPlanError(err.message || "プランの生成に失敗しました");
    }
  }

  function _renderPlan(plan) {
    document.getElementById("plan-loading").hidden = true;
    document.getElementById("plan-content").hidden = false;

    // XSS-01: textContent 使用
    document.getElementById("plan-first-words").textContent = plan.first_words || "";
    document.getElementById("plan-full-script").textContent = plan.full_script || "";
    document.getElementById("plan-timing").textContent = plan.timing || "";
    document.getElementById("plan-gift").textContent = plan.gift || "";

    const todoEl = document.getElementById("plan-todo-list");
    todoEl.textContent = "";
    (plan.todo_list || []).forEach((todo) => {
      const row = document.createElement("div");
      row.className = "todo-item";
      const pri = document.createElement("span");
      pri.className = `todo-priority ${todo.priority === "中" ? "mid" : todo.priority === "低" ? "low" : "high"}`;
      pri.textContent = todo.priority || "高";
      const task = document.createElement("span");
      task.style.flex = "1";
      task.textContent = todo.task || "";
      const dl = document.createElement("span");
      dl.className = "todo-deadline";
      dl.textContent = todo.deadline || "";
      row.appendChild(pri);
      row.appendChild(task);
      row.appendChild(dl);
      todoEl.appendChild(row);
    });
  }

  function _showPlanError(msg) {
    document.getElementById("plan-loading").hidden = true;
    document.getElementById("plan-content").hidden = true;
    const errEl = document.getElementById("plan-error");
    errEl.hidden = false;
    document.getElementById("plan-error-msg").textContent = msg;  // XSS-01
  }

  function _initStep5() {
    document.getElementById("btn-to-schedule").addEventListener("click", () => {
      _showSection("step-schedule");
      _renderSchedule();
    });
    document.getElementById("btn-retry-plan").addEventListener("click", () => {
      _withLoading("btn-retry-plan", () => _submitPlanJob()).catch(() => {});
    });

    // ── 相談パネル toggle ──
    document.getElementById("consult-toggle").addEventListener("click", () => {
      const body = document.getElementById("consult-body");
      const icon = document.getElementById("consult-toggle-icon");
      body.hidden = !body.hidden;
      icon.textContent = body.hidden ? "▼ 開く" : "▲ 閉じる";
    });

    // ── 送信ボタン ──
    document.getElementById("btn-consult-send").addEventListener("click", () => _handleConsultSend());
    document.getElementById("consult-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        _handleConsultSend();
      }
    });

    // ── プランを更新する ──
    document.getElementById("btn-apply-revised").addEventListener("click", () => {
      if (!_pendingRevisedPlan || !_apologyPlan) return;
      // revised_plan の差分を _apologyPlan にマージ
      Object.assign(_apologyPlan, _pendingRevisedPlan);
      _renderPlan(_apologyPlan);
      _pendingRevisedPlan = null;
      document.getElementById("consult-revised-notice").hidden = true;
      // パネルを開いたままスクロール
      document.getElementById("consult-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ── 相談メッセージ送信ハンドラ ──
  function _handleConsultSend() {
    if (_consultHistory.length >= MAX_CONSULT_TURNS * 2) return;
    const msg = (document.getElementById("consult-input").value || "").trim();
    if (!msg) return;
    if (msg.length > 1000) {
      _setError("consult-error", "1000文字以内で入力してください");
      return;
    }
    _setError("consult-error", "");
    document.getElementById("consult-input").value = "";

    _addConsultBubble("user", msg);
    _consultHistory.push({ role: "user", content: msg });

    document.getElementById("btn-consult-send").disabled = true;

    _doConsult(msg).catch((err) => {
      _setError("consult-error", `エラー: ${err.message || "通信に失敗しました"}`);
    }).finally(() => {
      document.getElementById("btn-consult-send").disabled = false;
      const remaining = MAX_CONSULT_TURNS - Math.floor(_consultHistory.length / 2);
      if (remaining <= 0) {
        document.getElementById("consult-turn-limit").hidden = false;
        document.getElementById("btn-consult-send").disabled = true;
        document.getElementById("consult-input").disabled = true;
      }
    });
  }

  async function _doConsult(userMsg) {
    // プランの概要（first_words + timing を300字以内で要約）
    const planSummary = _apologyPlan
      ? `第一声: ${(_apologyPlan.first_words || "").slice(0, 100)} / タイミング: ${(_apologyPlan.timing || "").slice(0, 100)}`
      : "";

    const result = await ApiClient.post("/plan/consult", {
      incident_summary: _incidentSummary,
      opponent_type:        _opponentProfile ? _opponentProfile.type : "",
      opponent_anger_level: _opponentProfile ? (_opponentProfile.anger_level || 50) : 50,
      current_plan_summary: planSummary,
      conversation_history: _consultHistory.slice(0, -1),  // 直前のuser発言は除外（APIで末尾に追加済み）
      user_message: userMsg,
    });

    const advice = result.advice || "";
    _addConsultBubble("assistant", advice);
    _consultHistory.push({ role: "assistant", content: advice });

    // revised_plan がある場合は通知
    if (result.revised_plan && Object.keys(result.revised_plan).length > 0) {
      _pendingRevisedPlan = result.revised_plan;
      const keys = Object.keys(result.revised_plan);
      const keyNames = { first_words: "第一声", full_script: "台本", timing: "タイミング", gift: "手土産", todo_list: "ToDo" };
      const changed = keys.map((k) => keyNames[k] || k).join("・");
      document.getElementById("consult-revised-msg").textContent = `「${changed}」の修正案があります。`;
      document.getElementById("consult-revised-notice").hidden = false;
    }

    // 送信欄にスクロール
    const chatArea = document.getElementById("consult-chat-area");
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function _addConsultBubble(role, text) {
    const area = document.getElementById("consult-chat-area");
    const bubble = document.createElement("div");
    bubble.className = `consult-bubble ${role}`;
    bubble.textContent = text;  // XSS-01
    area.appendChild(bubble);
    area.scrollTop = area.scrollHeight;
  }

  // ================================================================
  // Step 6: スケジュール
  // ================================================================
  async function _saveSession() {
    if (!_apologyPlan) return;
    try {
      const result = await ApiClient.post("/sessions", {
        incident_summary: _incidentSummary,
        enriched_summary: _enrichedSummary,
        ai_degree: _assessmentResult ? _assessmentResult.ai_degree : 0,
        user_degree: _selfDegree,
        opponent_profile: JSON.stringify(_opponentProfile),
        apology_plan: JSON.stringify(_apologyPlan),
      });
      _sessionId = result.sessionId;
    } catch (err) {
      console.error("Session save failed", err);
    }
  }

  function _renderSchedule() {
    const today = new Date();
    const dateEl = document.getElementById("apology-date");
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    dateEl.min = `${yyyy}-${mm}-${dd}`;
  }

  function _initStep6() {
    document.getElementById("btn-save-date").addEventListener("click", () => {
      const dateVal = document.getElementById("apology-date").value;
      if (!dateVal) {
        _setError("schedule-error", "実施日を選択してください");
        return;
      }
      _setError("schedule-error", "");

      _withLoading("btn-save-date", async () => {
        if (_sessionId) {
          await ApiClient.post("/sessions", {
            session_id: _sessionId,
            apology_date: dateVal,
          });
        }
        // カウントダウン表示
        const apologyDate = new Date(dateVal);
        const todayMs = Date.now();
        const diffDays = Math.ceil((apologyDate.getTime() - todayMs) / (1000 * 60 * 60 * 24));
        document.getElementById("countdown-days").textContent = Math.max(0, diffDays);
        document.getElementById("countdown-area").hidden = false;
        document.getElementById("btn-save-date").hidden = true;

        // 当日または翌日 → Step7 案内
        if (diffDays <= 1) {
          _showSection("step-day-support");
          _renderDaySupport();
        }
      }).catch((err) => _setError("schedule-error", err.message));
    });
  }

  // ================================================================
  // Step 7: 当日直前サポート
  // ================================================================
  function _renderDaySupport() {
    const checklistEl = document.getElementById("day-checklist");
    checklistEl.textContent = "";
    DAY_CHECKLIST.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "checklist-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = `check-${i}`;
      const lbl = document.createElement("label");
      lbl.htmlFor = `check-${i}`;
      lbl.textContent = item;  // XSS-01（定数文字列）
      row.appendChild(cb);
      row.appendChild(lbl);
      checklistEl.appendChild(row);
    });

    // 直前アドバイスは assessmentResult から
    const adviceEl = document.getElementById("day-approach");
    if (_assessmentResult && _assessmentResult.recommended_approach) {
      adviceEl.textContent = _assessmentResult.recommended_approach;  // XSS-01
    } else {
      adviceEl.textContent = "深呼吸をして、相手への誠意をもって臨みましょう。";
    }
  }

  // ================================================================
  // 初期化
  // ================================================================
  async function _init() {
    // 認証チェック
    try {
      await AuthModule.requireAuth();
    } catch {
      return; // requireAuth() がリダイレクト済み
    }

    _showLoading(false);

    // 謝罪当日チェック（sessionStorage にセッション情報があれば）
    const savedDate = StateManager.getPersistent("inception_apology_date");
    if (savedDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (savedDate === today) {
        _showSection("step-day-support");
        _renderDaySupport();
        return;
      }
    }

    _showSection("step-input");

    _initStep1();
    _initStep2();
    _initStep3();
    _initStep4();
    _initStep5();
    _initStep6();
  }

  document.addEventListener("DOMContentLoaded", _init);
})();
