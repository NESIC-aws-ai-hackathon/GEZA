# GEZA データモデル定義

> AI-DLC INCEPTION - ドメインモデル成果物  
> 生成日: 2026-05-02  
> ストレージ: Amazon DynamoDB シングルテーブル設計（geza-data）

---

## 概要

GEZAのデータモデルは、単発の謝罪セッション管理から、継続的な謝罪支援（カルテ蓄積・返信分析・傾向診断）までをカバーする。

DynamoDB シングルテーブル設計を採用し、以下のエンティティを管理する。

---

## エンティティ一覧

| エンティティ | 用途 | 関連Unit |
|------------|------|:-------:|
| User | ユーザープロフィール・認証情報 | U1 |
| ApologySession | 謝罪練習セッション（既存） | U3/U4 |
| ApologyCase | 謝罪案件（継続支援用） | U7/U8 |
| ApologyMessage | 謝罪文面・返信の個別記録 | U7 |
| ReplyAnalysis | 返信分析結果 | U7 |
| StoryModeLog | ストーリーモード行動ログ | U8 |
| ApologyProfile | ユーザー謝罪傾向診断結果 | U8 |

---

## ApologyCase（謝罪ケース）

謝罪案件を一括管理する親エンティティ。1つのやらかしに対する全対応履歴をまとめる。

| 属性 | 型 | 説明 |
|------|---|------|
| caseId | String (UUID) | PK: 謝罪ケース一意ID |
| userId | String | GSI-PK: Cognito ユーザーID |
| title | String | ケースタイトル（AI自動生成 or ユーザー入力） |
| incidentSummary | String | やらかし内容の要約 |
| targetPersonType | String | 謝罪相手タイプ（上司/顧客/同僚/友人/家族等） |
| relationship | String | 相手との関係性詳細 |
| severity | Number | 深刻度スコア（0〜180、謝罪角度） |
| currentStatus | String | 現在の状態（draft/in-progress/resolved/escalated） |
| createdAt | String (ISO8601) | 作成日時 |
| updatedAt | String (ISO8601) | 最終更新日時 |

**アクセスパターン**:
- `PK=CASE#<caseId>` — ケース詳細取得
- `GSI1: PK=USER#<userId>, SK=CASE#<createdAt>` — ユーザーのケース一覧（時系列）

---

## ApologyMessage（謝罪メッセージ）

謝罪ケース内の個別メッセージ（下書き・送信済み・相手の返信・修正版）を記録する。

| 属性 | 型 | 説明 |
|------|---|------|
| messageId | String (UUID) | PK: メッセージ一意ID |
| caseId | String | 紐づく謝罪ケースID |
| userId | String | Cognito ユーザーID |
| messageType | String | draft / sent / receivedReply / revised |
| content | String | メッセージ本文 |
| riskScore | Number | 炎上リスクスコア（0〜100） |
| apologyAngle | Number | 推奨謝罪角度（0〜180） |
| angerScore | Number | 怒り残量（0〜100）※ receivedReply時 |
| forgivenessScore | Number | 許され度（0〜100）※ receivedReply時 |
| detectedRiskWords | List[String] | 検出されたリスクワード一覧 |
| createdAt | String (ISO8601) | 作成日時 |

**アクセスパターン**:
- `PK=CASE#<caseId>, SK=MSG#<createdAt>` — ケース内メッセージ一覧（時系列）

---

## ReplyAnalysis（返信分析結果）

相手からの返信に対するAI分析結果を記録する。

| 属性 | 型 | 説明 |
|------|---|------|
| analysisId | String (UUID) | PK: 分析結果一意ID |
| caseId | String | 紐づく謝罪ケースID |
| replyMessageId | String | 分析対象の返信メッセージID |
| angerRemaining | Number | 怒り残量（0〜100%） |
| forgivenessScore | Number | 許され度（0〜100%） |
| reignitionRisk | String | 再炎上リスク（high/medium/low） |
| hiddenConcerns | List[String] | 相手が本当に不満に感じている点 |
| nextAction | String | 次の一手（推奨アクション） |
| forbiddenExpressions | List[String] | 次に言ってはいけない表現 |
| recommendedAngle | Number | 追加推奨謝罪角度（0〜180） |
| createdAt | String (ISO8601) | 分析日時 |

**アクセスパターン**:
- `PK=CASE#<caseId>, SK=ANALYSIS#<createdAt>` — ケース内分析結果一覧

---

## StoryModeLog（ストーリーモード行動ログ）

ストーリーモードでのユーザー行動を疑似謝罪データとして記録する。

