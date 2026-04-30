# サービス定義

> 最終更新: 2026-04-30（コンセプト変更により assess-apology エンドポイント追加）

---

## API Gateway エンドポイント一覧

**ベースURL**: `https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/`  
**認証**: 全エンドポイント に Cognito JWT Authorizer（API Gateway HTTP API）を適用  
**設計方針**: リソースベース REST（Q9: A）

| メソッド | パス | Lambda | 説明 |
|---------|-----|--------|------|
| **POST** | **`/apology/assess`** | **assess-apology** | **謝罪角度算出（0〜180°）+ 根拠説明 + 推奨アプローチ** |
| POST | `/apology/evaluate` | evaluate-apology | 謝罪評価・感情分類・NGワード・追撃質問生成 |
| POST | `/opponent/generate` | generate-opponent | 謝罪相手プロフィール + アバターseed生成 |
| POST | `/story/generate` | generate-story | ストーリー + ボスプロフィール生成 |
| POST | `/plan/generate` | generate-plan | 謝罪プラン + ToDo生成 |
| POST | `/tts/synthesize` | text-to-speech | Polly MP3(Base64) + visemes取得 |
| POST | `/feedback/generate` | generate-feedback | 謝罪フィードバック + 改善謝罪文生成 |
| POST | `/prevention/generate` | generate-prevention | 再発防止策生成 |
| POST | `/mail/generate` | generate-follow-mail | フォローメール案生成 |
| POST | `/sessions` | save-session | セッション・会話ターンをDynamoDBに保存 |
| GET | `/karte` | get-karte | カルテ一覧取得（全件） |
| GET | `/karte/{sessionId}` | get-karte | セッション詳細＋会話ターン取得 |
| GET | `/karte/analyze` | analyze-karte | 傾向分析（NGワード傾向・スコア推移） |
| POST | `/guidance/evaluate` | evaluate-guidance | 指導評価・建設性スコア・部下リアクション生成 |
| POST | `/guidance/feedback` | generate-guidance-feedback | 指導フィードバック + 改善スクリプト生成 |

---

## リクエスト/レスポンス スキーマ（主要エンドポイント）

### POST `/apology/assess`

**Request:**
```json
{
  "incident_summary": "本番環境にバグをリリースしてしまい...",
  "categories": "顧客謝罪",
  "relationship": "取引先PM",
  "deadline": "明日14:00",
  "affected_count": 3,
  "past_incidents": false
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": {
    "ai_degree": 72,
    "stage_name": "土下座",
    "stage_description": "床との交渉開始",
    "reasons": [
      { "factor": "本番環境の障害", "weight": 30 },
      { "factor": "期限超過の連絡遅延", "weight": 25 },
      { "factor": "複数名に影響", "weight": 17 }
    ],
    "recommended_approach": "直接謝罪（対面またはWeb会議）"
  }
}
```

---

### POST `/apology/evaluate`

**Request:**
```json
{
  "apology_text": "この度はご迷惑をおかけして...",
  "opponent_profile": {
    "type": "厳格な上司",
    "anger_level": 70,
    "trust_level": 30,
    "ng_words": ["忙しくて", "次から"],
    "avatar_seed": 1234567
  },
  "conversation_history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "session_id": "uuid-v4"
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": {
    "emotion_label": "anger",
    "response_text": "それで済む話だと思っているのか？",
    "anger_level": 75,
    "trust_level": 25,
    "anger_delta": 5,
    "trust_delta": -5,
    "ng_words": [{ "word": "次から", "reason": "再発防止策が不明確", "alternative": "具体的な対策として..." }],
    "follow_up_question": "再発防止策は具体的に何を考えているんだ？"
  }
}
```

---

### POST `/opponent/generate`

**Request:**
```json
{
  "incident_summary": "納品物に重大なバグが含まれており...",
  "categories": "顧客謝罪",
  "relationship": "取引先PM",
  "deadline": "明日14:00"
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": {
    "opponent_profile": {
      "type": "冷静だが厳格なPM",
      "personality": "論理的で感情表現は少ないが、約束破りには厳しい",
      "anger_level": 65,
      "trust_level": 40,
      "tolerance": 30,
      "anger_points": ["事前連絡がなかった", "品質管理プロセスの不備", "影響範囲の説明がない"],
      "ng_words": ["忙しくて", "確認不足で", "大きな影響はない"],
      "first_message": "連絡が遅すぎる。こちらはどれだけ迷惑を受けたと思っているんですか。"
    },
    "avatar_seed": 3847291
  }
}
```

---

### POST `/tts/synthesize`

**Request:**
```json
{
  "text": "連絡が遅すぎる。こちらはどれだけ迷惑を受けたと思っているんですか。"
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": {
    "audio_base64": "SUQzBAAAAAAAI...",
    "visemes": [
      { "time": 0, "value": "sil" },
      { "time": 50, "value": "r" },
      { "time": 120, "value": "e" },
      { "time": 200, "value": "sil" }
    ]
  }
}
```

