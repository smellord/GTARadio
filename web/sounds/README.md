# Game audio drop-in folders

Place your legally ripped radio station audio here before building or deploying the web app.

```
web/
  sounds/
    gta/
      3/
        HEAD.mp3  (preferred) / HEAD.wav
        CLASS.mp3 (preferred) / CLASS.wav
        FLASH.mp3 (preferred) / FLASH.wav
        KJAH.mp3  (preferred) / KJAH.wav
        LIPS.mp3  (preferred) / LIPS.wav
        RISE.mp3  (preferred) / RISE.wav
        MSX.mp3   (preferred) / MSX.wav
        CHAT.mp3  (preferred) / CHAT.wav
        GAME.mp3  (preferred) / GAME.wav
```

Use `python tools/import_gta3_audio.py --gta3-dir <path-to-game-audio>` (or the provided shell / PowerShell wrappers) to convert your ripped WAV files into high-quality MP3s in this directory automatically. The site automatically scans `sounds/gta/3/` at runtime and prefers MP3 assets, falling back to the original WAV files when necessary. Keep the filenames exactly as they appear in the original game archives—any station still waiting on a file will appear grey in the UI with the missing filename listed for you.
