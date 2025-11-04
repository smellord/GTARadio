#!/usr/bin/env python3
"""Import GTA III radio audio into web/sounds/gta/3 as MP3."""

import argparse
import pathlib
import shutil
import subprocess
import sys
from typing import Iterable, List, Optional

STATIONS = ["HEAD", "CLASS", "KJAH", "RISE", "LIPS", "GAME", "MSX", "FLASH", "CHAT"]


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


def transcode_to_mp3(tool: str, src: pathlib.Path, dst: pathlib.Path) -> int:
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
        return subprocess.call(cmd)
    except FileNotFoundError:
        return 127


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import GTA III radio audio into web/sounds/gta/3 as MP3 files."
    )
    parser.add_argument(
        "--gta3-dir",
        help="Path to the GTA III audio directory (contains HEAD.wav, etc.)",
    )
    args = parser.parse_args(argv)

    gta_dir = args.gta3_dir or input("Enter path to GTA III audio directory: ").strip().strip('"')
    audio_dir = pathlib.Path(gta_dir).expanduser()
    if not audio_dir.exists() or not audio_dir.is_dir():
        print(f"Error: directory not found: {audio_dir}", file=sys.stderr)
        return 2

    repo_root = pathlib.Path(__file__).resolve().parents[1]
    target_dir = repo_root / "web" / "sounds" / "gta" / "3"
    ensure_dir(target_dir)

    tool = which_prog(["ffmpeg", "ffmpeg.exe"]) or which_prog(["avconv"])
    if not tool:
        print(
            "Error: ffmpeg (or avconv) not found on PATH.\n"
            "Install ffmpeg: https://ffmpeg.org/download.html",
            file=sys.stderr,
        )
        return 3

    found = 0
    copied = 0
    converted = 0
    missing: List[str] = []

    print(f"Source: {audio_dir}")
    print(f"Target: {target_dir}\n")

    for stem in STATIONS:
        src = find_src(audio_dir, stem)
        dst = target_dir / f"{stem}.mp3"
        if not src:
            print(f"[MISS] {stem}: not found")
            missing.append(stem)
            continue
        found += 1
        if src.suffix.lower() == ".mp3":
            shutil.copy2(src, dst)
            print(f"[COPY] {stem}: {src.name} -> {dst.name}")
            copied += 1
            continue
        result = transcode_to_mp3(tool, src, dst)
        if result == 0:
            print(f"[ENC ] {stem}: {src.name} -> {dst.name}")
            converted += 1
        else:
            print(f"[FAIL] {stem}: ffmpeg exited with {result}", file=sys.stderr)

    print("\nSummary")
    print(f"  Expected:   {len(STATIONS)}")
    print(f"  Found:      {found}")
    print(f"  Copied:     {copied}")
    print(f"  Transcoded: {converted}")
    if missing:
        print(f"  Missing:    {', '.join(missing)}")
    print(f"  Output dir: {target_dir}")

    return 0 if found else 1


if __name__ == "__main__":
    sys.exit(main())
