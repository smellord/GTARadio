#!/usr/bin/env python3
# Fully compatible with Python 3.8–3.13 (no cgi module)

VERBOSE = False


import argparse, json, pathlib, shutil, subprocess, sys
from urllib.parse import urlparse, parse_qs
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB_ROOT   = REPO_ROOT / "web"
TARGET_DIR = WEB_ROOT / "sounds" / "gta" / "3"

STATIONS   = ["HEAD","CLASS","KJAH","RISE","LIPS","GAME","MSX","FLASH","CHAT"]

def log(*a):
    print("[serve.py]", *a, flush=True)

def ensure_dir(p):
    p.mkdir(parents=True, exist_ok=True)

def which_prog(cands):
    for c in cands:
        p = shutil.which(c)
        if p:
            return p
    return None

def find_src(audio_dir: pathlib.Path, station):
    station_lower = station.lower()
    for ext in (".mp3", ".wav"):
        f = audio_dir / f"{station}{ext}"
        if f.exists():
            return f
    # fallback: case-insensitive match
    for ext in (".mp3", ".wav"):
        for f in audio_dir.glob(f"*{ext}"):
            if f.stem.lower() == station_lower:
                return f
    return None

def transcode_to_mp3(tool, src, dst):
    cmd = [
        tool, "-y",
        "-i", str(src),
        "-ar", "44100",
        "-ac", "2",
        "-c:a", "libmp3lame",
        "-q:a", "2",
        str(dst)
    ]
    return subprocess.call(cmd)

def scan_gta3(audio_dir):
    out = {"ok": True, "source": str(audio_dir), "stations": [], "found": 0, "missing": []}
    for s in STATIONS:
        src = find_src(audio_dir, s)
        if src:
            out["stations"].append({"station": s, "source": str(src)})
            out["found"] += 1
        else:
            out["stations"].append({"station": s, "source": None})
            out["missing"].append(s)
    return out

def import_gta3(audio_dir):
    ensure_dir(TARGET_DIR)
    tool = which_prog(["ffmpeg", "ffmpeg.exe"]) or which_prog(["avconv"])
    if not tool:
        return {"ok": False, "error": "ffmpeg not found. Install from https://ffmpeg.org/download.html"}

    out = {"ok": False, "source": str(audio_dir), "target": str(TARGET_DIR), "copied": [], "encoded": [], "missing": [], "errors": []}

    for s in STATIONS:
        src = find_src(audio_dir, s)
        if not src:
            out["missing"].append(s)
            continue
        dst = TARGET_DIR / f"{s}.mp3"
        try:
            if src.suffix.lower() == ".mp3":
                shutil.copy2(src, dst)
                out["copied"].append(s)
            else:
                rc = transcode_to_mp3(tool, src, dst)
                if rc == 0:
                    out["encoded"].append(s)
                else:
                    out["errors"].append({"station": s, "code": rc})
        except Exception as e:
            out["errors"].append({"station": s, "error": str(e)})

    out["ok"] = bool(out["copied"] or out["encoded"])
    return out

