# GEZA 要件確認質問

`docs/user-stories.md` の内容を確認しました。開発を進めるにあたり、以下の点を確認させてください。  
各質問の `[Answer]:` タグの後に回答（アルファベット）を記入してください。

---

## Question 1
MVPとして最初にリリースする対象スコープはどれですか？

A) Epic 2（実案件モード）のみ：やらかし入力 → 謝罪相手生成 → 謝罪プラン
B) Epic 4（謝罪練習モード）のみ：テキスト入力 → AI判定 → フィードバック
C) Epic 1（トップ画面） + Epic 2（実案件モード） + Epic 4（謝罪練習モード）の3つ
D) Epic 1〜4 の全体（ストーリーモード含む）
E) Other (please describe after [Answer]: tag below)

[Answer]: E可能なものはすべて

---

## Question 2
フロントエンドのプラットフォームはどれですか？

A) Webアプリ（スマホブラウザで動作）
B) スマホネイティブアプリ（iOS / Android）
C) WebアプリとPWA（ホーム画面追加対応）
D) Other (please describe after [Answer]: tag below)

[Answer]: A PCの画面でもスマホのような画面で表示

---

## Question 3
フロントエンドのフレームワークはどれですか？（Webの場合）

A) React / Next.js
B) Vue.js / Nuxt.js
C) HTML/CSS/Vanilla JS（シンプルなSPA）
D) Flutter Web
E) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 4
バックエンドのアーキテクチャはどれですか？

A) AWS Lambda（サーバーレス） + API Gateway
B) Node.js / Express サーバー
C) Python / FastAPI サーバー
D) AWS Lambda + API Gateway（既にAGENTS.mdに記載のスタイル）
E) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## Question 5
使用するLLM（大規模言語モデル）はどれですか？

A) OpenAI GPT-4o
B) Anthropic Claude（API直接）
C) AWS Bedrock（Claude / Titan等）
D) Google Gemini
E) Other (please describe after [Answer]: tag below)

[Answer]: Cで使用する箇所に応じてモデルを選定

---

## Question 6
音声入力（謝罪練習時の発話）はMVPに含めますか？

A) はい：ブラウザのWeb Speech API（無料・追加インフラ不要）を使用
B) はい：AWS Transcribe を使用
C) いいえ：テキスト入力のみでMVPスタート
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 7
謝罪対象アバターのアニメーションはMVPに含めますか？

A) はい：CSSアニメーション + 静止画で実装
B) はい：Lottieアニメーション（JSON形式）で実装
C) いいえ：MVPはテキストとアイコンのみ（アニメーションは後回し）
D) Other (please describe after [Answer]: tag below)

[Answer]: D: CSS + S3動画
S3上に事前にAIで作成しておいた複数のアクション用動画を配置しておき、AIによって動画を切り替える
動画を切り替えると同時に音声を再生する。

---

## Question 8
ユーザー認証・ログイン機能はMVPに含めますか？

A) いいえ：MVPは認証なし（ローカルストレージで履歴管理）
B) はい：AWS Cognito を使用
C) はい：Firebase Authentication を使用
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 9
インフラ・ホスティングはどこを予定していますか？

A) AWS（Lambda + S3 + CloudFront + API Gateway）
B) Vercel（フロントエンド） + AWS Lambda（バックエンド）
C) AWS Amplify
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 10
データベースはどれを使用しますか？

A) AWS DynamoDB（サーバーレス、NoSQL）
B) Amazon RDS（PostgreSQL / MySQL）
C) Firebase Firestore
D) MVPはDB不要（LLM API呼び出しのみ）
E) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 11
謝罪ボスのキャラクターアイコンはどのように準備しますか？

A) AI画像生成（DALL-E / Stable Diffusion等）で自動生成
B) フリー素材（いらすとや等）を利用
C) 既存の icons/ フォルダに配置済みのアセットを利用
D) テキスト表現のみ（絵文字やイニシャルアイコン）でMVPスタート
E) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 12
ハッカソン本番での実現性調査が必要な項目はありますか？（AGENTS.mdの「inceptionフェーズ内で実現性の調査」要件に基づき）

A) はい：LLMのレスポンス速度・コスト見積もり調査が必要
B) はい：音声認識の精度・レイテンシ調査が必要
C) はい：アバターアニメーションの実装工数調査が必要
D) いいえ：調査なしで実装に進む
E) Other（複数項目あればAの後に記載）

[Answer]: A B C Eアバタ－アニメーションの自動生成、会話の精度等

---

回答が完了したら、このファイルを保存してAIに知らせてください。
