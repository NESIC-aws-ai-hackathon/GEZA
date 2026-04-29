# GEZA プロトタイプ - アバター会話コア機能検証

> **目的**: 実現性調査「アバターとの会話コア機能（最重要）」の技術検証  
> **ステータス**: ✅ 検証完了・AWS環境削除済み  
> **期間**: 2026-04-29 〜 2026-04-30

---

## プロトタイプで検証した内容

### 検証フロー
```
ユーザー入力（テキスト）
    ↓
Lambda（Python 3.12, 512MB, 30s）
    ↓ 並列実行（ThreadPoolExecutor）
    ├── AWS Bedrock（Amazon Nova Lite）→ JSON { emotion, reply, anger_level, trust_level, ng_words_detected }
    └── Amazon Polly（Kazuha, Neural, ja-JP）→ MP3音声 + SpeechMarks（Visemeデータ）
    ↓
フロントエンド: facesjs SVGアバター + Viseme口パク + CSS表情制御
```

### 検証結果サマリー

| # | 検証項目 | 結果 | 計測値 |
|---|---------|------|--------|
| 1 | Bedrock レスポンス時間 | ✅ OK | 1,000〜3,000ms（Nova Lite） |
| 2 | E2E レイテンシ | ✅ OK | 2,000〜5,000ms |
| 3 | Polly 音声合成 | ✅ OK | 並列実行で300〜800ms追加 |
| 4 | Viseme口パク同期 | ✅ OK | SpeechMarks APIで実現 |
| 5 | 感情ラベル精度 | ✅ OK | 5感情分類（怒り/苛立ち/失望/驚き/納得） |
| 6 | NGワード検知 | ✅ OK | 「次から気をつけます」等を正確検知 |
| 7 | 会話連続性（3ターン以上） | ✅ OK | 最大6ターン履歴保持 |
| 8 | facesjs SVGアバター | ✅ OK | 瞬き・視線・うなずき・発話モーション |

---

## ディレクトリ構成

```
prototype/
├── backend/
│   ├── lambda_function.py    # Lambda関数（Bedrock + Polly 並列呼び出し）
│   ├── prompts/              # プロンプトテンプレート
│   └── local_server.py       # ローカルテストサーバー
├── frontend/
│   ├── index.html            # UIプロトタイプ
│   ├── style.css             # スタイル（スマホ375px基準）
│   ├── app.js                # フロントエンドロジック（facesjs v3）
│   ├── config.js             # API URL設定（デプロイ時自動生成）
│   ├── facesjs.min.js        # facesjs IIFEバンドル（フォーク版）
│   └── videos/               # 感情別動画ファイル（参考用）
├── cfn-template.yaml         # CloudFormationテンプレート
├── deploy.ps1                # デプロイスクリプト（PowerShell）
└── README.md                 # このファイル
```

---

## デプロイ手順（再デプロイする場合）

### 前提条件
- AWS CLI 設定済み（Profile: `share`, Region: `ap-northeast-1`）
- PowerShell（Windows）
- Node.js（facesjs再ビルド時のみ）

### 手順

```powershell
# 1. facesjs バンドルを更新する場合（通常は不要）
cd facesjs-fork
npm install --legacy-peer-deps --ignore-scripts
node tools/process-svgs.js
npx babel src --extensions ".js,.jsx,.ts,.tsx" --out-dir build
npx vite build --config vite.bundle.config.js
Copy-Item dist-bundle\facesjs.min.js ..\prototype\frontend\facesjs.min.js

# 2. デプロイ実行
cd ..\prototype
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

デプロイ完了後、スクリプトの出力に以下が表示される：
```
Website: http://<bucket>.s3-website-ap-northeast-1.amazonaws.com
API:     https://<id>.execute-api.ap-northeast-1.amazonaws.com/api/chat
```

### デプロイ内容
`deploy.ps1` が以下を自動実行する：
1. Lambda パッケージ（ZIP）を作成し `geza-deploy-<account>` バケットへアップロード
2. CloudFormation スタック `geza-prototype` をデプロイ（Lambda + API Gateway + S3 + IAM）
3. `frontend/` ディレクトリ全体を S3 ウェブサイトバケットに sync
4. `config.js` に API URL を自動書き込み

---

## 環境削除手順

```powershell
# 1. S3バケットを空にする（オブジェクトがあると削除不可）
aws s3 rm s3://geza-prototype-websitebucket-lztfz0gwczkt --recursive --profile share
aws s3 rm s3://geza-deploy-XXXXXXXXXXXX --recursive --profile share

