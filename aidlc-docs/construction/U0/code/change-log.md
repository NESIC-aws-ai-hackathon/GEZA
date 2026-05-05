# U0 コード生成 チェンジログ

## v0.1.0 — U0 初期コード生成完了

### 生成ファイル一覧

#### インフラ
| ファイル | 内容 |
|---------|------|
| `template.yaml` | SAM テンプレート（全 Lambda 23本 / DynamoDB / SQS / S3×2 / Cognito / CloudFront） |
| `samconfig.toml` | SAM デプロイ設定（default / staging 環境） |

#### バックエンド共有ライヤー (`backend/shared/`)
| ファイル | 内容 |
|---------|------|
| `decorators.py` | `@handle_errors` デコレーター / CORS ヘッダー生成 |
| `input_validator.py` | インジェクション検知・HTMLエスケープ・スキーマ検証 |
| `bedrock_client.py` | Bedrock 呼び出し / 3モデルプロファイル / リトライ (1s→2s→4s) |
| `prompt_loader.py` | S3 プロンプトテンプレート読み込み / `{{変数}}` 置換 |
| `structured_logger.py` | CloudWatch Logs 向け JSON 構造化ログ |
| `requirements.txt` | boto3>=1.34.0 / hypothesis>=6.100.0 |

#### バックエンド Lambda (`backend/functions/`)
| 関数名 | 種別 | 内容 |
|--------|------|------|
| `get-job-status` | 完全実装 | 非同期ジョブ状態取得（JWT sub でアクセス制御） |
| `bedrock-dispatcher` | 完全実装 | SQS→Bedrock→DynamoDB / ReportBatchItemFailures |
| `assess-apology` | スタブ | U2 で実装予定 |
| `evaluate-apology` | スタブ | U2 で実装予定 |
| `probe-incident` | スタブ | U2 で実装予定 |
| `generate-opponent` | スタブ | U2 で実装予定 |
| `generate-story` | スタブ | U2 で実装予定 |
| `generate-feedback` | スタブ | U2 で実装予定 |
| `generate-prevention` | スタブ | U2 で実装予定 |
| `generate-follow-mail` | スタブ | U2 で実装予定 |
| `analyze-reply` | スタブ | U2 で実装予定 |
| `diagnose-tendency` | スタブ | U2 で実装予定 |
| `generate-guidance-feedback` | スタブ | U2 で実装予定 |
| `generate-plan` | スタブ | U2 で実装予定 |
| `text-to-speech` | スタブ | U2 で実装予定 |
| `save-session` | スタブ | U2 で実装予定 |
| `get-karte` | スタブ | U2 で実装予定 |
| `analyze-karte` | スタブ | U2 で実装予定 |
| `evaluate-guidance` | スタブ | U2 で実装予定 |
| `check-draft` | スタブ | U2 で実装予定 |
| `save-story-log` | スタブ | 将来実装予定 |
| `detect-danger-speech` | スタブ | U2 で実装予定 |
| `analyze-anger` | スタブ | U2 で実装予定 |

#### プロンプトテンプレート (`backend/prompts/`)
17 ファイル — 全て `{{変数名}}` 形式のプレースホルダー版

#### フロントエンド共有 (`frontend/shared/`)
| ファイル | 内容 |
|---------|------|
| `auth.js` | Cognito 認証 / sessionStorage トークン管理 |
| `api.js` | API クライアント / pollJob (maxInterval=5s / maxWait=60s) |
| `state.js` | 3層ステート管理 (sessionStorage / memory / subscriber) |
| `avatar.js` | facesjs アバター制御 / 感情アニメーション |
| `emotions.js` | 30感情定義 / 15カテゴリ |
| `anger-gauge.js` | 怒りゲージ UI コンポーネント |
| `whisper-advisor.js` | ウィスパーアドバイザー |

#### フロントエンドエントリポイント
| ファイル | 内容 |
|---------|------|
| `frontend/index.html` | ログインページ（Cognito ホスト型 UI リダイレクト） |

#### テスト
| ファイル | 内容 |
|---------|------|
| `backend/tests/test_input_validator.py` | Hypothesis PBT 4 テスト（インジェクション / 文字数 / required） |
| `frontend/tests/test_emotions.js` | fast-check PBT 5 テスト（ID一貫性 / angerLevel 範囲 / カテゴリ等） |

### セキュリティ対応
- SECURITY-05: 全 Lambda `input_validator.validate()` 経由（スタブは U2 実装時に適用）
- SECURITY-08: CORS `ALLOWED_ORIGIN` 環境変数（ワイルドカード禁止）
- SECURITY-09: スタックトレース非公開
- AUTH-05: トークンは `sessionStorage` のみ
- XSS-01: DOM 挿入は `textContent` のみ（`innerHTML` 禁止）
- PBT-01: Hypothesis + fast-check でテスト済み

### 既知の制限（U2 以降で対応）
- Lambda スタブ 21 本は本体未実装（`TODO` コメント付き）
- プロンプトテンプレートはプレースホルダー版（実コンテンツは U2 で精緻化）
- `frontend/index.html` 以外のページは未生成（U2 以降）
