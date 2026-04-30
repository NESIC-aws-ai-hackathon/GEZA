# AI-DLC 監査ログ

## エントリ 001 - ワークスペース検出開始
- **日時**: 2026-04-29T00:00:00+09:00
- **フェーズ**: INCEPTION - Workspace Detection
- **ユーザーリクエスト（原文）**: "AI-DLCに従い開発を進めてほしい。要件はuser-stories.mdに記載している"
- **アクション**: 新規AI-DLCワークフロー開始

## エントリ 002 - ワークスペース検出完了
- **日時**: 2026-04-29T00:00:01+09:00
- **フェーズ**: INCEPTION - Workspace Detection
- **判定**: Greenfield プロジェクト
- **既存コード**: なし
- **要件ファイル確認**: docs/user-stories.md（7 Epic、16以上のユーザーストーリー）
- **次フェーズ**: Requirements Analysis

## エントリ 003 - Requirements Analysis 開始
- **日時**: 2026-04-29T00:00:02+09:00
- **フェーズ**: INCEPTION - Requirements Analysis
- **アクション**: 要件確認質問ファイル作成、ユーザー回答待ち

## エントリ 004 - ユーザー回答受領
- **日時**: 2026-04-29T00:01:00+09:00
- **フェーズ**: INCEPTION - Requirements Analysis
- **ユーザー回答サマリー**:
  - Q1: E（全Epic実装）
  - Q2: A（Webアプリ、PCもスマホ幅表示）
  - Q3: C（HTML/CSS/Vanilla JS）
  - Q4: D（AWS Lambda + API Gateway）
  - Q5: C（AWS Bedrock、用途別モデル選定）
  - Q6: B（AWS Transcribe）
  - Q7: D（CSS + S3動画、AI切り替え + 音声再生）
  - Q8: B（AWS Cognito）
  - Q9: A（AWS: Lambda + S3 + CloudFront + API Gateway）
  - Q10: A（DynamoDB）
  - Q11: A（AI画像生成）
  - Q12: A+B+C+E（LLM速度コスト・音声精度・動画生成・会話品質調査）
- **アクション**: 要件文書・実現性調査書・統合ドキュメント作成完了

## エントリ 005 - Requirements Analysis 完了・承認済み
- **日時**: 2026-04-29T00:01:01+09:00
- **フェーズ**: INCEPTION - Requirements Analysis
- **生成物**:
  - aidlc-docs/inception/requirements/requirements.md
  - aidlc-docs/inception/feasibility/feasibility-study.md
  - docs/requirements.md（統合版）

## エントリ 006 - 実現性プロトタイプ開始
- **日時**: 2026-04-29T10:00:00+09:00
- **フェーズ**: INCEPTION - Feasibility Verification（フェーズ外補完作業）
- **目的**: 実現性調査「アバターとの会話コア機能（最重要）」の技術検証
- **検証対象**:
  - AWS Bedrock（Nova Lite）での感情分類・NGワード検知・日本語返答生成
  - Amazon Polly（Kazuha）+ SpeechMarks APIでのViseme口パク同期
  - SVGアバターによるリアルタイム表情制御
  - Lambda + API Gateway + S3 による AWS フルデプロイ

## エントリ 007 - プロトタイプ実施経緯
- **日時**: 2026-04-29〜30
- **フェーズ**: INCEPTION - Feasibility Verification

### 実施の流れ

#### Step 1: 基本Lambda + Bedrock構成（2026-04-29）
- CloudFormationテンプレート（`prototype/cfn-template.yaml`）でインフラ一括デプロイ
- Lambda（Python 3.12）でBedrock Nova Liteを呼び出し、感情・返答・怒り度・NGワードをJSON返却
- フロントエンドはMP4動画切り替え方式（anger.mp4 / acceptance.mp4 / disappointment.mp4）
- 課題: Nova Reelでの動画生成は品質・コスト・速度の面でリアルタイム会話に不適と判断

#### Step 2: Polly音声合成 + SpeechMarks統合（2026-04-29）
- LambdaにThreadPoolExecutorを追加し、Bedrock + Pollyを並列実行
- Pollyのaudito（MP3）とviseme（SpeechMarks）を同一レスポンスで返却
- Visemeタイムコードによる口パク同期をフロントエンドで実装
- 実測: Bedrock 1〜3秒 + Polly 並列0.3〜0.8秒追加

#### Step 3: facesjs SVGアバターへの移行（2026-04-29）
- MP4動画の課題（ループカクつき・感情数上限・ファイルサイズ）を解決するためSVGアバターに変更
- facesjs v5.0.3（オープンソース、Apache 2.0）をフォーク
  - `src/display.ts` に `data-feature` 属性注入を追加（2行）
  - Vite + Babel でIIFEバンドル（338KB）を生成
- フロントエンドをfacesjs対応に全面書き換え

#### Step 4: facesjs描画問題の修正（2026-04-29〜30）
- **問題1**: 目が描画されない
  - 原因: `eye.id="normal"` 等の存在しないIDを指定 → facejsが描画スキップ
  - 解決: `generate()` が返す有効IDをそのまま使い、表情はCSS transformで制御
