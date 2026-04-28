# エージェント向け修正ルール

## 修正フロー

1. **仕様書をマスターとする**: コード修正前に必ず仕様書の該当箇所を確認する
2. **仕様変更 → 仕様書更新 → コード修正** の順序を遵守
3. **仕様追加** であれば仕様書に項目を追加してからコード修正
4. **aidlc-state.md** のホットフィックス履歴に必ず記録
5. AI-DLC ルールは遵守すること

## 仕様書の場所

| 仕様書 | パス | 内容 |
|--------|------|------|
| 統合仕様 | `aidlc-docs/construction/code-specification.md` | モジュール概要・設計思想・データフロー |
| モジュール別仕様 | `aidlc-docs/construction/modules/*.md` | 各Python/JSモジュールの詳細仕様 |
| タブ別仕様 | `aidlc-docs/construction/tabs/*.md` | 14タブ各々のHTML/JS/データ仕様 |
| 状態管理 | `aidlc-docs/aidlc-state.md` | ホットフィックス履歴・ステージ進捗 |
