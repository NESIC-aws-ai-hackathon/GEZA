# 実行計画（Execution Plan）

> AI-DLC Workflow Planning フェーズ成果物  
> 生成日: 2026-04-30

---

## 詳細分析サマリー

### プロジェクト種別・範囲
- **プロジェクト種別**: Greenfield（新規開発）
- **リバースエンジニアリング**: スキップ（既存コードなし、プロトタイプは検証用のみ）
- **ユーザーストーリー**: `aidlc-docs/inception/user-stories/stories.md`（正式版・INVEST済41ストーリー/271SP）

### 変更影響評価
- **ユーザー向け変更**: Yes — 全 Epic（1〜10）がユーザー体験に直接影響
- **構造的変更**: Yes — Lambda・API Gateway・S3・DynamoDB・Cognito を新規構築
- **データモデル変更**: Yes — DynamoDB テーブル設計（謝罪セッション・カルテ）が必要
- **API変更**: Yes — HTTP API 新規設計（謝罪評価・音声入力・セッション管理）
- **NFR影響**: Yes — レスポンス速度・XSS対策・認証・CORS設定

### リスク評価
- **リスクレベル**: **Medium**
- **ロールバック複雑度**: Moderate（SAM スタック削除で回帰可能）
- **テスト複雑度**: Moderate（Lambda×複数 + フロントエンド統合テスト）

---

## ワークフロー可視化

```
flowchart TD
    Start(["ユーザーリクエスト"])

    subgraph INCEPTION["🔵 INCEPTION PHASE"]
        WD["Workspace Detection<br/>COMPLETED"]
        RA["Requirements Analysis<br/>COMPLETED"]
        US["User Stories<br/>COMPLETED (41ストーリー/271SP)"]
        WP["Workflow Planning<br/>COMPLETED"]
        AD["Application Design<br/>COMPLETED"]
        UG["Units Generation<br/>COMPLETED"]
    end

    subgraph CONSTRUCTION["🟢 CONSTRUCTION PHASE"]
        FD["Functional Design<br/>EXECUTE (ユニット毎)"]
        NFRA["NFR Requirements<br/>EXECUTE"]
        NFRD["NFR Design<br/>EXECUTE"]
        ID["Infrastructure Design<br/>EXECUTE"]
        CG["Code Generation<br/>EXECUTE (ユニット毎)"]
        BT["Build and Test<br/>EXECUTE"]
    end

    Start --> WD
    WD --> RA
    RA --> US
    US --> WP
    WP --> AD
    AD --> UG
    UG --> FD
    FD --> NFRA
    NFRA --> NFRD
    NFRD --> ID
    ID --> CG
    CG --> BT
    BT --> End(["完了"])
```

---

## フェーズ実行計画

### 🔵 INCEPTION PHASE
- [x] **Workspace Detection** — COMPLETED（Greenfield確認）
- [x] **Reverse Engineering** — SKIPPED（Greenfield）
- [x] **Requirements Analysis** — COMPLETED（承認済み）
- [x] **User Stories** — COMPLETED（41ストーリー/271SP・承認済み）
- [x] **Workflow Planning** — COMPLETED（本ドキュメント）
- [x] **Application Design** — COMPLETED（承認済み）
  - 成果物: application-design.md / components.md / component-methods.md / services.md / component-dependency.md
- [x] **Units Generation** — COMPLETED（承認済み）
  - 成果物: unit-of-work.md / unit-of-work-dependency.md / unit-of-work-story-map.md

### 🟢 CONSTRUCTION PHASE
- [ ] **Functional Design** — **EXECUTE**（ユニット毎）
  - 理由: DynamoDB テーブル設計・API インターフェース設計・謝罪評価ロジック設計が必要
- [ ] **NFR Requirements** — **EXECUTE**
  - 理由: レスポンス速度（10秒以内）・XSS対策・Cognito認証・CORS設定の要件定義が必要
- [ ] **NFR Design** — **EXECUTE**
  - 理由: NFR要件を実装に落とし込む設計が必要（Lambda timeout・CloudFront設定等）