---

### POST `/guidance/evaluate`

**Request:**
```json
{
  "guidance_text": "なぜできないんだ！何度言えばわかるんだ！",
  "subordinate_profile": {
    "name": "田中",
    "personality": "真面目だが自信がない新入社員",
    "current_emotion": "confusion",
    "mistake_count": 3
  },
  "conversation_history": [],
  "session_id": "uuid-v4"
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": {
    "constructiveness_score": 15,
    "harassment_risk": "高",
    "subordinate_emotion": "intimidation",
    "subordinate_reaction": "黙り込んでうつむく",
    "response_text": "...はい...すみません...",
    "ng_phrases": [
      { "phrase": "なぜできないんだ", "issue": "人格否定につながる問いかけ", "alternative": "どこで詰まっているか教えてもらえる？" },
      { "phrase": "何度言えばわかるんだ", "issue": "威圧・決めつけ表現", "alternative": "一緒に確認ポイントを整理しよう" }
    ]
  }
}
```

---

## DynamoDB シングルテーブル設計

**テーブル名**: `geza-data`  
**設計方針**: シングルテーブル設計（Q7: A）

### アクセスパターン

| パターン | PK | SK | 説明 |
|--------|----|----|------|
| ユーザーの全セッション一覧 | `USER#<userId>` | `SESSION#` で始まるSKを前方一致 | カルテ一覧取得 |
| セッション詳細取得 | `USER#<userId>` | `SESSION#<timestamp>#<sessionId>` | セッションサマリー |
| セッションの全ターン | `SESSION#<sessionId>` | `TURN#<turnNumber>` | 会話履歴取得 |
| ユーザープロファイル | `USER#<userId>` | `PROFILE#` | ユーザー設定・傾向メモ |
| 上司モードセッション | `USER#<userId>` | `GUIDANCE#<timestamp>#<sessionId>` | 指導練習履歴 |

### 主要属性

```
geza-data
├── PK (String) - パーティションキー
├── SK (String) - ソートキー  
├── sessionId (String) - セッション識別子
├── sessionType (String) - "APOLOGY" | "GUIDANCE"
├── userId (String) - Cognito sub
├── timestamp (String) - ISO8601
├── angerLevel (Number) - 最終怒り度 (0-100)
├── trustLevel (Number) - 最終信頼度 (0-100)
├── finalScore (Number) - 総合スコア
├── ngWordsUsed (List) - 使用NGワード一覧
├── avatarSeed (Number) - facesjs seed値
├── bossProfile (Map) - 謝罪相手プロフィールJSON
├── conversationText (String) - 会話テキスト（ターン用）
├── role (String) - "user" | "assistant"（ターン用）
├── constructivenessScore (Number) - 建設性スコア（指導用）
├── harassmentRisk (String) - "低" | "中" | "高"（指導用）
└── ttl (Number) - TTL（将来の自動削除用・現在は未使用）
```

**GSI**: `sessionId-index`
- PK: `sessionId`
- 用途: sessionIdからターン一覧を高速取得

---

## AWS サービス連携

### Transcribe Streaming（フロントエンド直接接続）

```
ブラウザ
  ↓ Cognito Identity Pool で一時認証情報取得
  ↓ AWS SDK v3 (@aws-sdk/client-transcribe-streaming) でWebSocket確立
  ↓ PCM音声データをストリーム送信
  ↓ リアルタイム文字起こし結果を受信
  → evaluate-apology API を呼び出し
```

- 必要権限: `transcribe:StartStreamTranscription` (Identity Pool で付与)
- 言語: `ja-JP`
- フォールバック: 接続失敗時 → テキスト入力にフォーカス移動（US-408 AC-3）

---

### Cognito 構成

```
User Pool
├── ユーザーサインアップ/ログイン
├── JWT トークン発行
└── API Gateway JWT Authorizer のソース

Identity Pool
├── User Pool と統合
├── 認証済みユーザーに一時IAM認証情報を付与
└── 付与権限: transcribe:StartStreamTranscription のみ
```

---

### SAM テンプレート構成 (`template.yaml`)

```yaml
# 主要リソース（SAM形式 - Q13: C）
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  # Lambda 関数（14関数）- SAM::Function
  AssessApologyFunction: ...
  EvaluateApologyFunction: ...
  GenerateOpponentFunction: ...
  GenerateStoryFunction: ...
  GeneratePlanFunction: ...
  TextToSpeechFunction: ...
  GenerateFeedbackFunction: ...
  GeneratePreventionFunction: ...
  GenerateFollowMailFunction: ...
  SaveSessionFunction: ...
  GetKarteFunction: ...
  AnalyzeKarteFunction: ...
  EvaluateGuidanceFunction: ...
  GenerateGuidanceFeedbackFunction: ...

  # API Gateway HTTP API v2
  GezaApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      Auth:
        Authorizers:
          CognitoAuthorizer:
            JwtConfiguration:
              issuer: !Sub "https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}"
              audience: [!Ref UserPoolClient]
            IdentitySource: "$request.header.Authorization"

  # DynamoDB
  GezaTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: geza-data
      BillingMode: PAY_PER_REQUEST

  # Cognito User Pool
  UserPool: ...
  UserPoolClient: ...
  IdentityPool: ...

  # S3 + CloudFront
  FrontendBucket: ...
  CloudFrontDistribution: ...
```

