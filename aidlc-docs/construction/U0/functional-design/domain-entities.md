# U0 ドメインエンティティ定義

> AI-DLC CONSTRUCTION Phase — Functional Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## 1. フロントエンド ステートエンティティ（Q3: A採用）

### 1.1 AppState（window.AppState — リアルタイム・ページ内メモリ）

ページリロードで消滅するリアルタイム状態。会話中のセッション一時データ。

```typescript
interface AppState {
  // 会話状態
  currentTurn: number;        // 現在の会話ターン番号（0起点）
  lastEmotion: string | null; // 最後にAIが返したカテゴリID（例: "fierce_anger"）
  angerLevel: number;         // 怒り度 0〜100（整数）
  trustLevel: number;         // 信頼度 0〜100（整数）

  // UI状態
  isRecording: boolean;       // 音声入力中フラグ
  isSpeaking: boolean;        // Polly 音声再生中フラグ
}

// 初期値
const INITIAL_APP_STATE: AppState = {
  currentTurn: 0,
  lastEmotion: null,
  angerLevel: 70,   // 初期値: やや高め（謝罪前）
  trustLevel: 30,   // 初期値: やや低め
  isRecording: false,
  isSpeaking: false,
};
```

### 1.2 SessionState（sessionStorage — セッション引き継ぎ）

タブを閉じるまで保持する中期状態。ページ遷移をまたぐデータ。

```typescript
interface SessionState {
  sessionId: string;              // UUID v4（DynamoDB PK）
  bossProfile: BossProfile | null;// 謝罪相手プロフィール（generate-opponent結果）
  avatarSeed: number | null;      // facesjs アバター seed 値
  planData: PlanData | null;      // 謝罪プラン（generate-plan結果）
  conversationHistory: Turn[];    // 直近10ターン（それ以前はDynamoDB参照）
}

interface BossProfile {
  name: string;           // 謝罪相手の名前（架空）
  age: number;
  gender: "male" | "female";
  personality: string;    // 性格特徴（自由文）
  angerTriggers: string[];// 特に怒るポイントのリスト
  softSpots: string[];    // 許しやすいポイントのリスト
  speechStyle: string;    // 話し方の特徴
  avatarSeed: number;     // facesjs seed
}

interface PlanData {
  apologySummary: string; // 謝罪の要約
  timing: string;         // 推奨タイミング
  location: string;       // 推奨場所
  gifts: string[];        // 手土産候補
  script: string;         // 謝罪台本（第一声〜締め）
  checkList: CheckItem[]; // 準備チェックリスト
}

interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

interface Turn {
  turnNumber: number;
  userInput: string;
  aiResponse: string;
  emotionCategory: string; // カテゴリID
  angerLevel: number;
  trustLevel: number;
  timestamp: string;       // ISO 8601
}
```

---

## 2. バックエンド エンティティ

### 2.1 Lambda 統一リクエスト/レスポンス構造

```python
# Lambda イベント（API Gateway HTTP API v2 から）
{
  "requestContext": {
    "requestId": "...",
    "authorizer": {
      "jwt": {
        "claims": {
          "sub": "<cognito-user-id>",   # userId として使用
          "email": "..."
        }
      }
    }
  },
  "body": "<JSON string>",              # validate() に渡す
  "headers": { "content-type": "..." }
}

# 正常レスポンス（全 Lambda 統一）
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "${ALLOWED_ORIGIN}",   # 環境変数
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  },
  "body": "{...}"   # ensure_ascii=False で日本語をそのまま返す
}
```

### 2.2 ValidationSchema 定義形式（input_validator.py）

```python
# スキーマ定義例（各 Lambda が定義して validate() に渡す）
SCHEMA = {
  "incident_summary": {"type": str, "required": True, "max_length": 2000},
  "categories":       {"type": str, "required": True, "max_length": 100},
  "relationship":     {"type": str, "required": True, "max_length": 100},
  "deadline":         {"type": str, "required": False, "max_length": 100},
  "affected_count":   {"type": int, "required": False},
}
```

### 2.3 BedrockRequest エンティティ

```python
@dataclass
class BedrockRequest:
    model_profile: Literal["fast", "standard", "premium"]
    messages: list[dict]    # Converse API メッセージ形式
    system_prompt: str
    max_tokens: int = 2048
    temperature: float = 0.7

# モデルID マッピング
MODEL_IDS = {
    "fast":     "amazon.nova-lite-v1:0",
    "standard": "anthropic.claude-haiku-4-5-v1:0",
    "premium":  "anthropic.claude-sonnet-4-5-v1:0",
}
```

