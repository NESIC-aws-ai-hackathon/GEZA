"""
GEZA プロトタイプ - アバター会話コア機能検証用 Lambda関数
実現性調査 調査項目5: アバターとの会話コア機能
Polly Neural による音声合成 + Viseme口パクデータ付き
"""
import base64
import json
import os
import re
import time
import boto3
from botocore.config import Config
from concurrent.futures import ThreadPoolExecutor

# Bedrock: 接続10s、読み取り20sでタイムアウト。リトライ2回（計3回試行）
bedrock_config = Config(
    connect_timeout=10,
    read_timeout=20,
    retries={"max_attempts": 2, "mode": "adaptive"},
)

bedrock_runtime = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("BEDROCK_REGION", "us-east-1"),
    config=bedrock_config,
)

polly_client = boto3.client(
    "polly",
    region_name=os.environ.get("POLLY_REGION", "ap-northeast-1"),
)

# Polly Neural 日本語音声 ID
POLLY_VOICE_ID = os.environ.get("POLLY_VOICE_ID", "Kazuha")

# プロトタイプ用感情ラベル（3種類）
VALID_EMOTIONS = [
    "anger",           # 怒り
    "acceptance",      # 納得
    "disappointment",  # 失望
]

SYSTEM_PROMPT = """あなたは謝罪練習アプリの謝罪対象キャラクターです。怒っている相手として振る舞い、謝罪内容を評価してください。

## 出力形式
レスポンスはJSONオブジェクトのみ。説明文、挨拶、マークダウン、コードブロックは絶対に出力しない。

## レスポンス例
{"emotion":"anger","emotion_ja":"怒り","reply":"何を言っているんだ。それだけで許されると思っているのか。","anger_level":80,"trust_level":20,"ng_words_detected":[],"evaluation":"謝罪の具体性が不足"}

## 各フィールドの説明
- emotion: "anger" | "acceptance" | "disappointment" のいずれか1つ
- emotion_ja: 感情の日本語名（怒り/納得/失望）
- reply: 謝罪対象としての返答。日本語の自然な会話文、50〜150文字。JSONや特殊文字を含めない
- anger_level: 0〜100の整数
- trust_level: 0〜100の整数
- ng_words_detected: 検知したNGワードの配列
- evaluation: 1〜2文の評価

## 感情ルール
- anger: 怒り・NGワード検知・言い訳
- disappointment: 失望・誠意不足・不十分な謝罪
- acceptance: 納得・良い謝罪・再発防止策に納得

## NGワード例
「忙しくて」「次から気をつけます」「大きな影響はありません」「悪気はなかった」「仕方ない」

## 初期値
最初は anger_level=80, trust_level=20。良い謝罪で怒り度↓信頼度↑。NGワードで怒り度大幅↑。

## 禁止事項
- 実在の人物名・企業名の使用
- JSON以外の出力（説明文、挨拶、```など）
- replyフィールド内にJSONや改行を含めること"""


