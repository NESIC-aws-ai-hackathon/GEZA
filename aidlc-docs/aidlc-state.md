# AI-DLC 状態トラッキング

## プロジェクト情報
- **プロジェクト名**: GEZA（謝罪丸投げコンシェルジュ）
- **プロジェクトタイプ**: Greenfield
- **開始日**: 2026-04-29
- **現在のステージ**: CONSTRUCTION - U4 Functional Design（Part 1: Planning）
- **コンセプト**: 謝罪丸投げコンシェルジュ（コア: 謝罪角度アセスメント・台本フル生成、謝罪中支援: 怒り残量スキャナー・GEZA耳打ちモード【決勝拡張】、継続支援: 送る前チェック・返信分析・謝罪カルテ・傾向診断、オプション: リハーサルモード）

## ワークスペース状態
- **既存コード**: prototype/（実現性検証済み・AWS削除済み）
- **リバースエンジニアリング要否**: 不要
- **ワークスペースルート**: z:\oono.toshiki\OneDrive - Business1\code\AIハッカソン\GEZA

## コード配置ルール
- **アプリケーションコード**: ワークスペースルート（aidlc-docs/ 以外）
- **AI-DLC成果物（正）**: `aidlc-docs/` 配下のみ（機械可読形式・フェーズ管理対象）
- **人間向け参照資料**: `docs/` 配下（AI-DLC成果物から要点を抽出した可読版、AGENTS.mdが参照するのはこちら）
  - `docs/draft-user-stories.md`: チーム初期検討用草稿（正式版: `aidlc-docs/inception/user-stories/stories.md`）

## Extension Configuration
| Extension | Enabled | Decided At |
|---|---|---|
| security-baseline | **有効** | 2026-05-05 U0開始時 |
| property-based-testing | **有効（フル適用）** | 2026-05-05 U0開始時 |

## ステージ進捗

### 🔵 INCEPTION PHASE
- [x] Workspace Detection
- [x] Requirements Analysis（完了・承認済み）
- [x] User Stories（41ストーリー/271SP・承認済み・コンセプト変更反映済）
- [x] **Prototype / Feasibility Verification（実現性プロトタイプ完了）**
- [x] Workflow Planning（execution-plan.md 完成・承認済み）
- [x] Application Design（成果物5ファイル生成完了・承認済み）
- [x] Units Generation ← **完了・承認済み**

### 🟢 CONSTRUCTION PHASE
- [x] Functional Design — U0 完了（2026-05-05）
- [x] NFR Requirements — U0 完了（2026-05-05）
- [x] NFR Design — U0 完了（2026-05-05）
- [x] Infrastructure Design — U0 完了（2026-05-05）
- [x] Code Generation — U0 完了（2026-05-05）
- [x] Deploy & Test — U0 完了（2026-05-05）✅ sam deploy CREATE_COMPLETE / スモークテスト PASS
- [x] Functional Design — U1 完了（2026-05-05）✅ 承認済み（NEW_PASSWORD_REQUIRED/MFA_SETUP フロー追加反映）
- [x] NFR Requirements — U1 完了（2026-05-05）✅ 承認済み
- [x] NFR Design — U1 完了（2026-05-05）✅ 承認済み
- [x] Infrastructure Design — U1 完了（2026-05-05）✅ 承認済み
- [x] Code Generation — U1 完了（2026-05-05）✅ 承認済み
- [x] Deploy & Test — U1 完了（2026-05-05）✅ S3 sync + CF Invalidation + スモークテスト PASS
- [x] Functional Design — U2 ✅ 承認済み
- [x] NFR Requirements — U2 ✅ 承認済み
- [x] NFR Design — U2 ✅ 承認済み
- [x] Infrastructure Design — U2 ✅ 承認済み
- [x] Code Generation — U2 ✅ 完了
- [x] Deploy & Test — U2 ✅ 完了（2026-05-06）✅ sam deploy成功 / AccessDeniedException解消 / UI改善（Step3再構成・乖離分析6段階・description追加） / スモークテスト PASS
- [x] Functional Design — U2-EXT ✅ 承認済み（継続的相談機能）
- [x] NFR Requirements — U2-EXT ✅ 承認済み
- [x] NFR Design — U2-EXT ✅ 承認済み
- [x] Infrastructure Design — U2-EXT ✅ 承認済み
- [x] Code Generation — U2-EXT ✅ 完了（ConsultPlanFunction / consult_plan.txt / inception.html・inception.js・style.css更新）
- [x] Deploy & Test — U2-EXT ✅ 完了（2026-05-06）✅ sam deploy成功（ConsultPlanFunction CREATE_COMPLETE） / S3アップロード全4ファイル完了 / CF Invalidation実行（I8C6DJUSI2894BN9YAMO2G0GP0） / スモークテスト PASS（/plan/consult→401・CloudFront→200・DynamoDB→ACTIVE）
- [x] Functional Design — U3 ✅ 承認済み
- [x] NFR Requirements — U3 ✅ 承認済み
- [x] NFR Design — U3 ✅ 承認済み
- [x] Infrastructure Design — U3 ✅ 承認済み
- [x] Code Generation — U3 ✅ 完了
- [x] Deploy & Test — U3 ✅ 完了（2026-05-07）✅ sam deploy成功 / S3 sync 13ファイル / CloudFront Invalidation / スモークテスト全PASS（API 401×3・CF 200×3・DynamoDB ACTIVE・Lambda 1024MB/29s）
  - **Post-Deploy 修正（2026-05-09）**: get-sessions Decimal修正 + html.unescape / input_validator no_html_escape / save-session 4フィールド no_html_escape / evaluate-apology max_tokens 2048 + 正規表現フォールバック
  - **機能追加（2026-05-09）**: consult-plan current_todo_list連携 / case-detail.js TODO送信対応

---

## プロトタイプ検証結果サマリー（2026-04-29〜30）

### 確定技術スタック（プロトタイプで実証済み）

| レイヤー | 採用技術 | 根拠 |
|---------|---------|------|
| フロントエンド | HTML/CSS/Vanilla JS + facesjs SVGアバター | SVGアバターがMP4動画より柔軟・低コスト |
| バックエンド | Lambda（Python 3.12, 512MB, 30s） | 実測OK |
| LLM | Amazon Nova Lite / Claude Haiku 4.5 / Claude Sonnet（3プロファイル制） | Nova Lite: 評価・分類等軽量用途、Haiku 4.5: プラン生成等標準用途、Sonnet: 美文生成等高品質用途 |
| 音声合成 | Amazon Polly（女性: Kazuha / 男性: Takumi, ja-JP, Neural） + SpeechMarks | Viseme口パク同期実証済み |
| アバター | facesjs v5.0.3（フォーク・data-feature属性追加） | CSS表情制御実証済み |

### 変更確定事項（要件更新が必要）

| 項目 | 当初要件 | プロトタイプ後の変更 | 理由 |
|------|---------|------------------|------|
| アバター | Nova Canvas/Reel MP4動画（10種類） | facesjs SVGアバター | レスポンス速度・コスト・感情制御の柔軟性 |
| LLMモデル | Claude Sonnet 3.5 / Haiku 3 | Nova Lite / Claude Haiku 4.5 / Claude Sonnet（3プロファイル制） | 軽量・標準・高品質の用途別割り当て |
| 感情数 | 10種類 | **200種類（15カテゴリ）（確定）** | カテゴリ内ランダム遷移で自然な表情揺らぎ |
| 音声出力 | 未定 | Polly + SpeechMarks Viseme | 口パク同期実証済み |