---

## 3. 感情エンティティ（emotions.js）

### 3.1 EmotionCategory

```typescript
interface EmotionCategory {
  id: string;          // カテゴリID（例: "fierce_anger"）
  nameJa: string;      // 日本語名（例: "激怒・爆発"）
  emotions: Emotion[]; // このカテゴリに属する感情リスト
  primaryEffect: "shake" | "flash_red" | "flash_white" | "darken"
                | "brighten" | "none"; // 代表エフェクト
}

interface Emotion {
  id: string;          // 感情ID（例: "rage"）
  nameJa: string;      // 日本語名（例: "激怒"）
  categoryId: string;  // 親カテゴリID
  weight: number;      // 選択重み（先頭3感情: 2、その他: 1）
  cssParams: EmotionCSS;  // CSS transform パラメータ
  motionType: MotionType; // アクション種別
  effect: EffectType | null; // 特殊エフェクト
}

interface EmotionCSS {
  eyebrowScale: number;     // 1.0 = 基準。1.5 = 吊り上げ
  eyebrowY: number;         // px。正 = 上、負 = 下
  eyeScale: number;         // 1.0 = 基準
  eyeOpenness: number;      // 0〜1（0=閉、1=全開）
  mouthOpenness: number;    // 0〜1
  mouthCurve: number;       // -1=への字〜1=微笑み
  headTilt: number;         // deg。正=右傾き
  bodyForward: number;      // scale。1.0=直立、1.15=前のめり、0.85=後退
}

type MotionType =
  | "none" | "nod" | "shake_head" | "lean_forward" | "lean_back"
  | "tremble" | "sigh" | "look_away" | "cover_face" | "raise_hands";

type EffectType =
  | "screen_shake_large" | "screen_shake_medium" | "screen_shake_small"
  | "flash_red" | "flash_white" | "darken" | "brighten" | "tear"
  | "vibrate";
```

---

## 4. DynamoDB エンティティ（シングルテーブル設計）

### テーブル: `geza-data`

```
PK（パーティションキー）: USER#<userId>
SK（ソートキー）:         SESSION#<ISO8601> / TURN#<sessionId>#<turnNumber>
```

| エンティティ | PK | SK | 主要属性 |
|------------|----|----|---------|
| セッション | `USER#<userId>` | `SESSION#<createdAt>` | sessionType, supportMode, incidentSummary, finalScore, isCompleted |
| 会話ターン | `USER#<userId>` | `TURN#<sessionId>#<turnNum>` | userInput, aiResponse, emotionCategory, angerLevel, trustLevel |
| カルテ要約 | `USER#<userId>` | `KARTE#<sessionId>` | summary, ngWords[], weakPoints[], score |

### sessionType / supportMode 定義

```python
SESSION_TYPES = ["APOLOGY", "GUIDANCE", "DURING", "STORY"]
SUPPORT_MODES = ["face_to_face", "web_meeting"]
```

---

## 5. SAM インフラエンティティ

### Lambda 環境変数（全 Lambda 共通）

```yaml
Environment:
  Variables:
    DYNAMODB_TABLE: !Ref GezaTable          # geza-data
    ALLOWED_ORIGIN: !Sub "https://${CFDistribution.DomainName}"
    LOG_LEVEL: INFO
    # Bedrock リージョン: ap-northeast-1
    # 根拠: プロトタイプ（cfn-template.yaml）で BEDROCK_REGION: ap-northeast-1 を使用し Nova Lite 1-3s を実測済み
    # 要確認: Claude Haiku 4.5 / Sonnet 4.5 の ap-northeast-1 での利用可否をデプロイ前に Bedrock コンソールで確認すること
    BEDROCK_REGION: ap-northeast-1
```

### IAMロール最小権限原則（SECURITY-06）

```yaml
# Lambda 共通ポリシー（最小権限）
- Effect: Allow
  Action:
    - bedrock:InvokeModel
  Resource:
    - arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-v1:0
    - arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-haiku-4-5-v1:0
    - arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-4-5-v1:0
- Effect: Allow
  Action:
    - dynamodb:GetItem
    - dynamodb:PutItem
    - dynamodb:Query
    - dynamodb:UpdateItem
  Resource: !GetAtt GezaTable.Arn
- Effect: Allow
  Action:
    - logs:CreateLogGroup
    - logs:CreateLogStream
    - logs:PutLogEvents
  Resource: !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/*"
```
