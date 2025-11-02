# Game audio drop-in folders

Place your legally ripped radio station audio here before building or deploying the web app.

```
web/
  sounds/
    gta/
      3/
        HEAD.wav
        CLASS.wav
        FLASH.wav
        KJAH.wav
        LIPS.wav
        RISE.wav
        MSX.wav
        CHAT.wav
        GAME.wav
```

The site automatically scans `sounds/gta/3/` at runtime and loads any files it finds. Keep the filenames exactly as they appear in the original game archives.
