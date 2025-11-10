#!/usr/bin/env python3
"""Import GTA III radio audio into ``web/sounds/gta/3`` as MP3 files."""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import pathlib
import shutil
import subprocess
import sys
from typing import Dict, Iterable, List, Optional, Tuple

STATIONS = ["HEAD", "CLASS", "KJAH", "RISE", "LIPS", "GAME", "MSX", "FLASH", "CHAT"]

CACHE_FILE = "import-cache.json"

VALID_EXTENSIONS = (".mp3", ".MP3", ".wav", ".WAV")


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

    for ext in VALID_EXTENSIONS:
        direct = audio_dir / f"{stem_upper}{ext}"
        if direct.exists():
            return direct

    try:
        for candidate in audio_dir.iterdir():
            if not candidate.is_file():
                continue
            if candidate.suffix.lower() not in (".mp3", ".wav"):
                continue
            if candidate.stem.lower() == stem_lower:
                return candidate
    except OSError:
        return None

    return None


def ensure_dir(path: pathlib.Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def count_station_matches(directory: pathlib.Path) -> int:
    if not directory.exists() or not directory.is_dir():
        return 0
    count = 0
    for stem in STATIONS:
        for ext in VALID_EXTENSIONS:
            if (directory / f"{stem}{ext}").exists():
                count += 1
                break
    return count


def locate_audio_directory(root: pathlib.Path) -> Tuple[pathlib.Path, int]:
    """Find the GTA III audio directory starting from the provided root."""

    root = pathlib.Path(root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise AudioImportError(f"Directory not found: {root}")

    candidates: List[Tuple[int, pathlib.Path]] = []

    direct_matches = count_station_matches(root)
    if direct_matches:
        candidates.append((direct_matches, root))

    for name in ("audio", "Audio", "AUDIO", "AudioPC", "audiopc"):
        candidate = root / name
        matches = count_station_matches(candidate)
        if matches:
            candidates.append((matches, candidate))

    if not candidates:
        for path in root.rglob("*"):
            if not path.is_dir():
                continue
            matches = count_station_matches(path)
            if matches:
                candidates.append((matches, path))

    if not candidates:
        raise AudioImportError(
            "Unable to locate GTA III audio files under the provided directory. Select the game folder that contains the Audio assets."
        )

    candidates.sort(key=lambda item: item[0], reverse=True)
    best_matches, best_path = candidates[0]
    return best_path, best_matches


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
    game_root: pathlib.Path,
    *,
    target_dir: Optional[pathlib.Path] = None,
    preferred_tool: Optional[str] = None,
) -> Dict[str, object]:
    game_root = pathlib.Path(game_root).expanduser()
    audio_dir, audio_matches = locate_audio_directory(game_root)

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
        "source_root": str(game_root.resolve()),
        "audio_dir": str(audio_dir),
        "audio_matches": audio_matches,
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
            try:
                if src.resolve() == dst.resolve():
                    record["status"] = "copied"
                else:
                    shutil.copy2(src, dst)
                    record["status"] = "copied"
                summary["copied"] += 1
            except shutil.SameFileError:
                record["status"] = "copied"
                summary["copied"] += 1
            except OSError as exc:
                record["status"] = "failed"
                record["error"] = str(exc)
                summary["failures"].append(stem)
                try:
                    if dst.exists():
                        dst.unlink()
                except OSError:
                    pass
        else:
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
                try:
                    if dst.exists():
                        dst.unlink()
                except OSError:
                    pass
        summary["details"].append(record)

    write_import_cache(target_dir, summary)
    return summary


def write_import_cache(target_dir: pathlib.Path, summary: Dict[str, object]) -> None:
    payload = {
        "generated_at": _dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "source_root": summary.get("source_root"),
        "audio_dir": summary.get("audio_dir"),
        "tool": summary.get("tool"),
        "expected": summary.get("expected"),
        "found": summary.get("found"),
        "copied": summary.get("copied"),
        "converted": summary.get("converted"),
        "missing": summary.get("missing"),
        "failures": summary.get("failures"),
        "details": summary.get("details"),
    }

    cache_path = pathlib.Path(target_dir) / CACHE_FILE
    ensure_dir(cache_path.parent)
    try:
        cache_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError as exc:
        summary["cache_error"] = str(exc)
    else:
        summary["cache_file"] = str(cache_path)


def format_summary(summary: Dict[str, object]) -> str:
    lines = [
        f"Expected:   {summary['expected']}",
        f"Found:      {summary['found']}",
        f"Copied:     {summary['copied']}",
        f"Transcoded: {summary['converted']}",
        f"Target dir: {summary['target']}",
        f"Tool:       {summary['tool']}",
        f"Source dir: {summary.get('source_root', 'unknown')}",
        f"Audio dir:  {summary.get('audio_dir', 'unknown')}",
        f"Audio hits: {summary.get('audio_matches', 0)}",
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
        help="Path to the GTA III game directory (contains the Audio folder)",
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

    gta_dir = args.gta3_dir or input("Enter path to the GTA III game directory: ").strip().strip('"')

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
