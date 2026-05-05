"""
GEZA 構造化ロガー
CloudWatch Logs で解析可能な JSON 形式でログを出力する。
個人情報・シークレットをログに含めない（SECURITY-09）。
"""
import json
import logging
import datetime


class _StructuredLogger:
    def __init__(self, request_id: str):
        self._request_id = request_id
        self._logger = logging.getLogger("geza")
        if not self._logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter("%(message)s"))
            self._logger.addHandler(handler)
        self._logger.setLevel(logging.DEBUG)

    def _format(self, level: str, message: str, extra: dict = None) -> str:
        record = {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "level": level,
            "message": message,
            "request_id": self._request_id,
        }
        if extra:
            record.update(extra)
        return json.dumps(record, ensure_ascii=False)

    def info(self, message: str, extra: dict = None):
        self._logger.info(self._format("INFO", message, extra))

    def warning(self, message: str, extra: dict = None):
        self._logger.warning(self._format("WARNING", message, extra))

    def error(self, message: str, extra: dict = None):
        self._logger.error(self._format("ERROR", message, extra))

    def debug(self, message: str, extra: dict = None):
        self._logger.debug(self._format("DEBUG", message, extra))


def get_structured_logger(request_id: str) -> _StructuredLogger:
    return _StructuredLogger(request_id)
