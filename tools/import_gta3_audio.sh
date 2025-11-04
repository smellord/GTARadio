#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "${1-}" ]; then
  GTA3_DIR="$1"
else
  read -r -p "Enter path to the GTA III game directory: " GTA3_DIR
fi
python3 "$SCRIPT_DIR/import_gta3_audio.py" --gta3-dir "$GTA3_DIR"
