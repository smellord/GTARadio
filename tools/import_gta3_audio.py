#!/usr/bin/env python3
"""Import GTA III radio audio into ``web/sounds/gta/3`` as MP3 files."""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
from typing import Dict, Iterable, List, Optional, Tuple

STATIONS = ["HEAD", "CLASS", "KJAH", "RISE", "LIPS", "GAME", "MSX", "FLASH", "CHAT"]


class AudioImportError(RuntimeError):
    """Raised when the audio import fails in a recoverable way."""


def which_prog(candidates: Iterable[str]) -> Optional[str]:
    for name in candidates:
        path = shutil.which(name)
        if path:
            return path
    return None


def find_src(audio_dir: pathlib.Path, stem_upper: str) -> Optional[pathlib.Path]:
    stem_lower = stem_upper.lower()
    for ext in (".mp3", ".wav"):
        direct = audio_dir / f"{stem_upper}{ext}"
        if direct.exists():
            return direct
    for ext in (".mp3", ".wav"):
        for candidate in audio_dir.glob(f"*{ext}"):
            if candidate.stem.lower() == stem_lower:
                return candidate
    return None


def ensure_dir(path: pathlib.Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def transcode_to_mp3(tool: str, src: pathlib.Path, dst: pathlib.Path) -> Tuple[int, List[str]]:
    cmd = [
        tool,
        "-y",
        "-i",
        str(src),
        "-ar",
        "44100",
        "-ac",
        "2",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "2",
        str(dst),
    ]
    try:
        completed = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        return 127, []
    logs: List[str] = []
    if completed.stdout:
        logs.append(completed.stdout.strip())
    if completed.stderr:
        logs.append(completed.stderr.strip())
    return completed.returncode, logs


def resolve_tool(preferred: Optional[str] = None) -> Optional[str]:
    if preferred:
        resolved = shutil.which(preferred)
        if resolved:
            return resolved
    return which_prog(["ffmpeg", "ffmpeg.exe"]) or which_prog(["avconv"])


def import_gta3_audio(
    audio_dir: pathlib.Path,
    *,
    target_dir: Optional[pathlib.Path] = None,
    preferred_tool: Optional[str] = None,
) -> Dict[str, object]:
    audio_dir = pathlib.Path(audio_dir).expanduser()
    if not audio_dir.exists() or not audio_dir.is_dir():
        raise AudioImportError(f"Audio directory not found: {audio_dir}")

    repo_root = pathlib.Path(__file__).resolve().parents[1]
    target_dir = target_dir or repo_root / "web" / "sounds" / "gta" / "3"
    ensure_dir(target_dir)

    tool = resolve_tool(preferred_tool)
    if not tool:
        raise AudioImportError(
            "ffmpeg (or avconv) not found on PATH. Install ffmpeg: https://ffmpeg.org/download.html"
        )

    summary: Dict[str, object] = {
        "expected": len(STATIONS),
        "found": 0,
        "copied": 0,
        "converted": 0,
        "missing": [],
        "failures": [],
        "details": [],
        "target": str(target_dir),
        "tool": tool,
    }

    for stem in STATIONS:
        src = find_src(audio_dir, stem)
        record: Dict[str, object] = {
            "stem": stem,
            "status": "missing",
        }
        if not src:
            summary["missing"].append(stem)
            summary["details"].append(record)
            continue

        summary["found"] += 1
        dst = target_dir / f"{stem}.mp3"
        record["source"] = str(src)
        record["destination"] = str(dst)

        if src.suffix.lower() == ".mp3":
            shutil.copy2(src, dst)
            record["status"] = "copied"
            summary["copied"] += 1
            summary["details"].append(record)
            continue

        code, logs = transcode_to_mp3(tool, src, dst)
        if code == 0:
            record["status"] = "converted"
            summary["converted"] += 1
        else:
            record["status"] = "failed"
            record["exit_code"] = code
            if logs:
                record["logs"] = logs
            summary["failures"].append(stem)
        summary["details"].append(record)

    return summary


def format_summary(summary: Dict[str, object]) -> str:
    lines = [
        f"Expected:   {summary['expected']}",
        f"Found:      {summary['found']}",
        f"Copied:     {summary['copied']}",
        f"Transcoded: {summary['converted']}",
        f"Target dir: {summary['target']}",
        f"Tool:       {summary['tool']}",
    ]
    missing = summary.get("missing") or []
    failures = summary.get("failures") or []
    if missing:
        lines.append(f"Missing:   {', '.join(missing)}")
    if failures:
        lines.append(f"Failures:  {', '.join(failures)}")
    return "\n".join(lines)


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import GTA III radio audio into web/sounds/gta/3 as MP3 files."
    )
    parser.add_argument(
        "--gta3-dir",
        help="Path to the GTA III audio directory (contains HEAD.wav, etc.)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the summary as JSON (useful for automation).",
    )
    parser.add_argument(
        "--tool",
        help="Explicit ffmpeg/avconv binary to use.",
    )
    args = parser.parse_args(argv)

    gta_dir = args.gta3_dir or input("Enter path to GTA III audio directory: ").strip().strip('"')

    try:
        summary = import_gta3_audio(gta_dir, preferred_tool=args.tool)
    except AudioImportError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(format_summary(summary))

    return 0 if summary.get("found", 0) else 1


if __name__ == "__main__":
    sys.exit(main())