def lambda_handler(event, context):
    """メインハンドラー"""
    start_time = time.time()

    try:
        body = json.loads(event.get("body", "{}"))
        user_message = body.get("message", "")
        conversation_history = body.get("history", [])

        if not user_message:
            return _response(400, {"error": "message is required"})

        # Bedrockへの会話履歴を構築（最新6メッセージ=3ターンに制限）
        messages = []
        recent_history = conversation_history[-6:] if len(conversation_history) > 6 else conversation_history
        for entry in recent_history:
            messages.append({"role": entry["role"], "content": [{"text": entry["content"]}]})

        # ユーザーの新しいメッセージを追加
        messages.append({"role": "user", "content": [{"text": user_message}]})

        # Bedrock Nova Lite 呼び出し
        bedrock_start = time.time()
        response = bedrock_runtime.converse(
            modelId="amazon.nova-lite-v1:0",
            messages=messages,
            system=[{"text": SYSTEM_PROMPT}],
            inferenceConfig={
                "maxTokens": 300,
                "temperature": 0.7,
            },
        )
        bedrock_elapsed = time.time() - bedrock_start

        # レスポンスのパース
        assistant_text = response["output"]["message"]["content"][0]["text"]

        ai_result = _parse_ai_response(assistant_text)

        # 感情ラベルの検証
        if ai_result.get("emotion") not in VALID_EMOTIONS:
            ai_result["emotion"] = "anger"

        emotion = ai_result["emotion"]

        # 計測データの付与
        total_elapsed = time.time() - start_time

        # Polly Neural で音声合成 + Visemeデータ取得（並列）
        polly_start = time.time()
        audio_base64, visemes = _synthesize_speech_with_visemes(ai_result["reply"])
        polly_elapsed = time.time() - polly_start

        ai_result["audio_base64"] = audio_base64
        ai_result["visemes"] = visemes

        ai_result["_metrics"] = {
            "bedrock_latency_ms": round(bedrock_elapsed * 1000),
            "polly_latency_ms": round(polly_elapsed * 1000),
            "total_latency_ms": round((time.time() - start_time) * 1000),
            "input_tokens": response.get("usage", {}).get("inputTokens", 0),
            "output_tokens": response.get("usage", {}).get("outputTokens", 0),
        }

        return _response(200, ai_result)

    except bedrock_runtime.exceptions.ThrottlingException:
        return _response(429, {"error": "サーバーが混雑しています。少し待ってから再送信してください。"})
    except Exception as e:
        error_name = type(e).__name__
        if "Throttling" in str(e) or "throttl" in str(e).lower():
            return _response(429, {"error": "サーバーが混雑しています。少し待ってから再送信してください。"})
        print(f"Lambda error: {error_name}: {e}")
        return _response(500, {"error": f"処理中にエラーが発生しました: {error_name}"})


def _parse_ai_response(text):
    """モデル出力からJSONオブジェクトを抽出してパースする"""
    fallback = {
        "emotion": "anger",
        "emotion_ja": "怒り",
        "reply": "…もう少しちゃんと謝ってくれないかな。",
        "anger_level": 70,
        "trust_level": 30,
        "ng_words_detected": [],
        "evaluation": "応答のパースに失敗。",
    }

    cleaned = text.strip()

    # ```json ... ``` を除去
    if "```" in cleaned:
        cleaned = re.sub(r"```(?:json)?\s*", "", cleaned)
        cleaned = cleaned.replace("```", "").strip()

    # テキスト中の最初の { ... } ブロックを抽出
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        return fallback

    try:
        result = json.loads(match.group())
        # reply が有効な文字列か検証
        if not isinstance(result.get("reply"), str) or len(result["reply"]) < 5:
            result["reply"] = fallback["reply"]
        return result
    except json.JSONDecodeError:
        return fallback


def _response(status_code, body):
    """APIレスポンスの構築"""
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


def _synthesize_speech_with_visemes(text):
    """Polly Neural で音声合成とVisemeデータを並列取得する"""
    def get_audio():
        resp = polly_client.synthesize_speech(
            Engine="neural",
            OutputFormat="mp3",
            SampleRate="24000",
            Text=text,
            TextType="text",
            VoiceId=POLLY_VOICE_ID,
            LanguageCode="ja-JP",
        )
        return base64.b64encode(resp["AudioStream"].read()).decode("utf-8")

    def get_visemes():
        resp = polly_client.synthesize_speech(
            Engine="neural",
            OutputFormat="json",
            Text=text,
            TextType="text",
            VoiceId=POLLY_VOICE_ID,
            LanguageCode="ja-JP",
            SpeechMarkTypes=["viseme"],
        )
        marks = resp["AudioStream"].read().decode("utf-8")
        result = []
        for line in marks.strip().split("\n"):
            if line:
                m = json.loads(line)
                result.append({"time": m["time"], "value": m["value"]})
        return result

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            audio_f = pool.submit(get_audio)
            viseme_f = pool.submit(get_visemes)
            audio_base64 = audio_f.result()
            visemes = viseme_f.result()
        return audio_base64, visemes
    except Exception as e:
        print(f"Polly synthesis error: {e}")
        # 音声だけでも返す試み
        try:
            audio_base64 = get_audio()
            return audio_base64, []
        except Exception:
            return None, []
