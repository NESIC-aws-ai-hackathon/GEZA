# GEZA アイコン・ロゴアセット

## サービス概要
- **サービス名**: GEZA（ゲザ）
- **タグライン**: 謝る前に、怒られておけ。
- **コンセプト**: AIが先に怒ってくれる新しい謝罪体験サービス
- **カラースキーム**: 白ベース / チャコール(#1A1A1A) / アクセント赤(#E53935)

## ファイル一覧

| ファイル名 | サイズ | 用途 | HTML での参照例 |
|---|---|---|---|
| `favicon.png` | 32×32 | ブラウザタブ ファビコン | `<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon.png">` |
| `favicon-16.png` | 16×16 | 小サイズ ファビコン | `<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png">` |
| `geza_icon.png` | 中サイズ | 土下座キャラ単体アイコン（白背景） | アプリ内アイコン、ローディング画面、PWA manifest等 |
| `geza_icon_large.png` | 大サイズ | 土下座キャラ単体アイコン（高解像度） | OGP画像生成、印刷物、スプラッシュ画面等 |
| `geza_title_logo.png` | 横長 | タイトルロゴ（アイコン + "GEZA" + サブタイトル、透過背景） | ヒーローセクション、About ページ等 |
| `logo-header.png` | 小・横長 | ヘッダー用ロゴ（明背景用、コンパクト） | `<img src="/icons/logo-header.png" alt="GEZA" class="header-logo">` |

## 使い分けガイド

### ブラウザ・メタ情報
```html
<!-- head 内 -->
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon.png">
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png">
<link rel="apple-touch-icon" href="/icons/geza_icon.png">
<meta property="og:image" content="https://your-domain/icons/geza_title_logo.png">
```

### ページ内レイアウト
- **ヘッダー（ナビバー）**: `logo-header.png` を使用（高さ 32〜48px 推奨）
- **ヒーロー / ランディング**: `geza_title_logo.png` を大きく表示
- **ローディング / スプラッシュ**: `geza_icon.png` を中央に配置
- **カード内アイコン / ボタン**: `geza_icon.png` を縮小して使用

### PWA manifest.json
```json
{
  "name": "GEZA - 謝る前に、怒られておけ。",
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
