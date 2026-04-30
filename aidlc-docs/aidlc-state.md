# AI-DLC 状態トラッキング

## プロジェクト情報
- **プロジェクト名**: GEZA（謝罪練習アプリ）
- **プロジェクトタイプ**: Greenfield
- **開始日**: 2026-04-29
- **現在のステージ**: INCEPTION - Units Generation
- **コンセプト**: 総合謝罪支援コンシェルジュ（主: 謝罪角度アセスメント・プランニング、サブ: 練習シミュレーション）

## ワークスペース状態
- **既存コード**: prototype/（実現性検証済み・AWS削除済み）
- **リバースエンジニアリング要否**: 不要
- **ワークスペースルート**: z:\oono.toshiki\OneDrive - Business1\code\AIハッカソン\GEZA

## コード配置ルール
- **アプリケーションコード**: ワークスペースルート（aidlc-docs/ 以外）
- **ドキュメント**: aidlc-docs/ のみ

## Extension Configuration
| Extension | Enabled | Decided At |
|---|---|---|
| （拡張なし） | N/A | - |

## ステージ進捗

### 🔵 INCEPTION PHASE
- [x] Workspace Detection
- [x] Requirements Analysis（完了・承認済み）
- [x] User Stories（29ストーリー/180SP・承認済み・コンセプト変更反映済）
- [x] **Prototype / Feasibility Verification（実現性プロトタイプ完了）**
- [x] Workflow Planning（execution-plan.md 完成・承認済み）
- [x] Application Design（成果物5ファイル生成完了・承認待ち）
- [ ] Units Generation ← **現在位置**

### 🟢 CONSTRUCTION PHASE
- [ ] Functional Design（ユニット毎）
- [ ] NFR Requirements（ユニット毎）
- [ ] NFR Design（ユニット毎）
- [ ] Infrastructure Design（ユニット毎）
- [ ] Code Generation（ユニット毎）
- [ ] Build and Test

---

## プロトタイプ検証結果サマリー（2026-04-29〜30）

### 確定技術スタック（プロトタイプで実証済み）

| レイヤー | 採用技術 | 根拠 |
|---------|---------|------|
| フロントエンド | HTML/CSS/Vanilla JS + facesjs SVGアバター | SVGアバターがMP4動画より柔軟・低コスト |
| バックエンド | Lambda（Python 3.12, 512MB, 30s） | 実測OK |
| LLM | Amazon Nova Lite（軽量）/ Claude Sonnet（高品質） | Nova Liteで1〜3秒・十分な品質確認 |
| 音声合成 | Amazon Polly Kazuha（ja-JP, Neural） + SpeechMarks | Viseme口パク同期実証済み |
| アバター | facesjs v5.0.3（フォーク・data-feature属性追加） | CSS表情制御実証済み |

### 変更確定事項（要件更新が必要）

| 項目 | 当初要件 | プロトタイプ後の変更 | 理由 |
|------|---------|------------------|------|
| アバター | Nova Canvas/Reel MP4動画（10種類） | facesjs SVGアバター | レスポンス速度・コスト・感情制御の柔軟性 |
| LLMモデル | Claude Sonnet 3.5 / Haiku 3 | Nova Lite / Claude Sonnet | Nova Liteが軽量用途で十分 |
| 感情数 | 10種類 | 5種類で開始（拡張可能） | 十分なUXを実証 |
| 音声出力 | 未定 | Polly + SpeechMarks Viseme | 口パク同期実証済み |

