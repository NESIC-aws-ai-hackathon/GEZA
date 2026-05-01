# GEZA アイコン・ロゴアセット

## サービス概要

- **サービス名**: GEZA（ゲザ）
- **タグライン**: 土下座はあなたに、誠意はAIに。
- **コンセプト**: 謝罪丸投げコンシェルジュ
- **カラースキーム**: 白ベース / チャコール(#1A1A1A) / アクセント赤(#E53935)

## ファイル一覧

### タイトルロゴ（Title_logo シリーズ）

| ファイル名 | サイズ | 比率 | 主な用途 |
|---|---|---|---|
| `Title_logo_1.png` | 2048×512 | 4:1 | デスクトップヘッダー / ナビゲーションバー |
| `Title_logo_2.png` | 1536×1024 | 3:2 | OGP画像 / SNSシェア / プレゼン表紙 |
| `Title_logo_3.png` | 2048×512 | 4:1 | メールシグネチャ / フッターバナー / モバイルヘッダー |
| `Title_logo_4.png` | 1731×909 | ≈2:1 | スプラッシュスクリーン / LPヒーロー / アイコン元素材 |

### その他アセット

| ファイル名 | サイズ | 用途 | HTML での参照例 |
|---|---|---|---|
| `favicon.png` | 32×32 | ブラウザタブ ファビコン | `<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon.png">` |
| `favicon-16.png` | 16×16 | 小サイズ ファビコン | `<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png">` |
| `geza_icon.png` | 中サイズ | 土下座キャラ単体アイコン（白背景） | アプリ内アイコン、ローディング画面、PWA manifest 等 |
| `geza_icon_large.png` | 大サイズ | 土下座キャラ単体アイコン（高解像度） | 印刷物、スプラッシュ画面等 |
| `github_header_title.png` | 横長 | GitHub README トップバナー | README.md の `img` タグで使用 |

## 使い分けガイド

### タイトルロゴの選び方

| シーン | 推奨ファイル | 理由 |
|---|---|---|
| PCヘッダー / ナビバー | `Title_logo_1.png` | 4:1 超横長・キャラ左＋テキスト右の密なレイアウト |
| GitHub README トップ | `github_header_title.png` | GitHub 表示幅に最適化済み |
| Twitter カード / OGP | `Title_logo_2.png` | 3:2 は SNS カードに近い比率。1200×630 にクロップ可 |
| プレゼン表紙 / スライド背景 | `Title_logo_2.png` | 余白にゆとりがあり可読性が高い |
| メール署名 / フッターバナー | `Title_logo_3.png` | 4:1 だが余白多め・縮小時の視認性が高い |
| モバイル上部バー | `Title_logo_3.png` | コンパクトに収まりやすい |
| LP ファーストビュー / ローディング | `Title_logo_4.png` | 縦積みレイアウトでインパクト大 |
| アプリアイコン / ファビコン元素材 | `Title_logo_4.png` | 正方形に近くトリミングしやすい |

### ブラウザ・メタ情報

```html
<!-- head 内 -->
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon.png">
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png">
<link rel="apple-touch-icon" href="/icons/geza_icon.png">
<meta property="og:image" content="https://your-domain/icons/Title_logo_2.png">
```

### ページ内レイアウト

- **ヘッダー（PCナビバー）**: `Title_logo_1.png` を使用（高さ 40〜56px 推奨）
- **ヘッダー（モバイル）**: `Title_logo_3.png` を使用
- **ヒーロー / ランディング**: `Title_logo_4.png` を大きく表示
- **ローディング / スプラッシュ**: `geza_icon.png` を中央に配置
- **カード内アイコン / ボタン**: `geza_icon.png` を縮小して使用

### PWA manifest.json

```json
{
  "name": "GEZA - 謝罪丸投げコンシェルジュ",
  "short_name": "GEZA",
  "icons": [
    { "src": "/icons/favicon.png", "sizes": "32x32", "type": "image/png" },
    { "src": "/icons/geza_icon.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/geza_icon_large.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#E53935",
  "background_color": "#FFFFFF"
}
```

## デザイントークン（参考）

```css
:root {
  --color-primary: #E53935;      /* アクセント赤 */
  --color-primary-dark: #C62828;
  --color-charcoal: #1A1A1A;     /* メインテキスト */
  --color-gray: #666666;         /* サブテキスト */
  --color-light-gray: #999999;
  --color-bg: #F5F5F7;           /* 背景 */
  --color-white: #FFFFFF;
}
```
