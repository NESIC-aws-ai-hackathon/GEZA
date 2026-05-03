# GEZA 要件定義（統合版）

> ⚠️ **このファイルは人間向け可読版（要点概要）です。**  
> 正式版は [`aidlc-docs/inception/requirements/requirements.md`](../aidlc-docs/inception/requirements/requirements.md) を参照してください。

> AI-DLC Requirements Analysis + User Stories に基づき生成。詳細は `aidlc-docs/inception/requirements/requirements.md` を参照。
> **最終更新**: 2026-04-30（プロトタイプ検証結果 + User Stories 反映）

---

## サービス概要

GEZAは**謝罪丸投げコンシェルジュ**です。  
やらかした内容を一言入れるだけで、謝罪角度判定→台本フル生成→タイミング・手土産提案まで全部AIがやります。あなたは頭を下げるだけ。

```
コア機能（入力一つで全自動）
  謝罪角度アセスメント  ← やらかしの深刻度をAIが0〜180°の角度で数値化・ピクトグラム+スタンプ+SE音で演出
  謝罪台本フル生成      ← 相手分析 → NGワード → 第一声 → 全セリフ台本
  タイミング・手土産    ← いつ・どこで・何を持っていくかまで指示
  準備サポート          ← チェックリスト・フォローメール・再発防止策

オプション（やりたい人だけ）
  リハーサルモード      ← AI製台本の読み合わせ。失敗してもAIが書き直す
  上司向け指導練習      ← 独立フロー
```

**キャッチコピー：「土下座はあなたに、誠意はAIに。」**

---

## 対象Epicと主要機能

| Epic | 機能 | ユーザーストーリー数 | SP |
|------|------|:-----------:|:--:|
| Epic 1 | トップ画面 + Cognito認証 | 3 | 16 |
| Epic 2 | 謝罪プランニング（謝罪角度アセスメント・相手分析・プラン生成・スクリプト・**実施日まで伴走**）【コア】 | 8 | 49 |
| Epic 3 | ストーリーモード（難易度別ステージ・謝罪ボス戦） | 2 | 13 |
| Epic 4 | 謝罪練習モード（音声/テキスト入力→AI評価→リアルタイム反応）【サブ（任意）】 | 8 | 51 |
| Epic 5 | 謝罪後支援（再発防止策・フォローメール・準備チェックリスト） | 3 | 15 |
| Epic 6 | 謝罪カルテ（履歴保存・傾向分析・学習継続） | 2 | 13 |
| Epic 7 | 上司向けフィードバック（注意・指導練習モード） | 3 | 23 |
| Epic 8 | 送る前GEZAチェック・返信GEZA分析（継続的謝罪支援）【P2】 | 3 | 21 |
| Epic 9 | 謝罪カルテ拡張・謝罪傾向診断（継続的謝罪支援）【P2】 | 2 | 20 |
| Epic 10 | 謝罪中支援（怒り残量スキャナー・GEZA耳打ちモード）【P3・決勝拡張】 | 3 | 24 |
| **合計** | | **37** | **245** |

**P0（必須）: Epic 1、2、4、5、6。コア実装対象。**  
**P1（時間が余れば）: Epic 3（ストーリーモード）・ Epic 7（上司モード）。**  
**P2（将来構想）: Epic 8、9。**  
**P3（決勝拡張）: Epic 10（謝罪中支援 — 怒り残量スキャナー・GEZA耳打ちモード）。**

---

## 確定技術スタック

> **注意**: プロトタイプ検証（2026-04-29〜30）により技術スタックが一部変更された。変更箇所は ⚠️ で示す。

| レイヤー | 技術 |
|----------|------|
| フロントエンド | HTML/CSS/Vanilla JS（マルチページ構成）、スマホ幅375px中央表示 |
| バックエンド | AWS Lambda（Python 3.12, 512MB, 30s） + API Gateway HTTP API v2 |
| LLM | AWS Bedrock（Amazon Nova Lite：軽量用途 / Claude Sonnet：高品質用途）⚠️ |
| 音声入力 | AWS Transcribe |
| 音声出力 | Amazon Polly（女性: Kazuha / 男性: Takumi, ja-JP, Neural）+ SpeechMarks(Viseme) ⚠️ |
| アバター | ⚠️ **facesjs v5.0.3（SVGアバター）+ CSS表情制御**（Nova Canvas/Reel 不採用） |
| 認証 | Amazon Cognito（User Pool ログイン + Identity Pool Transcribe一時認証） |
| データベース | Amazon DynamoDB |
| ホスティング | S3 + CloudFront |

---

## AWS Bedrockモデル選定方針

| 用途 | モデル |
|------|--------|
| 評価・分類（角度アセスメント・評価・カルテ分析） | Amazon Nova Lite（1〜3秒応答） |
| 高品質生成（謝罪相手生成・プラン・フィードバック・メール・再発防止策） | Claude Sonnet |

---

