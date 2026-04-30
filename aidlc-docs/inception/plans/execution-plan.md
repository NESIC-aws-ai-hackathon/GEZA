# 実行計画（Execution Plan）

> AI-DLC Workflow Planning フェーズ成果物  
> 生成日: 2026-04-30

---

## 詳細分析サマリー

### プロジェクト種別・範囲
- **プロジェクト種別**: Greenfield（新規開発）
- **リバースエンジニアリング**: スキップ（既存コードなし、プロトタイプは検証用のみ）
- **ユーザーストーリー**: 既存（docs/user-stories.md）を参照済み

### 変更影響評価
- **ユーザー向け変更**: Yes — 全 Epic（1〜7）がユーザー体験に直接影響
- **構造的変更**: Yes — Lambda・API Gateway・S3・DynamoDB・Cognito を新規構築
- **データモデル変更**: Yes — DynamoDB テーブル設計（謝罪セッション・カルテ）が必要
- **API変更**: Yes — HTTP API 新規設計（謝罪評価・音声入力・セッション管理）
- **NFR影響**: Yes — レスポンス速度・XSS対策・認証・CORS設定

### リスク評価
- **リスクレベル**: **Medium**
- **ロールバック複雑度**: Moderate（CloudFormation スタック削除で回帰可能）
- **テスト複雑度**: Moderate（Lambda×複数 + フロントエンド統合テスト）

---

## ワークフロー可視化

```
flowchart TD
    Start(["ユーザーリクエスト"])

    subgraph INCEPTION["🔵 INCEPTION PHASE"]
        WD["Workspace Detection<br/>COMPLETED"]
        RA["Requirements Analysis<br/>COMPLETED"]
        US["User Stories<br/>COMPLETED (既存参照)"]
        WP["Workflow Planning<br/>IN PROGRESS"]
        AD["Application Design<br/>EXECUTE"]
        UG["Units Generation<br/>EXECUTE"]
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
- [x] **User Stories** — COMPLETED（24ストーリー/154SP・承認済み）
- [x] **Workflow Planning** — IN PROGRESS（本ドキュメント）
- [ ] **Application Design** — **EXECUTE**
  - 理由: 新規コンポーネント（Lambda×複数, フロントエンドSPA, DynamoDB）が必要。コンポーネント設計・依存関係の定義が必要
- [ ] **Units Generation** — **EXECUTE**
  - 理由: 7 Epic × 複数 Lambda / フロントエンドページ に分解が必要。実装順序・依存関係の整理が必要

### 🟢 CONSTRUCTION PHASE
- [ ] **Functional Design** — **EXECUTE**（ユニット毎）
  - 理由: DynamoDB テーブル設計・API インターフェース設計・謝罪評価ロジック設計が必要
- [ ] **NFR Requirements** — **EXECUTE**
  - 理由: レスポンス速度（10秒以内）・XSS対策・Cognito認証・CORS設定の要件定義が必要
- [ ] **NFR Design** — **EXECUTE**
  - 理由: NFR要件を実装に落とし込む設計が必要（Lambda timeout・CloudFront設定等）
- [ ] **Infrastructure Design** — **EXECUTE**
  - 理由: CloudFormation テンプレート設計（Lambda, API Gateway, S3, DynamoDB, Cognito, CloudFront）
- [ ] **Code Generation** — **EXECUTE**（ユニット毎・常時）
- [ ] **Build and Test** — **EXECUTE**（常時）

---

## ユニット（Epic別実装単位）候補

> 詳細は Application Design / Units Generation フェーズで確定する

| ユニットID | Epic | 主要実装対象 | 依存ユニット | SP |
|-----------|------|------------|------------|----|
| U01 | 共通インフラ | CloudFormation: Lambda+APIGW+S3+DynamoDB+Cognito+CloudFront | なし | - |
| U02 | Epic 4: 謝罪練習コア | Lambda(会話評価) + フロントエンド(アバター+入力UI+フォールバック) | U01 | 51 |
| U03 | Epic 1: トップ画面 | フロントエンド(トップ+モード選択+Cognito認証) | U02 | 16 |
| U04 | Epic 2: 実案件モード | Lambda(謝罪相手生成+謝罪プラン+アバターカスタマイズ) + フロントエンド | U02 | 28 |
| U05 | Epic 3: ストーリーモード | Lambda(ストーリー生成+謝罪ボス) + フロントエンド | U02 | 13 |
| U06 | Epic 5: 謝罪後支援 | Lambda(再発防止策+メール生成) + フロントエンド | U02 | 10 |
| U07 | Epic 6: 謝罪カルテ | DynamoDB(履歴保存) + Lambda(分析) + フロントエンド | U02 | 13 |
| U08 | Epic 7: 上司向け | Lambda(上司モード評価+部下役AI) + フロントエンド | U02 | 23 |

### 実装優先順序の根拠
1. **U01（インフラ）** が全ユニットの前提
2. **U02（謝罪練習コア）** がサービスの核心・最高価値・プロトタイプ実証済み
3. **U03（トップ）** は U02 があれば成立
4. **U04〜U08** は U02 を基盤に並列実装可能

### MVPスコープ（優先度高）
- U01 + U02 + U03 の3ユニットで最小動作可能プロダクト
- ハッカソンスコープ: U04〜U05まで（Epic 2〜3）
- フルスコープ: U06〜U08（Epic 5〜7）

---

## 成功基準

- **主要目標**: 全7 Epic の実装完了・動作確認
- **主要成果物**:
  - フロントエンド SPA（HTML/CSS/Vanilla JS）
  - Lambda 関数群（Python 3.12）
  - CloudFormation テンプレート
  - DynamoDB テーブル定義
  - Cognito User Pool 設定
- **品質ゲート**:
  - LLM API レスポンス 10秒以内
  - XSS対策（textContent使用）
  - Cognito 認証動作確認
  - CORS設定動作確認
  - スマホ幅375px表示確認
