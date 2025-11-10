#!/usr/bin/env python3
"""Development server with GTA III audio import endpoint."""

from __future__ import annotations

import argparse
import http.server
import json
import pathlib
import socketserver
import sys
import tempfile
from email.parser import BytesParser
from email.policy import default as default_policy
from typing import Any, Dict, List, Tuple

from import_gta3_audio import AudioImportError, import_gta3_audio


def parse_multipart_form_data(body: bytes, content_type: str) -> Tuple[List[Tuple[str, bytes]], Dict[str, str]]:
    if "boundary=" not in content_type:
        raise ValueError("Missing multipart boundary")

    header = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
    parser = BytesParser(policy=default_policy)
    message = parser.parsebytes(header + body)

    if not message.is_multipart():
        raise ValueError("Multipart payload expected")

    files: List[Tuple[str, bytes]] = []
    fields: Dict[str, str] = {}

    for part in message.iter_parts():
        disposition = part.get("Content-Disposition")
        if not disposition:
            continue

        name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""

        if filename:
            files.append((filename, payload))
        elif name:
            charset = part.get_content_charset() or "utf-8"
            try:
                fields[name] = payload.decode(charset, errors="replace")
            except LookupError:
                fields[name] = payload.decode("utf-8", errors="replace")

    return files, fields


def make_handler(directory: pathlib.Path):
    serve_directory = str(directory)

    class RequestHandler(http.server.SimpleHTTPRequestHandler):
        directory = serve_directory
        server_version = "GTARadioServer/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: Any) -> None:
            sys.stdout.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))

        def do_POST(self) -> None:  # noqa: N802 (inherit signature)
            if self.path == "/api/import-gta3":
                self._handle_json_import()
                return
            if self.path == "/api/import-gta3-upload":
                self._handle_upload_import()
                return

            self.send_error(404, "Unsupported endpoint")

        def _handle_json_import(self) -> None:
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

        def _handle_upload_import(self) -> None:
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                self._send_json(400, {"error": "Expected multipart/form-data"})
                return

            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._send_json(400, {"error": "Invalid Content-Length"})
                return

            if length <= 0:
                self._send_json(400, {"error": "Empty request body"})
                return

            body = self.rfile.read(length)

            try:
                files, _fields = parse_multipart_form_data(body, content_type)
            except ValueError as exc:
                self._send_json(400, {"error": str(exc)})
                return

            if not files:
                self._send_json(400, {"error": "No files uploaded"})
                return

            try:
                with tempfile.TemporaryDirectory(prefix="gta3-upload-") as temp_root:
                    temp_root_path = pathlib.Path(temp_root)
                    for filename, payload in files:
                        if not filename:
                            continue
                        safe_name = filename.replace("\\", "/")
                        relative_path = pathlib.PurePosixPath(safe_name)
                        parts = [part for part in relative_path.parts if part not in ("", ".")]
                        if not parts or ".." in parts:
                            continue
                        destination = temp_root_path.joinpath(*parts)
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        with destination.open("wb") as handle:
                            handle.write(payload)

                    summary = import_gta3_audio(temp_root_path)
            except AudioImportError as exc:
                self._send_json(400, {"error": str(exc)})
                return
            except Exception as exc:  # pragma: no cover - safety net
                self.log_error("import upload failed: %s", exc)
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
        print("Endpoints:")
        print("  POST /api/import-gta3          -> JSON body {'gta3Dir': '<path>'}")
        print("  POST /api/import-gta3-upload   -> multipart/form-data with files[] from directory picker")
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
