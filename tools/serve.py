#!/usr/bin/env python3
"""Development server with GTA III audio import endpoint."""

from __future__ import annotations

import argparse
import http.server
import json
import pathlib
import socketserver
import sys
from typing import Any, Dict

from import_gta3_audio import AudioImportError, import_gta3_audio


def make_handler(directory: pathlib.Path):
    class RequestHandler(http.server.SimpleHTTPRequestHandler):
        directory = str(directory)
        server_version = "GTARadioServer/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: Any) -> None:
            sys.stdout.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))

        def do_POST(self) -> None:  # noqa: N802 (inherit signature)
            if self.path != "/api/import-gta3":
                self.send_error(404, "Unsupported endpoint")
                return

            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8")) if raw else {}
            except json.JSONDecodeError:
                self._send_json(400, {"error": "Invalid JSON payload"})
                return

            gta_dir = payload.get("gta3Dir") or payload.get("path")
            if not gta_dir or not isinstance(gta_dir, str):
                self._send_json(400, {"error": "Missing 'gta3Dir' string"})
                return

            try:
                summary = import_gta3_audio(gta_dir)
            except AudioImportError as exc:
                self._send_json(400, {"error": str(exc)})
                return
            except Exception as exc:  # pragma: no cover - safety net
                self.log_error("import failed: %s", exc)
                self._send_json(500, {"error": "Unexpected import failure"})
                return

            self._send_json(200, {"summary": summary})

        def _send_json(self, status: int, data: Dict[str, Any]) -> None:
            body = json.dumps(data).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    return RequestHandler


def run_server(bind: str, port: int, directory: pathlib.Path) -> None:
    handler = make_handler(directory)

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    with Server((bind, port), handler) as httpd:
        host, actual_port = httpd.server_address
        print(f"Serving {directory} at http://{host or '127.0.0.1'}:{actual_port}")
        print("POST /api/import-gta3 with {'gta3Dir': '<path>'} to convert assets.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping server...")


def parse_args(argv: Any = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the GTARadio dev server with import endpoint.")
    parser.add_argument("--bind", default="", help="Bind address (default: all interfaces)")
    parser.add_argument("--port", type=int, default=4173, help="Port to listen on (default: 4173)")
    parser.add_argument(
        "--directory",
        type=pathlib.Path,
        default=pathlib.Path(__file__).resolve().parents[1] / "web",
        help="Directory to serve (defaults to the web/ folder)",
    )
    return parser.parse_args(argv)


def main(argv: Any = None) -> None:
    args = parse_args(argv)
    directory = args.directory.resolve()
    if not directory.exists() or not directory.is_dir():
        raise SystemExit(f"Directory does not exist: {directory}")
    run_server(args.bind, args.port, directory)


if __name__ == "__main__":
    main()
