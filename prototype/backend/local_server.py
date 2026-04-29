"""
GEZA プロトタイプ - ローカルテストサーバー
Lambda関数をローカルで起動してフロントエンドからテストするためのサーバー
"""
import json
import sys
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

# lambda_functionをインポートできるようにパスを追加
sys.path.insert(0, os.path.dirname(__file__))
from lambda_function import lambda_handler


class ProxyHandler(SimpleHTTPRequestHandler):
    """フロントエンドの静的ファイル配信 + /api/chat のプロキシ"""

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST,OPTIONS")
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/chat":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")

            # Lambda形式のイベントを構築
            event = {"body": body}
            result = lambda_handler(event, None)

            self.send_response(result["statusCode"])
            for key, value in result["headers"].items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(result["body"].encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        # フロントエンドの静的ファイルを配信
        frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
        if self.path == "/" or self.path == "/index.html":
            filepath = os.path.join(frontend_dir, "index.html")
        else:
            filepath = os.path.join(frontend_dir, self.path.lstrip("/"))

        if os.path.exists(filepath) and os.path.isfile(filepath):
            self.send_response(200)
            if filepath.endswith(".html"):
                self.send_header("Content-Type", "text/html; charset=utf-8")
            elif filepath.endswith(".css"):
                self.send_header("Content-Type", "text/css; charset=utf-8")
            elif filepath.endswith(".js"):
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
            elif filepath.endswith(".mp4"):
                self.send_header("Content-Type", "video/mp4")
            elif filepath.endswith(".webm"):
                self.send_header("Content-Type", "video/webm")
            self.end_headers()
            with open(filepath, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    port = 8080
    print(f"GEZA Prototype Server starting on http://localhost:{port}")
    print("Press Ctrl+C to stop")
    server = HTTPServer(("localhost", port), ProxyHandler)
    server.serve_forever()
