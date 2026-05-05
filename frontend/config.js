/**
 * config.js — GEZA クライアント設定
 * U0 デプロイ済みリソースの接続情報を window.GEZA_CONFIG に格納する。
 * ※ AWSアカウントIDはプレースホルダー XXXXXXXXXXXX で代替
 */
window.GEZA_CONFIG = {
  // ---- Cognito ----
  region:      "ap-northeast-1",
  userPoolId:  "ap-northeast-1_hwx2hpNGn",
  clientId:    "2bf54jcqtgpaubsmbe9qoprq1v",

  // ---- API Gateway ----
  apiBaseUrl:  "https://h6a2xx1i30.execute-api.ap-northeast-1.amazonaws.com",

  // ---- CloudFront ----
  cloudfrontDomain: "https://dhamuhqye8mp6.cloudfront.net",
};