## アバター仕様（プロトタイプ検証後の確定仕様）

> 当初のMP4動画方式から変更。プロトタイプにより優位性実証済み。

- **実装方式**: facesjs v5.0.3（オープンソース SVGアバター）+ CSS transform による感情制御
- **感情数**: **30種類**（強い怒り系 → 中立 → 肯定の感情アーク）
- **アバター固定**: facesjs の seed 値を謝罪相手のプロフィールに紐づける → 同じ相手なら常に同じ顔になる

**感情カテゴリ構成（合計30種）**:

| カテゴリ | 感情一覧（怒り度順） |
|---------|-------------------|
| 強い怒り | rage（激怒）/ anger（怒り）/ fury（憤怒）/ intimidation（威圧） |
| 不満系 | irritation（苛立ち）/ frustration（もどかしさ）/ impatience（焦燥） |
| 悲しみ系 | disappointment（失望）/ sadness（悲しみ）/ bitterness（苦々しさ） |
| 冷たい系 | contempt（軽蔑）/ disgust（嫌悪）/ coldness（冷淡）/ sarcasm（皮肉） |
| 驚き系 | surprise（驚き）/ shock（衝撃） |
| 疑い系 | suspicion（疑念）/ skepticism（懐疑） |
| 諦め系 | weariness（疲弊）/ resignation（諦め） |
| 中立 | confusion（困惑）/ hesitation（戸惑い）/ thinking（思案） |
| 好転 | interest（関心）/ empathy（共感） |
| 肯定 | relief（安堵）/ acceptance（納得）/ appreciation（感謝）/ satisfaction（満足）/ forgiveness（許し） |

**画面エフェクト**: rage/shock → 画面揺れ、forgiveness → 画面明暗変化

**モーション機能**:
- 瞬き: 2.5〜6.5秒ランダム間隔
- 視線移動: 3.5〜8.5秒ランダム間隔
- 頭の揺れ: headIdle CSS animation（アイドル）
- うなずき: speakingNod CSS animation（発話中）
- 口パク: Polly SpeechMarks Viseme タイムコード同期（50ms以内）

**口パクフロー**:
```
Lambda → Polly Kazuha(Neural)（女性）/ Takumi(Neural)（男性）→ MP3音声 + SpeechMarks(viseme)
                                     ↓
フロントエンド: タイムコードに合わせてSVG pathを動的書き換え
```

---

## 非機能要件サマリー

| カテゴリ | 要件 |
|---------|------|
| パフォーマンス | LLM APIレスポンス：10秒以内（目標 1〜3秒） |
| パフォーマンス | Transcribe 文字起こし：発話後5秒以内 |
| パフォーマンス | 表情切り替え（CSS transition）：0.5秒以内 |
| パフォーマンス | Polly口パク・音声同期タイムラグ：50ms以内 |
| セキュリティ | XSS対策：textContentのみ使用 |
| セキュリティ | Cognito認証必須（Epic 1から実装） |
| セキュリティ | シークレット管理：環境変数、.envはgitコミット不可 |
| セキュリティ | フロントエンドからLLM APIを直接呼ばない |
| セキュリティ | プロンプトインジェクション対策：input_validator.pyで500文字制限・ブラックリスト検知・制御文字除去 |

---

## ユーザーペルソナ

| ペルソナ | タイプ | 主な Epic |
|--------|------|-------|
| 田中 健太（Kenta） | 本番前に練習したいビジネスパーソン | Epic 1,2,4,5,6 |
| 佐藤 美咲（Misaki） | ゲーム感覚で謝罪力を鍛えたい新人 | Epic 1,3,4,6 |
| 山田 誠一（Seiichi） | 部下指導の練習もしたい上司 | Epic 1,2,4,5,6,7 |

詳細: [aidlc-docs/inception/user-stories/personas.md](../aidlc-docs/inception/user-stories/personas.md)

---

## 実現性調査

全調査項目がクリア済み（詳細：[aidlc-docs/inception/feasibility/feasibility-study.md](../aidlc-docs/inception/feasibility/feasibility-study.md)）：

| 調査項目 | 判定 |
|---------|------|
| 1. LLMレスポンス速度・コスト | ✅ OK（Nova Lite: 1〜3秒） |
| 2. Transcribe精度・レイテンシ | ✅ OK（公式・本番で実機検証） |
| 3. アバター動画自動生成 | ✅ 方針変更: facesjs SVG採用（Nova Canvas/Reel 不採用） |
| 4. 会話品質（LLM謝罪評価） | ✅ OK（NGワード検知・感情分類・文脈保持 実証済み） |
| 5. アバター会話コア機能 | ✅ OK（E2E 2〜5秒、Viseme口パク同期、6ターン会話 実証済み） |

---

## 制約

- `.env` はgitにコミットしない
- フロントエンドからLLM APIを直接呼ばない
- 実在の人物名・企業名を謝罪ボスとして生成しない