- [ ] **Infrastructure Design** — **EXECUTE**
  - 理由: CloudFormation→SAM テンプレート設計（Lambda, API Gateway, S3, DynamoDB, Cognito, CloudFront）
- [ ] **Code Generation** — **EXECUTE**（ユニット毎・常時）
- [ ] **Build and Test** — **EXECUTE**（常時）

---

## ユニット（Epic別実装単位）— 確定版（Units Generation 完了）

| ユニットID | ユニット名 | Epic | 主要実装対象 | 依存 | SP | 優先度 |
|-----------|----------|------|------------|------|----|:------:|
| **U0** | 共通インフラ + FEコアモジュール | - | SAM（21 Lambda スタブ + Cognito + APIGW + DynamoDB + S3 + CloudFront） + FE共通モジュール | なし | (基盤) | 最高 |
| **U1** | トップ画面 + Cognito認証 | E1 | フロントエンド（トップ+モード選択+認証フロー） | U0 | 16 | P0 |
| **U2** | コンシェルジュコア | E2 | Lambda（assess-apology/probe-incident/generate-opponent/generate-plan） + フロントエンド（アセスメント+プランナー+カウントダウン） | U0, U1 | 57 | P0 |
| **U3** | 謝罪練習シミュレーション | E4 | Lambda（evaluate-apology/text-to-speech） + フロントエンド（アバター+入力 UI+ApologyMeter） | U0, U1, U2 | 51 | P0 |
| **U4** | 謝罪後支援 + カルテ | E5 + E6 | Lambda（generate-feedback/generate-prevention/generate-follow-mail/save-session/get-karte/analyze-karte） + フロントエンド | U0 | 28 | P0 |
| **U5** | ストーリーモード | E3 | Lambda（generate-story） + フロントエンド（ストーリー選択+謝罪ボス） | U3 | 13 | P1 |
| **U6** | 上司モード | E7 | Lambda（evaluate-guidance/generate-guidance-feedback） + フロントエンド（上司練習 UI） | U0, U1, U3 | 23 | P1 |
| **U7** | 送る前GEZAチェック・返信分析 | E8 | Lambda（check-draft/analyze-reply） + フロントエンド（check.html/reply.html） | U0, U1, U4 | 21 | P2 |
| **U8** | 謝罪カルテ拡張・謝罪傾向診断 | E9 | Lambda（save-story-log/diagnose-tendency） + フロントエンド（diagnosis.html） | U0, U1, U4, U5 | 20 | P2 |
| **U9** | 謝罪中支援（怒り残量スキャナー・耳打ちモード） | E10 | Lambda（analyze-anger/detect-danger-speech） + フロントエンド（during-support.html） | U0, U1, U2, U3 | 42 | P3 |

### 実装優先順序の根拠
1. **U0（インフラ）** が全ユニットの前提
2. **U3（謝罪練習コア）** がサービスの核心・最高価値・プロトタイプ実証済み
3. **U1（トップ）・U2（コンシェルジュ）** は U0 があれば並行実装可能
4. **U5・U6** は U3 完了後・時間が余れば実装
5. **U7・U8** は P2（継続支援・将来構想）
6. **U9** は P3（決勝拡張）

### MVPスコープ（優先度高）
- U0 + U1 + U2 + U3 + U4 で MVP（P0 完全体）
- ハッカソン最低限: U0 + U1 + U2 + U3（U1は認証必須依存、U2はアセスメント必須依存）
- P1完全体: +U5 + U6（ストーリー・上司モード）
- P2（継続支援）: +U7 + U8（送る前チェック・返信分析・傾向診断）
- P3（決勝拡張）: +U9（謝罪中支援）

---

## 成功基準

- **主要目標**: 全 10 Epic の実装完了・動作確認
- **主要成果物**:
  - フロントエンド（HTML/CSS/Vanilla JS マルチページ構成）
  - Lambda 関数群（Python 3.12, 21本）
  - SAM テンプレート（template.yaml）
  - DynamoDB テーブル定義
  - Cognito User Pool 設定
- **品質ゲート**:
  - LLM API レスポンス 10秒以内
  - XSS対策（textContent使用）
  - Cognito 認証動作確認
  - CORS設定動作確認
  - スマホ幅375px表示確認