### Lambda 共通設定

```yaml
Globals:
  Function:
    Runtime: python3.12
    MemorySize: 512
    Timeout: 30
    Environment:
      Variables:
        TABLE_NAME: !Ref GezaTable
        NOVA_LITE_MODEL_ID: "amazon.nova-lite-v1:0"
        CLAUDE_SONNET_MODEL_ID: "anthropic.claude-sonnet-4-5"
    Layers:
      - !Ref SharedUtilsLayer  # decorators.py / prompt_loader.py / bedrock_client.py / input_validator.py
```

---

## 月額コスト概算（MVP想定）

> 前提: ユーザー100名、月間500セッション、1セッション平均10ターン  
> リージョン: Bedrock = us-east-1、その他 = ap-northeast-1（東京）  
> 料金は 2025年4月時点の AWS 公示価格に基づく

### Bedrock（LLM推論）

| モデル | 用途 | 月間呼び出し数 | 平均トークン（入力/出力） | 単価（入力 / 出力 per 1M tokens） | 月額概算 |
|-------|------|:-----------:|:---:|:---:|:---:|
| Amazon Nova Lite | evaluate-apology, assess-apology, analyze-karte, evaluate-guidance | 5,500回 | 1,500 / 500 | $0.06 / $0.24 | **$0.56** |
| Claude 3.5 Sonnet | generate-opponent, story, plan, feedback, prevention, mail, guidance-feedback | 1,500回 | 2,000 / 1,500 | $3.00 / $15.00 | **$42.75** |
| | | | | **Bedrock 合計** | **≈ $43.31** |

### Amazon Polly（TTS）

| 音声エンジン | 月間文字数 | 単価 | 月額概算 |
|------------|:---------:|:---:|:---:|
| Neural (Kazuha) — 音声 + SpeechMarks | 5,000ターン × 200文字 × 2（音声+Marks） = 200万文字 | $16.00 / 100万文字 | **$32.00** |

### DynamoDB On-Demand（東京）

| 操作 | 月間リクエスト数 | 単価 | 月額概算 |
|-----|:-----------:|:---:|:---:|
| 書き込み | 15,000 WRU | $0.000742 / WRU | **$11.13** |
| 読み込み | 25,000 RRU | $0.000149 / RRU | **$3.73** |
| ストレージ | ≈ 1 GB | $0.285 / GB | **$0.29** |
| | | **DynamoDB 合計** | **≈ $15.15** |

### Lambda（東京）

| 項目 | 月間 | 単価 | 月額概算 |
|-----|:----:|:---:|:---:|
| リクエスト数 | 7,000回 | $0.20 / 100万回 | **$0.00** |
| 実行時間 | 7,000回 × 3秒 × 512MB = 10,752 GB-秒 | $0.0000166667 / GB-秒 | **$0.18** |

### API Gateway HTTP API（東京）

| 項目 | 月間 | 単価 | 月額概算 |
|-----|:----:|:---:|:---:|
| リクエスト数 | 7,000回 | $1.29 / 100万回 | **$0.01** |

### その他

| 項目 | 月額概算 |
|-----|:---:|
| S3（静的ホスティング） | **$0.50** |
| CloudFront（配信） | **$1.00** |
| Cognito（100 MAU 無料枠内） | **$0.00** |
| Transcribe Streaming（500セッション × 3分） | **$0.54** |

### 合計

| カテゴリ | 月額 (USD) | 月額 (JPY概算 @150円) |
|---------|:---------:|:---:|
| Bedrock (LLM) | $43.31 | ¥6,497 |
| Polly (TTS) | $32.00 | ¥4,800 |
| DynamoDB | $15.15 | ¥2,273 |
| Lambda + API GW | $0.19 | ¥29 |
| S3 + CloudFront | $1.50 | ¥225 |
| Transcribe | $0.54 | ¥81 |
| **月額合計** | **$92.69** | **≈ ¥13,904** |

> **注意**: 無料利用枠（Lambda 100万回/月、DynamoDB 25GB、Polly Neural 100万文字/12ヶ月）を考慮すると、初年度は月額 **$50〜60 程度**に収まる見込み。  
> スケール時（1,000ユーザー）は Bedrock 呼び出しが支配的となり **$400〜500/月** を想定。