# 2. CloudFormationスタックを削除
aws cloudformation delete-stack --stack-name geza-prototype --profile share --region ap-northeast-1

# 3. 削除完了を待つ
aws cloudformation wait stack-delete-complete --stack-name geza-prototype --profile share --region ap-northeast-1
Write-Host "削除完了"
```

> ⚠️ `geza-deploy-<account>` バケットは CloudFormation 管理外のため手動削除が必要：
> ```powershell
> aws s3 rb s3://geza-deploy-XXXXXXXXXXXX --profile share
> ```

---

## アーキテクチャ詳細

### AWS構成
| サービス | 設定 |
|---------|------|
| Lambda | Python 3.12, 512MB, 30s timeout |
| API Gateway | HTTP API v2, PayloadFormatVersion 2.0, CORS enabled |
| Bedrock | Amazon Nova Lite (`amazon.nova-lite-v1:0`) |
| Polly | Voice: Kazuha, ja-JP, Neural, MP3 + SpeechMarks(viseme) |
| S3 | 静的ウェブサイトホスティング（パブリック） |

### フロントエンド技術スタック
| 技術 | 用途 |
|------|------|
| facesjs v5.0.3（フォーク） | SVGアバター生成（data-feature属性追加） |
| CSS transform / animation | 表情制御（眉・目の開き・うなずき） |
| SVG path animation | Viseme口パク（SVG overlay） |
| Polly SpeechMarks API | 音声とVisemeのタイムコード同期 |

### アバター感情設計（実装済み）
| 感情 | トリガー | 眉 | 目 | 口 |
|------|---------|----|----|-----|
| anger（怒り） | 初期状態・NGワード | 内側傾斜 14° | 0.82倍 | 逆弧 |
| irritation（苛立ち） | 軽度NGワード | 内側傾斜 7° | 0.90倍 | 少し逆弧 |
| disappointment（失望） | 不十分な謝罪 | 下がり眉 | 0.78倍 | 下弧 |
| surprise（驚き） | 予想外の謝罪 | 跳ね上がり | 1.15倍 | 丸く開く |
| acceptance（納得） | 良い謝罪 | リラックス | 1.0倍 | 笑顔 |

---

## 判明した技術的知見

### ✅ 採用確定
- **Amazon Nova Lite**: Claude Haiku より安価で高速（1〜3秒）。感情分類・NGワード検知・日本語生成品質が十分
- **Amazon Polly Kazuha + SpeechMarks**: Visemeデータで口パク同期が実現可能
- **facesjs + CSS transform**: display()再呼び出しなしでリアルタイム表情制御が可能
- **ThreadPoolExecutor**: Bedrock + Polly を並列実行することでE2Eレイテンシを短縮

### ⚠️ 本番実装で要検討
- **facesjs ID管理**: `eye.id="normal"` 等の無効IDは描画スキップされる。有効ID一覧(`female1`〜`female16`等)を使うこと
- **SVG transform 上書き問題**: facejsがSVG属性で配置した要素にCSS styleを直接上書きすると位置が壊れる → wrapper `<g>` を挟む
- **preserveAspectRatio**: facejsデフォルトは `xMinYMin meet`（左寄せ）→ `xMidYMin slice` に変更
- **音声自動再生制限**: ブラウザのAutoplay Policyによりユーザーインタラクションが必要

### ❌ 採用見送り
- **Nova Reel（動画アバター）**: レスポンス速度・コスト・感情制御の柔軟性でSVGアバターが優位
- **MP4動画アバター**: ループ切り替えのカクつきと感情数の制限でSVGアバターに変更

---

## 本番との差分

| 項目 | プロトタイプ（検証済み） | 本番実装（予定） |
|------|----------------------|--------------|
| アバター | facesjs SVG（5感情） | facesjs SVG（5感情以上）+ 怒りマーク等 |
| 音声入力 | テキストのみ | AWS Transcribe ストリーミング |
| 感情数 | 5種類 | 5〜10種類 |
| ホスティング | S3静的ウェブサイト | S3 + CloudFront |
| 認証 | なし | AWS Cognito |
| データ保存 | なし | DynamoDB |
| Bedrockモデル | Nova Lite | Nova Lite（軽量用途）/ Claude Sonnet（高品質用途） |


---

## プロトタイプ概要

### 検証対象フロー
```
ユーザー入力（テキスト）
    ↓
