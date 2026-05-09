/**
 * avatar-animator.js — GEZA アバター自然アニメーションコントローラー
 *
 * プロトタイプ準拠:
 *   - まばたき: SVG eye wrapper の scaleY(0.05) で瞬き
 *   - 視線: eye wrapper を微小 translate で揺らす
 *   - 口の動き: mouth wrapper の scaleX/scaleY で感情豊かな口変化
 *   - 表情変化: 眉(transform)・目(scaleY)・口(scaleX/Y)をアニメーション
 *   - 呼吸: headIdle CSS（style.css）で常時ゆらぎ
 *   - ジェスチャー: headNod / headShake / headDramatic CSS
 *
 * 依存: facesjs.min.js（window.facesjs）
 * XSS-01 準拠: ユーザー入力を DOM に挿入しない
 */
var AvatarAnimator = (function () {
  "use strict";

  // ================================================================
  // 表情プリセット — 眉・目・口の transform で表現（再描画なし）
  // ================================================================
  // mouthX: scaleX(口の横幅)  mouthY: scaleY(口の縦幅)  mouthTY: translateY(口の位置)
  var EXPRESSION_PRESETS = [
    // ── 激怒 ──
    { browL: "rotate(14deg) translateY(-3px)", browR: "rotate(-14deg) translateY(-3px)", eyeScale: "scaleY(0.72)",
      mouthX: "scaleX(1.15)", mouthY: "scaleY(0.6)",  mouthTY: "translateY(2px)"  },
    { browL: "rotate(16deg) translateY(-4px)", browR: "rotate(-16deg) translateY(-4px)", eyeScale: "scaleY(0.7)",
      mouthX: "scaleX(1.2)",  mouthY: "scaleY(0.5)",  mouthTY: "translateY(3px)"  },
    // ── 怒り ──
    { browL: "rotate(12deg) translateY(-2px)", browR: "rotate(-12deg) translateY(-2px)", eyeScale: "scaleY(0.8)",
      mouthX: "scaleX(1.1)",  mouthY: "scaleY(0.65)", mouthTY: "translateY(2px)"  },
    { browL: "rotate(10deg) translateY(-1px)", browR: "rotate(-10deg) translateY(-1px)", eyeScale: "scaleY(0.85)",
      mouthX: "scaleX(1.0)",  mouthY: "scaleY(0.7)",  mouthTY: "translateY(1px)"  },
    // ── 苛立ち ──
    { browL: "rotate(8deg)",                   browR: "rotate(-8deg)",                   eyeScale: "scaleY(0.88)",
      mouthX: "scaleX(0.85)", mouthY: "scaleY(0.8)",  mouthTY: "translateY(1px)"  },
    { browL: "rotate(7deg)",                   browR: "rotate(-7deg)",                   eyeScale: "scaleY(0.9)",
      mouthX: "scaleX(0.8)",  mouthY: "scaleY(0.85)", mouthTY: "translateY(0px)"  },
    { browL: "rotate(9deg) translateY(-1px)",  browR: "rotate(-5deg)",                   eyeScale: "scaleY(0.87)",
      mouthX: "scaleX(0.9)",  mouthY: "scaleY(0.75)", mouthTY: "translateY(1px)"  },
    // ── 失望・悲しみ ──
    { browL: "rotate(-8deg) translateY(4px)",  browR: "rotate(8deg) translateY(4px)",   eyeScale: "scaleY(0.78)",
      mouthX: "scaleX(0.85)", mouthY: "scaleY(0.8)",  mouthTY: "translateY(3px)"  },
    { browL: "rotate(-6deg) translateY(3px)",  browR: "rotate(6deg) translateY(3px)",   eyeScale: "scaleY(0.82)",
      mouthX: "scaleX(0.9)",  mouthY: "scaleY(0.7)",  mouthTY: "translateY(2px)"  },
    { browL: "rotate(-10deg) translateY(5px)", browR: "rotate(10deg) translateY(5px)",  eyeScale: "scaleY(0.72)",
      mouthX: "scaleX(0.8)",  mouthY: "scaleY(0.65)", mouthTY: "translateY(4px)"  },
    { browL: "rotate(-5deg) translateY(2px)",  browR: "rotate(5deg) translateY(2px)",   eyeScale: "scaleY(0.85)",
      mouthX: "scaleX(0.88)", mouthY: "scaleY(0.75)", mouthTY: "translateY(2px)"  },
    // ── 驚き ──
    { browL: "translateY(-7px)",               browR: "translateY(-7px)",                eyeScale: "scaleY(1.15)",
      mouthX: "scaleX(1.0)",  mouthY: "scaleY(1.6)",  mouthTY: "translateY(-2px)" },
    { browL: "translateY(-9px)",               browR: "translateY(-9px)",                eyeScale: "scaleY(1.2)",
      mouthX: "scaleX(0.9)",  mouthY: "scaleY(1.8)",  mouthTY: "translateY(-3px)" },
    { browL: "translateY(-5px)",               browR: "translateY(-5px)",                eyeScale: "scaleY(1.1)",
      mouthX: "scaleX(1.05)", mouthY: "scaleY(1.5)",  mouthTY: "translateY(-1px)" },
    { browL: "translateY(-6px) rotate(-2deg)", browR: "translateY(-6px) rotate(2deg)",  eyeScale: "scaleY(1.12)",
      mouthX: "scaleX(0.95)", mouthY: "scaleY(1.7)",  mouthTY: "translateY(-2px)" },
    // ── 納得・嬉しい ──
    { browL: "rotate(-2deg)",                  browR: "rotate(2deg)",                    eyeScale: "scaleY(1.05)",
      mouthX: "scaleX(1.1)",  mouthY: "scaleY(1.2)",  mouthTY: "translateY(-1px)" },
    { browL: "rotate(-3deg) translateY(1px)",  browR: "rotate(3deg) translateY(1px)",   eyeScale: "scaleY(1.0)",
      mouthX: "scaleX(1.2)",  mouthY: "scaleY(1.15)", mouthTY: "translateY(-1px)" },
    // ── 穏やか ──
    { browL: "rotate(0deg)",                   browR: "rotate(0deg)",                    eyeScale: "scaleY(1)",
      mouthX: "scaleX(1.0)",  mouthY: "scaleY(1.0)",  mouthTY: "translateY(0px)"  },
    { browL: "rotate(-1deg) translateY(1px)",  browR: "rotate(1deg) translateY(1px)",   eyeScale: "scaleY(0.98)",
      mouthX: "scaleX(0.95)", mouthY: "scaleY(1.0)",  mouthTY: "translateY(1px)"  },
    // ── 困惑 ──
    { browL: "rotate(5deg) translateY(-2px)",  browR: "rotate(-10deg) translateY(3px)", eyeScale: "scaleY(0.9)",
      mouthX: "scaleX(0.75)", mouthY: "scaleY(0.9)",  mouthTY: "translateY(1px)"  },
    { browL: "rotate(-3deg) translateY(2px)",  browR: "rotate(8deg) translateY(-3px)",  eyeScale: "scaleY(0.93)",
      mouthX: "scaleX(0.8)",  mouthY: "scaleY(0.85)", mouthTY: "translateY(1px)"  },
    { browL: "rotate(7deg) translateY(-1px)",  browR: "rotate(-5deg) translateY(2px)",  eyeScale: "scaleY(0.88)",
      mouthX: "scaleX(0.7)",  mouthY: "scaleY(0.9)",  mouthTY: "translateY(0px)"  },
    // ── ニュートラル ──
    { browL: "rotate(0deg) translateY(0px)",   browR: "rotate(0deg) translateY(0px)",   eyeScale: "scaleY(1)",
      mouthX: "scaleX(1.0)",  mouthY: "scaleY(1.0)",  mouthTY: "translateY(0px)"  },
    { browL: "rotate(1deg)",                   browR: "rotate(-1deg)",                   eyeScale: "scaleY(0.98)",
      mouthX: "scaleX(1.05)", mouthY: "scaleY(0.95)", mouthTY: "translateY(0px)"  },
    { browL: "rotate(-1deg)",                  browR: "rotate(1deg)",                    eyeScale: "scaleY(1.02)",
      mouthX: "scaleX(0.98)", mouthY: "scaleY(1.0)",  mouthTY: "translateY(0px)"  },
    { browL: "rotate(2deg) translateY(-1px)",  browR: "rotate(-2deg) translateY(-1px)", eyeScale: "scaleY(0.96)",
      mouthX: "scaleX(1.0)",  mouthY: "scaleY(0.95)", mouthTY: "translateY(1px)"  },
    // ── 鼻で笑う / 軽蔑 ──
    { browL: "rotate(4deg)",                   browR: "rotate(-8deg) translateY(-2px)", eyeScale: "scaleY(0.88)",
      mouthX: "scaleX(0.75)", mouthY: "scaleY(0.75)", mouthTY: "translateY(2px)"  },
    { browL: "rotate(-4deg) translateY(2px)",  browR: "rotate(6deg) translateY(-3px)",  eyeScale: "scaleY(0.9)",
      mouthX: "scaleX(0.7)",  mouthY: "scaleY(0.8)",  mouthTY: "translateY(2px)"  },
  ];

  // ================================================================
  // SVG ユーティリティ
  // ================================================================

  function _svgWrap(el, cls) {
    if (!el) return null;
    var w = document.createElementNS("http://www.w3.org/2000/svg", "g");
    w.setAttribute("class", cls);
    w.style.transformBox = "fill-box";
    w.style.transformOrigin = "center center";
    el.parentNode.insertBefore(w, el);
    w.appendChild(el);
    return w;
  }

  // ================================================================
  // ファクトリ
  // ================================================================

  function create(containerId, baseFaceConfig) {
    var _base = baseFaceConfig;
    var _timers = [];
    var _gestureActive = false;

    var _refs = {
      svg: null,
      faceGroup: null,
      eyeL: null, eyeR: null,
      browL: null, browR: null,
      mouth: null,
      eyeLWrap: null, eyeRWrap: null,
      browLWrap: null, browRWrap: null,
      mouthWrap: null,
      _eyeBaseTransform: "scaleY(1)"
    };

    var _shuffled = EXPRESSION_PRESETS.slice().sort(function () { return Math.random() - 0.5; });
    var _presetIdx = 0;
    var _isSpeaking = false;  // 発話中は口ループを停止

    // ── タイマー管理 ──
    function _schedule(fn, delay) {
      var id = setTimeout(function () {
        var i = _timers.indexOf(id);
        if (i !== -1) _timers.splice(i, 1);
        fn();
      }, delay);
      _timers.push(id);
      return id;
    }

    // ── SVG 参照取得 ──
    function _initRefs() {
      var container = document.getElementById(containerId);
      if (!container) return false;
      var svg = container.querySelector("svg");
      if (!svg) return false;
      _refs.svg = svg;

      // #face-group 確保
      var fg = svg.querySelector("#face-group");
      if (!fg) {
        fg = document.createElementNS("http://www.w3.org/2000/svg", "g");
        fg.id = "face-group";
        var children = Array.from(svg.children);
        children.forEach(function (child) {
          var tag = child.tagName.toLowerCase();
          if (tag !== "defs" && tag !== "style") fg.appendChild(child);
        });
        svg.appendChild(fg);
      }
      _refs.faceGroup = fg;

      _refs.eyeL  = svg.querySelector('[data-feature="eye"][data-index="0"]');
      _refs.eyeR  = svg.querySelector('[data-feature="eye"][data-index="1"]');
      _refs.browL = svg.querySelector('[data-feature="eyebrow"][data-index="0"]');
      _refs.browR = svg.querySelector('[data-feature="eyebrow"][data-index="1"]');
      _refs.mouth = svg.querySelector('[data-feature="mouth"]');

      // 各パーツをラッパーで包む（既にラップ済みなら再利用）
      _refs.eyeLWrap  = _ensureWrap(_refs.eyeL,  "eye-wrap");
      _refs.eyeRWrap  = _ensureWrap(_refs.eyeR,  "eye-wrap");
      _refs.browLWrap = _ensureWrap(_refs.browL, "brow-wrap");
      _refs.browRWrap = _ensureWrap(_refs.browR, "brow-wrap");
      _refs.mouthWrap = _ensureWrap(_refs.mouth, "mouth-wrap");

      return !!(_refs.eyeLWrap || _refs.browLWrap);
    }

    function _ensureWrap(el, cls) {
      if (!el) return null;
      if (el.parentNode && el.parentNode.classList && el.parentNode.classList.contains(cls)) {
        return el.parentNode;
      }
      return _svgWrap(el, cls);
    }

    // ── まばたき（eye wrapper scaleY で瞬き）──
    function _doBlink() {
      var wraps = [_refs.eyeLWrap, _refs.eyeRWrap];
      wraps.forEach(function (w) {
        if (!w) return;
        w.style.transition = "transform 0.06s ease-in";
        w.style.transform = "scaleY(0.05)";
      });
      _schedule(function () {
        var base = _refs._eyeBaseTransform || "scaleY(1)";
        wraps.forEach(function (w) {
          if (!w) return;
          w.style.transition = "transform 0.14s ease-out";
          w.style.transform = base;
        });
        if (Math.random() < 0.2) {
          _schedule(function () {
            wraps.forEach(function (w) {
              if (!w) return;
              w.style.transition = "transform 0.05s ease-in";
              w.style.transform = "scaleY(0.05)";
            });
            _schedule(function () {
              var base2 = _refs._eyeBaseTransform || "scaleY(1)";
              wraps.forEach(function (w) {
                if (!w) return;
                w.style.transition = "transform 0.12s ease-out";
                w.style.transform = base2;
              });
            }, 70);
          }, 200);
        }
      }, 80);
    }

    function _loopBlink() {
      _doBlink();
      _schedule(_loopBlink, 2500 + Math.random() * 4000);
    }

    // ── アイドル視線（eye wrapper を微小 translate で揺らす）──
    function _doGaze() {
      if (!_refs.eyeLWrap) return;
      var ox = (Math.random() - 0.5) * 4;
      var oy = (Math.random() - 0.5) * 2.5;
      var base = _refs._eyeBaseTransform || "scaleY(1)";
      [_refs.eyeLWrap, _refs.eyeRWrap].forEach(function (w) {
        if (!w) return;
        w.style.transition = "transform 0.3s ease";
        w.style.transform = base + " translate(" + ox + "px, " + oy + "px)";
      });
      _schedule(function () {
        [_refs.eyeLWrap, _refs.eyeRWrap].forEach(function (w) {
          if (!w) return;
          w.style.transition = "transform 0.4s ease";
          w.style.transform = base;
        });
      }, 350 + Math.random() * 400);
    }

    function _loopGaze() {
      _doGaze();
      _schedule(_loopGaze, 3500 + Math.random() * 5000);
    }

    // ── 口の idle 微動（breathing）──
    function _doMouthBreath() {
      if (!_refs.mouthWrap) return;
      var sx = 0.95 + Math.random() * 0.1;   // 0.95〜1.05
      var sy = 0.9  + Math.random() * 0.2;    // 0.9〜1.1
      _refs.mouthWrap.style.transition = "transform 0.8s ease-in-out";
      _refs.mouthWrap.style.transform = "scaleX(" + sx + ") scaleY(" + sy + ")";
      _schedule(function () {
        if (!_refs.mouthWrap) return;
        _refs.mouthWrap.style.transition = "transform 1.0s ease-in-out";
        _refs.mouthWrap.style.transform = "scaleX(1) scaleY(1)";
      }, 900);
    }

    function _loopMouthBreath() {
      _doMouthBreath();
      _schedule(_loopMouthBreath, 3000 + Math.random() * 4000);
    }

    // ── 表情変化（眉・目・口の transform を変更）──
    function _doExpression() {
      _doExpressionFromGroup();
    }

    function _loopExpression() {
      _doExpression();
      _schedule(_loopExpression, 4000 + Math.random() * 4000);
    }

    // ── ジェスチャー（headNod / headShake / headDramatic CSS）──
    function _applyGesture(animName, durationMs) {
      if (_gestureActive) return;
      var fg = _refs.faceGroup;
      if (!fg) return;
      _gestureActive = true;
      fg.style.animation = animName + " " + durationMs + "ms ease-in-out 1 forwards";
      _schedule(function () {
        if (_refs.faceGroup) _refs.faceGroup.style.animation = "";
        _gestureActive = false;
      }, durationMs + 80);
    }

    function _doGesture() {
      var r = Math.random();
      if      (r < 0.38) _applyGesture("headNod",      900);
      else if (r < 0.60) _applyGesture("headShake",    750);
      else if (r < 0.76) _applyGesture("headDramatic", 1100);
    }

    function _loopGesture() {
      _doGesture();
      _schedule(_loopGesture, 8000 + Math.random() * 9000);
    }

    // ── 公開 API ──
    function start() {
      if (!_initRefs()) {
        _schedule(function () {
          if (_initRefs()) _startLoops();
        }, 300);
        return;
      }
      _startLoops();
    }

    function _startLoops() {
      _schedule(_loopBlink,       500  + Math.random() * 1000);
      _schedule(_loopGaze,        2000 + Math.random() * 1500);
      _schedule(_loopExpression,  3000 + Math.random() * 2000);
      _schedule(_loopMouthBreath, 1500 + Math.random() * 1500);
      _schedule(_loopGesture,     6000 + Math.random() * 4000);
    }

    function stop() {
      _timers.forEach(clearTimeout);
      _timers = [];
    }

    function updateBase(newFaceConfig) {
      _base = newFaceConfig;
    }

    /**
     * リップシンク用 口パク（facesjs 再描画なしで mouthWrap を直接操作）
     * PollySyncController の avatarController.setMouthViseme と互換
     */
    function setMouthViseme(viseme) {
      if (!_refs.mouthWrap) return;
      var sy, sx;
      if (viseme === "a" || viseme === "e") {
        sy = "scaleY(1.9)"; sx = "scaleX(1.1)";
      } else if (viseme === "o") {
        sy = "scaleY(1.7)"; sx = "scaleX(0.9)";
      } else if (viseme === "i") {
        sy = "scaleY(1.2)"; sx = "scaleX(1.2)";
      } else if (viseme === "u") {
        sy = "scaleY(1.1)"; sx = "scaleX(0.85)";
      } else {
        sy = "scaleY(1.0)"; sx = "scaleX(1.0)";
      }
      _refs.mouthWrap.style.transition = "transform 0.05s ease-out";
      _refs.mouthWrap.style.transform = sx + " " + sy;
    }

    /**
     * 感情カテゴリに応じてそのグループ内のプリセットをランダムローテーション
     * evaluate-apology の emotion_label（15カテゴリ）に対応
     */
    var _emotionGroupIndices = null; // null = 全プリセットから選択

    // EXPRESSION_PRESETS のインデックスを感情グループに対応させる
    // プリセット配列の順序: 激怒(0-1) 怒り(2-3) 苛立ち(4-6) 失望/悲(7-10) 驚き(11-14)
    //                      納得/嬉(15-16) 穏やか(17-18) 困惑(19-21) ニュートラル(22-25) 軽蔑(26-27)
    var EMOTION_GROUP_MAP = {
      anger:          [0, 1, 2, 3],
      contempt:       [26, 27],
      disgust:        [26, 27, 4, 5],
      frustration:    [4, 5, 6, 2, 3],
      irritation:     [4, 5, 6],
      disappointment: [7, 8, 9, 10],
      sadness:        [7, 8, 9, 10],
      confusion:      [19, 20, 21],
      surprise:       [11, 12, 13, 14],
      suspicion:      [4, 5, 19, 20],
      relief:         [15, 16, 17, 18],
      acceptance:     [15, 16, 17, 18],
      trust:          [15, 16, 17, 18],
      satisfaction:   [15, 16],
      neutral:        [22, 23, 24, 25],
    };

    function setCategoryEmotion(emotionLabel) {
      var indices = EMOTION_GROUP_MAP[emotionLabel] || EMOTION_GROUP_MAP["neutral"];
      _emotionGroupIndices = indices.slice().sort(function () { return Math.random() - 0.5; });
      _presetIdx = 0;
      // 即座に表情を適用
      _doExpressionFromGroup();
    }

    function _doExpressionFromGroup() {
      var preset;
      if (_emotionGroupIndices !== null) {
        preset = EXPRESSION_PRESETS[_emotionGroupIndices[_presetIdx % _emotionGroupIndices.length]];
      } else {
        if (_presetIdx >= _shuffled.length) {
          _shuffled.sort(function () { return Math.random() - 0.5; });
          _presetIdx = 0;
        }
        preset = _shuffled[_presetIdx];
      }
      _presetIdx++;

      if (_refs.browLWrap) {
        _refs.browLWrap.style.transition = "transform 0.6s ease";
        _refs.browLWrap.style.transform = preset.browL;
      }
      if (_refs.browRWrap) {
        _refs.browRWrap.style.transition = "transform 0.6s ease";
        _refs.browRWrap.style.transform = preset.browR;
      }
      _refs._eyeBaseTransform = preset.eyeScale;
      [_refs.eyeLWrap, _refs.eyeRWrap].forEach(function (w) {
        if (!w) return;
        w.style.transition = "transform 0.5s ease";
        w.style.transform = preset.eyeScale;
      });
      // 口（発話中はループ中の口更新をスキップ。setMouthViseme が担当）
      if (!_isSpeaking && _refs.mouthWrap && preset.mouthX) {
        var mouthTf = preset.mouthX + " " + preset.mouthY + " " + (preset.mouthTY || "translateY(0)");
        _refs.mouthWrap.style.transition = "transform 0.5s ease";
        _refs.mouthWrap.style.transform = mouthTf;
      }
    }

    function setSpeaking(speaking) {
      _isSpeaking = !!speaking;
      // 発話終了時に口をアイドル位置に戻す
      if (!_isSpeaking && _refs.mouthWrap) {
        _refs.mouthWrap.style.transition = "transform 0.2s ease";
        _refs.mouthWrap.style.transform = "scaleX(1) scaleY(1) translateY(0)";
      }
    }

    return { start: start, stop: stop, updateBase: updateBase, setMouthViseme: setMouthViseme, setCategoryEmotion: setCategoryEmotion, setSpeaking: setSpeaking };
  }

  return { create: create, EXPRESSION_PRESETS: EXPRESSION_PRESETS };
})();

window.AvatarAnimator = AvatarAnimator;
