# Game audio drop-in folders

Place your legally ripped radio station audio here before building or deploying the web app.

```
web/
  sounds/
    gta/
      3/
        HEAD.mp3
        CLASS.mp3
        FLASH.mp3
        KJAH.mp3
        LIPS.mp3
        RISE.mp3
        MSX.mp3
        CHAT.mp3
        GAME.mp3
```

Use the in-app importer (requires running `python tools/serve.py`) or `python tools/import_gta3_audio.py --gta3-dir <path-to-game-audio>` to convert your ripped WAV files into high-quality MP3s in this directory automatically. The site scans `sounds/gta/3/` at runtime and only plays the MP3 assets. Keep the filenames exactly as they appear in the original game archives—any station still waiting on a file will appear grey in the UI with the missing filename listed for you.