Lambda（Python）→ AWS Bedrock（Claude Sonnet 3.5 v2）
    ↓
JSON応答: { emotion, reply, anger_level, trust_level, ng_words_detected }
    ↓
フロントエンド: 感情ラベルに応じてアバター表示切り替え + 返答テキスト表示
```

### ディレクトリ構成
```
prototype/
├── backend/
│   ├── lambda_function.py    # Lambda関数（Bedrock呼び出し）
│   └── local_server.py       # ローカルテストサーバー
├── frontend/
│   ├── index.html            # UIプロトタイプ
│   ├── style.css             # スタイル（スマホ375px基準）
│   ├── app.js                # フロントエンドロジック
│   └── videos/               # 感情別動画ファイル（自分で配置）
│       ├── anger.mp4         # 怒り
│       ├── acceptance.mp4    # 納得
│       └── disappointment.mp4 # 失望
└── README.md                 # このファイル
```

---

## 動画ファイルの準備

`prototype/frontend/videos/` に以下の3ファイルを配置してください：

| ファイル名 | 感情 | 再生タイミング |
|-----------|------|-------------|
| `anger.mp4` | 怒り | NGワード検知、言い訳、初期状態 |
| `acceptance.mp4` | 納得 | 良い謝罪、再発防止策に納得 |
| `disappointment.mp4` | 失望 | 不十分な謝罪、誠意が感じられない |

**動画要件：**
- MP4形式（H.264推奨）
- ループ再生可能な短尺（3〜10秒程度）
- 正方形に近いアスペクト比推奨（円形にクロップ表示されるため）

---

## 起動方法

### 前提条件
- Python 3.9+
- AWS CLI設定済み（`aws configure`でBedrock権限のあるIAMユーザー/ロール）
- boto3 インストール済み

### ローカル起動
```bash
cd prototype/backend
python local_server.py
```
ブラウザで http://localhost:8080 を開く

### AWS Lambda デプロイ（本番検証用）
1. `lambda_function.py` を ZIP化
2. Lambda関数を作成（Python 3.12 ランタイム）
3. IAMロールに `bedrock:InvokeModel` 権限を付与
4. API Gateway (HTTP API) を作成し、POST /chat をLambdaに接続

---

## 検証項目と計測方法

| # | 検証項目 | 計測方法 | 目標値 |
|---|---------|---------|--------|
| 1 | Bedrock レスポンス時間 | `_metrics.bedrock_latency_ms` | < 10,000ms |
| 2 | E2E レイテンシ | フロントエンドの `performance.now()` | < 3,000ms |
| 3 | 感情ラベル精度 | 10種類の感情が正しく返るか | 100% |
| 4 | NGワード検知 | テスト入力でNG検出されるか | 100% |
| 5 | 会話連続性 | 3ターン以上の会話で文脈保持 | OK |
| 6 | 動画切り替え | 感情変化でCSS/アバターが変化するか | < 1秒 |

---

## 感情パターン（プロトタイプ: 3種類）

| ラベル | 日本語 | 用途 |
|--------|--------|------|
| anger | 怒り | NGワード検知時、初期状態 |
| acceptance | 納得 | 良い謝罪、再発防止策 |
| disappointment | 失望 | 不十分な謝罪 |

※Bedrockが返す感情ラベルは3種類に限定。フロントエンドで対応する動画に自動切り替え。

---

## 本番との差分

| 項目 | プロトタイプ | 本番実装 |
|------|------------|---------|
| アバター表示 | MP4動画切り替え（3パターン） | S3 MP4動画切り替え（10パターン以上） |
| 音声入力 | テキスト入力のみ | AWS Transcribe ストリーミング |
| 音声出力 | テキスト表示のみ | AWS Polly TTS 同時再生 |
| ホスティング | ローカルサーバー | Lambda + API Gateway + CloudFront |
| 認証 | なし | AWS Cognito |