- **問題2**: CSS transform が SVG transform 属性を上書き → 目が変な位置に
  - 解決: 目・眉に外側 `<g>` wrapper を追加し、wrapperにCSS transformを適用
- **問題3**: 髪が顔の揺れに追従しない
  - 原因: `#facejs-head`（頭のみ）にアニメーション → 髪・目が別グループのため追従しない
  - 解決: 全パーツを `<g id="face-group">` にラップし、一体でアニメーション
- **問題4**: SVGが左寄せ
  - 原因: facejsデフォルトの `preserveAspectRatio="xMinYMin meet"`
  - 解決: `xMidYMin slice` に変更

#### Step 5: 表情5段階・モーション機能完成（2026-04-30）
- 感情を3種類→5種類に拡張（怒り・苛立ち・失望・驚き・納得）
- モーション確認ボタンUI追加（デモ用）
- 顔の表示位置を上寄せに調整

### 最終実装構成
```
prototype/
├── backend/lambda_function.py  # Bedrock + Polly 並列実行
├── frontend/
│   ├── app.js                  # facesjs v3統合（wrapper制御）
│   ├── facesjs.min.js          # フォーク版IIFEバンドル
│   └── style.css               # 5感情 + アニメーション
└── cfn-template.yaml           # Lambda/APIGW/S3 CFn
```

## エントリ 008 - プロトタイプ完了・AWS削除
- **日時**: 2026-04-30
- **フェーズ**: INCEPTION - Feasibility Verification → Workflow Planning
- **AWS削除完了**:
  - S3バケット: geza-prototype-websitebucket-lztfz0gwczkt（削除済み）
  - S3バケット: geza-deploy-XXXXXXXXXXXX（削除済み）
  - CloudFormationスタック: geza-prototype（削除済み）
- **検証結論**: 全検証項目クリア。本番実装に向けWorkflow Planningへ移行

## エントリ 009 - User Stories 正式実行・生成完了
- **日時**: 2026-04-30
- **フェーズ**: INCEPTION - User Stories
- **アクション**: AI-DLC正式User Storiesフロー実行
- **生成物**:
  - aidlc-docs/inception/user-stories/stories.md（24ストーリー/154SP）
  - aidlc-docs/inception/user-stories/personas.md（3ペルソナ定義）
- **主要仕様**:
  - 30感情定義テーブル（rage/anger/fury...forgiveness）
  - User Journey 7フロー（Journey 1〜7）
  - SLA表（APIレスポンス目標値を1箇所に集約）
  - ペルソナKPI表（Kenta/Misaki/Seiichi 各成功指標）
  - US-204（アバターカスタマイズ）、US-408（APIフォールバック）追加
  - SP再見積もり: US-202/US-401/US-702 各8→13
- **SP合計**: 154 Story Points（Epic別: E1=16, E2=28, E3=13, E4=51, E5=10, E6=13, E7=23）

## エントリ 010 - User Stories 承認
- **日時**: 2026-04-30
- **フェーズ**: INCEPTION - User Stories → Workflow Planning
- **承認者**: プロダクトオーナー（ユーザー）
- **承認内容**: 24ストーリー/154SP のUser Stories一式を承認
- **主な変更点（承認セッション中）**:
  - US-204追加: 謝罪相手アバターカスタマイズ（P1/5SP）
  - US-404 AC-2補強: Viseme仕様（data-feature/7種/50ms/sil戻り）を明記
  - US-408追加: API障害時フォールバック（P0/5SP）
  - ペルソナKPI表追加（デモ説得力向上）
  - SLA表追加（レスポンス目標一元管理）
  - SP再見積もり（US-202/401/702: 8→13）
- **次フェーズ**: Workflow Planning（execution-plan.md更新 → Application Design）

## エントリ 010 - User Stories 正式実行開始
- **日時**: 2026-04-30T（本日）
- **フェーズ**: INCEPTION - User Stories（PART 1: Planning）
- **ユーザーリクエスト（原文）**: 「一度手戻りして、userstorysについて、docsにあるものはあくまで事前に検討したものです。inceptionフェーズに従いしっかりと作りなおして」
- **アクション**: user-stories-assessment.md 作成、story-generation-plan.md 作成（質問10問埋め込み）
- **次アクション**: ユーザー回答待ち → PART 2 Generation

## エントリ 009 - ドキュメント更新
- **日時**: 2026-04-30
- **フェーズ**: INCEPTION - Workflow Planning
- **更新ファイル**:
  - prototype/README.md（プロトタイプ結果・再デプロイ手順・削除手順追記）
  - aidlc-docs/aidlc-state.md（ステージ進捗・技術確定事項更新）
  - aidlc-docs/inception/feasibility/feasibility-study.md（全調査項目結果更新）
  - docs/requirements.md（技術スタック・アバター仕様更新）
- **次アクション**: Workflow Planning 開始

