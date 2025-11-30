#!/usr/bin/env python3
"""Development server with GTA III audio import endpoint."""

from __future__ import annotations

import argparse
import json
import pathlib
import socketserver
import sys
import tempfile
import threading
import time
import uuid
import webbrowser
from email.parser import BytesParser
from email.policy import default as default_policy
from typing import Any, Dict, List, Tuple
from urllib.parse import parse_qs, urlparse

try:  # Python 3.13 removes the cgi module which http.server imported historically
    import http.server
except ModuleNotFoundError as exc:  # pragma: no cover - exercised on Python 3.13+
    if exc.name != "cgi":
        raise

    import types

    cgi_stub = types.ModuleType("cgi")

    def _parse_header(value: str) -> Tuple[str, Dict[str, str]]:
        value = value or ""
        parts = [part.strip() for part in value.split(";") if part.strip()]
        if not parts:
            return "", {}
        main = parts[0]
        params: Dict[str, str] = {}
        for segment in parts[1:]:
            if "=" not in segment:
                continue
            key, raw_val = segment.split("=", 1)
            cleaned = raw_val.strip().strip('"')
            params[key.strip().lower()] = cleaned
        return main, params

    def _unsupported(*_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("cgi functionality is unavailable on this Python version")

    class _FieldStorage:  # pragma: no cover - placeholder for compatibility
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            _unsupported()

    cgi_stub.parse_header = _parse_header  # type: ignore[attr-defined]
    cgi_stub.parse_multipart = _unsupported  # type: ignore[attr-defined]
    cgi_stub.FieldStorage = _FieldStorage  # type: ignore[attr-defined]
    sys.modules["cgi"] = cgi_stub

    import http.server  # type: ignore[no-redef]

from import_gta3_audio import AudioImportError, STATIONS, import_gta3_audio


JobState = Dict[str, Any]
JOB_REGISTRY: Dict[str, JobState] = {}
JOB_LOCK = threading.Lock()


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


def browse_for_directory(initial: str | None = None) -> str | None:
    try:
        import tkinter  # type: ignore
        from tkinter import filedialog
    except Exception as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("Directory picker unavailable: install tkinter or run locally with a GUI") from exc

    root = tkinter.Tk()
    root.withdraw()
    try:
        root.update()
    except Exception:
        pass

    try:
        selection = filedialog.askdirectory(initialdir=initial or "", title="Select your GTA III folder")
    finally:
        try:
            root.destroy()
        except Exception:
            pass

    return selection or None


def _register_job(job: JobState) -> JobState:
    with JOB_LOCK:
        JOB_REGISTRY[job["id"]] = job
    return job


def _get_job(job_id: str) -> JobState | None:
    with JOB_LOCK:
        job = JOB_REGISTRY.get(job_id)
        if not job:
            return None
        return json.loads(json.dumps(job))


def _update_job(job_id: str, **fields: Any) -> None:
    with JOB_LOCK:
        job = JOB_REGISTRY.get(job_id)
        if not job:
            return
        job.update(fields)
        job["updated_at"] = time.time()


def _create_job(path: pathlib.Path) -> JobState:
    job_id = uuid.uuid4().hex
    job: JobState = {
        "id": job_id,
        "status": "pending",
        "gta3_dir": str(path),
        "progress": 0,
        "total": len(STATIONS),
        "records": {},
        "summary": None,
        "error": None,
        "started_at": time.time(),
        "updated_at": time.time(),
    }
    return _register_job(job)


def _run_import_job(job_id: str, game_root: pathlib.Path) -> None:
    def progress_hook(event: Dict[str, Any]) -> None:
        if event.get("type") == "station":
            record = event.get("record", {})
            summary = event.get("summary", {})
            stem = record.get("stem")
            if stem:
                with JOB_LOCK:
                    job = JOB_REGISTRY.get(job_id)
                    if not job:
                        return
                    current = int(job.get("progress", 0))
                    job["progress"] = max(int(record.get("index", 0)), current)
                    records = job.setdefault("records", {})
                    records[stem] = record
                    job["partial_summary"] = summary
                    job["updated_at"] = time.time()
        elif event.get("type") == "complete":
            summary = event.get("summary", {})
            _update_job(job_id, status="completed", summary=summary, progress=len(STATIONS))

    try:
        _update_job(job_id, status="running")
        summary = import_gta3_audio(game_root, progress_callback=progress_hook)
        _update_job(job_id, status="completed", summary=summary, progress=len(STATIONS))
    except AudioImportError as exc:
        _update_job(job_id, status="failed", error=str(exc))
    except Exception as exc:  # pragma: no cover - safety net
        _update_job(job_id, status="failed", error=f"Unexpected failure: {exc}")


def start_import_job(path: str) -> JobState:
    game_root = pathlib.Path(path).expanduser()
    job = _create_job(game_root)

    thread = threading.Thread(target=_run_import_job, args=(job["id"], game_root), daemon=True)
    thread.start()
    return _get_job(job["id"]) or job


def make_handler(directory: pathlib.Path, *, verbose: bool = False):
    serve_directory = str(directory)

    class RequestHandler(http.server.SimpleHTTPRequestHandler):
        directory = serve_directory
        server_version = "GTARadioServer/1.0"
        protocol_version = "HTTP/1.1"
        verbose_mode = verbose

        def log_message(self, format: str, *args: Any) -> None:
            sys.stdout.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path == "/api/import-gta3-status":
                self._handle_import_status(parsed)
                return
            if parsed.path == "/api/import-gta3-start":
                self._handle_import_start(parsed)
                return
            if parsed.path == "/api/import-gta3-browse":
                self._handle_browse_directory()
                return
            if parsed.path == "/api/import-gta3-upload":
                # Permit query-string driven imports for browser address bar usage.
                self._handle_upload_import(parsed)
                return

            super().do_GET()

        def do_POST(self) -> None:  # noqa: N802 (inherit signature)
            if self.path == "/api/import-gta3":
                self._handle_json_import()
                return
            if self.path == "/api/import-gta3-upload":
                self._handle_upload_import()
                return
            if self.path == "/api/import-gta3-start":
                self._handle_import_start()
                return
            if self.path == "/api/import-gta3-browse":
                self._handle_browse_directory()
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

        def _handle_upload_import(self, parsed: Any | None = None) -> None:
            if parsed is None:
                parsed = urlparse(self.path)

            params = parse_qs(parsed.query)
            gta_dir_param = params.get("gta3_dir") or params.get("gta3Dir")
            if gta_dir_param:
                try:
                    summary = import_gta3_audio(gta_dir_param[0])
                except AudioImportError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                except Exception as exc:  # pragma: no cover - safety net
                    self.log_error("import upload failed: %s", exc)
                    self._send_json(500, {"error": "Unexpected import failure"})
                    return

                self._send_json(200, {"summary": summary})
                return

            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                self._send_json(400, {"error": "Expected multipart/form-data or gta3_dir"})
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

        def _handle_import_start(self, parsed: Any | None = None) -> None:
            if parsed is None:
                parsed = urlparse(self.path)

            if self.command == "GET":
                params = parse_qs(parsed.query)
            else:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b""
                params = {}
                if raw:
                    try:
                        payload = json.loads(raw.decode("utf-8"))
                        if isinstance(payload, dict):
                            params = {key: [value] for key, value in payload.items() if isinstance(value, str)}
                    except json.JSONDecodeError:
                        self._send_json(400, {"error": "Invalid JSON payload"})
                        return

            gta_dir = params.get("gta3_dir") or params.get("gta3Dir")
            if not gta_dir:
                self._send_json(400, {"error": "Provide gta3_dir"})
                return

            path_value = gta_dir[0]
            if not path_value:
                self._send_json(400, {"error": "Empty gta3_dir value"})
                return

            try:
                job = start_import_job(path_value)
            except Exception as exc:  # pragma: no cover - defensive
                self._send_json(500, {"error": f"Unable to start job: {exc}"})
                return

            self._send_json(202, {"job": job})

        def _handle_import_status(self, parsed: Any) -> None:
            params = parse_qs(parsed.query)
            job_id_values = params.get("job") or params.get("id")
            if not job_id_values:
                self._send_json(400, {"error": "Missing job id"})
                return
            job_id = job_id_values[0]
            job = _get_job(job_id)
            if not job:
                self._send_json(404, {"error": "Job not found"})
                return
            self._send_json(200, {"job": job})

        def _handle_browse_directory(self) -> None:
            try:
                selection = browse_for_directory()
            except RuntimeError as exc:
                self._send_json(400, {"error": str(exc)})
                return
            except Exception as exc:  # pragma: no cover - safety net
                self._send_json(500, {"error": f"Directory picker failed: {exc}"})
                return

            if not selection:
                self._send_json(200, {"cancelled": True})
            else:
                self._send_json(200, {"path": selection, "cancelled": False})

        def _send_json(self, status: int, data: Dict[str, Any]) -> None:
            body = json.dumps(data).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    return RequestHandler


def run_server(
    bind: str,
    port: int,
    directory: pathlib.Path,
    *,
    verbose: bool = False,
    open_browser: bool = True,
) -> None:
    handler = make_handler(directory, verbose=verbose)

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    with Server((bind, port), handler) as httpd:
        host, actual_port = httpd.server_address
        url = f"http://{host or '127.0.0.1'}:{actual_port}"
        print(f"Serving {directory} at {url}")
        print("Endpoints:")
        print("  POST /api/import-gta3          -> JSON body {'gta3Dir': '<path>'}")
        print("  POST /api/import-gta3-start    -> start async import job (JSON {'gta3_dir': '<path>'})")
        print("  GET  /api/import-gta3-start    -> start async import job with query ?gta3_dir=")
        print("  GET  /api/import-gta3-status   -> poll import job progress via ?job=<id>")
        print("  POST /api/import-gta3-browse   -> open native folder picker (requires GUI)")
        print("  GET  /api/import-gta3-upload   -> immediate import via ?gta3_dir=<path> (no upload)")

        if open_browser:
            try:
                webbrowser.open(url)
            except Exception:
                pass
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
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--no-open", action="store_true", help="Do not launch a browser tab automatically")
    return parser.parse_args(argv)


def main(argv: Any = None) -> None:
    args = parse_args(argv)
    directory = args.directory.resolve()
    if not directory.exists() or not directory.is_dir():
        raise SystemExit(f"Directory does not exist: {directory}")
    run_server(args.bind, args.port, directory, verbose=args.verbose, open_browser=not args.no_open)


if __name__ == "__main__":
    main()
