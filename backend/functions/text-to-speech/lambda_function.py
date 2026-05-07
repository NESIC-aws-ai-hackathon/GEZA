"""
text-to-speech Lambda — U3 Polly TTS + SpeechMarks (Viseme)
Polly Neural TTS で MP3 と Viseme タイムコードを返す。
"""
import json
import base64
import os
import boto3
from shared.decorators import handle_errors, success_response
from shared.input_validator import validate
from shared.structured_logger import get_structured_logger

_REGION = os.environ.get("AWS_REGION", "ap-northeast-1")

_SCHEMA = {
    "text":     {"type": "str", "required": True},
    "voice_id": {"type": "str", "required": False},
}

# 許可ボイス ID（Polly ja-JP Neural）
_ALLOWED_VOICES = {"Kazuha", "Takumi"}
_DEFAULT_VOICE  = "Takumi"


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(getattr(context, "aws_request_id", "local"))
    body = json.loads(event.get("body") or "{}")
    validated = validate(body, _SCHEMA)

    text = validated["text"]
    voice_id = validated.get("voice_id", _DEFAULT_VOICE)
    if voice_id not in _ALLOWED_VOICES:
        voice_id = _DEFAULT_VOICE

    logger.info("text-to-speech", extra={"voice_id": voice_id, "text_len": len(text)})

    polly = boto3.client("polly", region_name=_REGION)

    # 1. MP3 音声合成
    audio_resp = polly.synthesize_speech(
        Text=text,
        OutputFormat="mp3",
        VoiceId=voice_id,
        Engine="neural",
        LanguageCode="ja-JP",
    )
    audio_bytes = audio_resp["AudioStream"].read()
    audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

    # 2. Viseme SpeechMarks 取得
    marks_resp = polly.synthesize_speech(
        Text=text,
        OutputFormat="json",
        SpeechMarkTypes=["viseme"],
        VoiceId=voice_id,
        Engine="neural",
        LanguageCode="ja-JP",
    )
    marks_raw = marks_resp["AudioStream"].read().decode("utf-8")
    visemes = []
    for line in marks_raw.strip().split("\n"):
        if line:
            try:
                mark = json.loads(line)
                visemes.append({"time": mark.get("time", 0), "value": mark.get("value", "sil")})
            except json.JSONDecodeError:
                continue

    return success_response({
        "audio_base64": audio_base64,
        "visemes": visemes,
    })