def extract_gta3_dir(path, headers, raw):
    """Accept gta3_dir from JSON, url-encoded, multipart, OR query string."""
    candidates = ["gta3_dir","gta3Dir","path","dir","audioDir","gameDir"]
    parsed = urlparse(path)
    qs = parse_qs(parsed.query or "")
    for k in candidates:
        if k in qs and qs[k]:
            return qs[k][0].strip().strip('"')

    ctype = (headers.get("Content-Type") or "").lower()
    text = raw.decode("utf-8", errors="ignore") if raw else ""

    # JSON
    if "application/json" in ctype:
        try:
            obj = json.loads(text or "{}")
            for k in candidates:
                if k in obj and obj[k]:
                    return str(obj[k]).strip().strip('"')
        except:
            pass

    # x-www-form-urlencoded
    if "application/x-www-form-urlencoded" in ctype:
        q = parse_qs(text)
        for k in candidates:
            if k in q and q[k]:
                return q[k][0].strip().strip('"')

    # multipart form (simple field-only parse)
    if "multipart/form-data" in ctype and "boundary=" in ctype:
        boundary = ctype.split("boundary=",1)[1]
        boundary_bytes = ("--" + boundary).encode("utf-8")
        parts = raw.split(boundary_bytes)
        for p in parts:
            if b"\r\n\r\n" not in p:
                continue
            hdr, val = p.split(b"\r\n\r\n",1)
            hdr = hdr.decode(errors="ignore").lower()
            val = val.strip().decode(errors="ignore")
            for k in candidates:
                if f'name="{k}"' in hdr:
                    return val.strip().strip('"')

    return ""

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, directory=str(WEB_ROOT), **kw):
        super().__init__(*a, directory=directory, **kw)

    def _json(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/ping":
            self._json(200); self.wfile.write(b'{"ok":true,"pong":true}'); return

        # SCAN (unchanged)
        if path in ("/api/scan","/api/gta/scan"):
            qs = parse_qs(parsed.query or "")
            gta3_dir = (qs.get("gta3_dir") or [""])[0].strip().strip('"')
            log("SCAN:", gta3_dir)
            audio_dir = pathlib.Path(gta3_dir)
            if not audio_dir.exists() or not audio_dir.is_dir():
                self._json(404); self.wfile.write(json.dumps({"ok":False,"error":"Directory not found"}).encode()); return
            out = scan_gta3(audio_dir)
            self._json(200); self.wfile.write(json.dumps(out, indent=2).encode()); return

        # NEW: IMPORT via GET with query ?gta3_dir=...
        if path in ("/api/import","/api/gta/import","/api/import-gta","/api/import-gta3-upload"):
            qs = parse_qs(parsed.query or "")
            gta3_dir = (qs.get("gta3_dir") or [""])[0].strip().strip('"')
            log("IMPORT[GET]:", path, gta3_dir)
            if not gta3_dir:
                self._json(400); self.wfile.write(b'{"ok":false,"error":"gta3_dir is required"}'); return
            audio_dir = pathlib.Path(gta3_dir)
            if not audio_dir.exists() or not audio_dir.is_dir():
                self._json(404); self.wfile.write(json.dumps({"ok":False,"error":"Directory not found"}).encode()); return
            out = import_gta3(audio_dir)
            self._json(200 if out.get("ok") else 500); self.wfile.write(json.dumps(out, indent=2).encode()); return

        # otherwise serve static
        return super().do_GET()

    def do_POST(self):
        
        if VERBOSE:
            print("\n------ POST REQUEST ------")
            print("PATH:", self.path)
            print("HEADERS:")
        for k,v in self.headers.items():
            print(" ", k+":", v)
            length = int(self.headers.get("Content-Length","0") or "0")
            raw_preview = self.rfile.peek(length)[:200] if length > 0 else b""
            print("RAW (first 200 bytes):", raw_preview)
            print("--------------------------\n")

        
        parsed = urlparse(self.path)
        path = parsed.path
        IMPORT_PATHS = {"/api/import","/api/gta/import","/api/import-gta","/api/import-gta3-upload"}

        if path in IMPORT_PATHS:
            length = int(self.headers.get("Content-Length","0") or "0")
            raw = self.rfile.read(length) if length>0 else b""

            # Try body (json/form/multipart) AND fall back to query string
            gta3_dir = extract_gta3_dir(self.path, self.headers, raw)
            if not gta3_dir:
                qs = parse_qs(parsed.query or "")
                gta3_dir = (qs.get("gta3_dir") or [""])[0].strip().strip('"')

            log("IMPORT[POST]:", path, gta3_dir)

            if not gta3_dir:
                self._json(400); self.wfile.write(b'{"ok":false,"error":"gta3_dir is required"}'); return

            audio_dir = pathlib.Path(gta3_dir)
            if not audio_dir.exists() or not audio_dir.is_dir():
                self._json(404); self.wfile.write(json.dumps({"ok":False,"error":"Directory not found"}).encode()); return

            out = import_gta3(audio_dir)
            self._json(200 if out.get("ok") else 500)
            self.wfile.write(json.dumps(out, indent=2).encode())
            return

        # unknown POST
        self._json(404); self.wfile.write(b'{"ok":false,"error":"Unknown endpoint"}')

def main():
    
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    ensure_dir(TARGET_DIR)
    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"\nServing: {WEB_ROOT}\nOpen:    http://localhost:{args.port}\n")
    server.serve_forever()
    
    VERBOSE = args.verbose

if __name__ == "__main__":
    sys.exit(main())