| 属性 | 型 | 説明 |
|------|---|------|
| storyLogId | String (UUID) | PK: ログ一意ID |
| userId | String | Cognito ユーザーID |
| scenarioId | String | プレイしたシナリオID |
| turnNumber | Number | ターン番号 |
| selectedChoice | String | 選択肢を選んだ場合のラベル |
| freeTextAnswer | String | 自由入力した場合のテキスト |
| aiOpponentReaction | String | AI相手の反応テキスト |
| emotionLabel | String | AI相手の感情ラベル（30種類のいずれか） |
| angerScoreDelta | Number | 怒り度の変化量（+/-） |
| forgivenessScoreDelta | Number | 許され度の変化量（+/-） |
| result | String | ターン結果（continue/clear/fail/escalate） |
| createdAt | String (ISO8601) | プレイ日時 |

**アクセスパターン**:
- `PK=USER#<userId>, SK=STORY#<createdAt>` — ユーザーのストーリーログ一覧
- `GSI2: PK=USER#<userId>#SCENARIO#<scenarioId>, SK=TURN#<turnNumber>` — シナリオ別ターン詳細

---

## ApologyProfile（謝罪傾向プロフィール）

ユーザーの謝罪傾向診断結果を記録する。蓄積データから定期的に再計算される。

| 属性 | 型 | 説明 |
|------|---|------|
| userId | String | PK: Cognito ユーザーID |
| excuseFirstScore | Number | 言い訳先行度（0〜100） |
| responsibilityAvoidanceScore | Number | 責任回避度（0〜100） |
| empathyScore | Number | 共感力（0〜100、高いほど良い） |
| preventionSpecificityScore | Number | 再発防止策の具体度（0〜100、高いほど良い） |
| overApologyScore | Number | 過剰土下座度（0〜100） |
| silenceEscapeScore | Number | 沈黙逃亡度（0〜100） |
| defensiveReactionScore | Number | 逆ギレ傾向（0〜100） |
| selfSabotageScore | Number | 許されかけ自爆度（0〜100） |
| apologyType | String | 診断タイプ名（言い訳先行型/責任回避型/共感不足型/再発防止ふわふわ型/過剰土下座型/沈黙逃亡型/逆ギレ予備軍型/許されかけ自爆型） |
| dataSourceCount | Map | 分析に使用したデータ件数 {realCases: N, storyLogs: N} |
| personalAdvice | String | 次回謝罪時の個別アドバイス |
| updatedAt | String (ISO8601) | 最終診断日時 |

**アクセスパターン**:
- `PK=USER#<userId>, SK=PROFILE` — ユーザーの最新診断結果

---

## DynamoDB テーブル設計（シングルテーブル）

### キー設計

| PK パターン | SK パターン | エンティティ |
|------------|-----------|------------|
| `USER#<userId>` | `PROFILE` | ApologyProfile |
| `USER#<userId>` | `CASE#<createdAt>` | ApologyCase（GSI1） |
| `USER#<userId>` | `STORY#<createdAt>` | StoryModeLog |
| `CASE#<caseId>` | `META` | ApologyCase（詳細） |
| `CASE#<caseId>` | `MSG#<createdAt>` | ApologyMessage |
| `CASE#<caseId>` | `ANALYSIS#<createdAt>` | ReplyAnalysis |

### GSI

| GSI名 | PK | SK | 用途 |
|-------|----|----|------|
| GSI1-UserCases | `USER#<userId>` | `CASE#<createdAt>` | ユーザーのケース一覧 |
| GSI2-UserStoryScenario | `USER#<userId>#SCENARIO#<scenarioId>` | `TURN#<turnNumber>` | シナリオ別詳細 |

---

## 既存エンティティとの関係

U4 で定義済みの `ApologySession`（謝罪練習セッション）は、リハーサルモード1回分のデータ。  
新規追加の `ApologyCase` は、1つのやらかしに対する**継続的な対応全体**を管理する上位概念。

```
ApologyCase（1つのやらかし全体）
  ├── ApologyMessage（下書き）
  ├── ApologyMessage（送信済み）
  ├── ApologyMessage（相手の返信）
  │     └── ReplyAnalysis（返信分析結果）
  ├── ApologyMessage（修正版）
  ├── ApologySession（リハーサル実施記録）← 既存U4のデータ
  └── ...（対応が解決するまで繰り返し）

ApologyProfile（ユーザーの謝罪傾向）
  ├── ApologyCase × N件（実際の謝罪履歴）
  └── StoryModeLog × N件（疑似謝罪データ）
       → 統合分析 → 傾向診断
```
