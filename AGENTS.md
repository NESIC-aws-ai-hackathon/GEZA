## 開発フロー

1. コード修正前に `docs/` 配下の該当仕様書を確認
2. 仕様変更 → 仕様書更新 → コード修正（順序厳守）
3. 仕様追加 → 仕様書に項目追加 → コード修正
4. `aidlc-state.md` に変更を記録
5. AI-DLC ルールを遵守
6. AI-DLC成果物とは別にdocs配下に統合した読みやすい成果物を作成し、更新を行うこと。
7. inceptionフェーズ内で実現性の調査と調査結果を記載する資料を作成する。
　 事前調査が必要な項目と方法を洗い出して、人間が実際に調査し、結果を記載する。
8. AI-DLCのワークフローはすべてスキップしないで厳密に行うこと。

## MVPスコープはAI-DLC実行中に随時検討する

**スコープ外は実装しないこと。**

## コードスタイル

```python
# Lambda ハンドラーの例
def lambda_handler(event, context):
    try:
        body = json.loads(event["body"])
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps(result, ensure_ascii=False)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
````

```javascript
// DOM挿入は必ず textContent（XSS対策）
element.textContent = userInput;  // ✅
element.innerHTML = userInput;    // ❌
```

## LLMプロンプトルール

*   テンプレートは `backend/prompts/` に配置、変数は `{{variable_name}}`
*   プロンプト変更時は `docs/prompt-spec.md` を先に更新
*   1ターン = 1 API呼び出しで以下のJSONを返却させる:


## やらないこと

*   `.env` をgitにコミットしない
*   フロントエンドから直接LLM APIを呼ばない
*   実在の人物名・企業名を謝罪ボスとして生成しない
*   法的助言・医療助言を生成しない
*   MVPスコープ外の機能を実装しない

## コミットメッセージ

    <type>(<scope>): <subject>

    type: feat | fix | docs | style | refactor | test | chore

## 参照ドキュメント

| ドキュメント    | パス                     |
| --------- | ---------------------- |
| ユーザーストーリー | `docs/user-stories.md` |
| AI-DLC状態  | `aidlc-state.md`       |
| 画像アセット定義 | `icons/README.md`      |