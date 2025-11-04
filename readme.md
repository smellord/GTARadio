# GTA Radio Station Simulator

This project is a proof-of-concept web application that emulates the Grand Theft Auto III radio behaviour. Once you supply the original radio station audio from your copy of GTA III, the player keeps every station in sync with a shared broadcast clock, so swapping stations instantly resumes wherever the in-game schedule would be.

## Features

- **Guided setup:** GTA III is available today; later entries are marked "coming soon". The interface walks you through ripping, converting, and loading each station.
- **Automatic folder scan:** Drop the converted MP3s into `web/sounds/gta/3/` and the app loads them automatically at runtime.
- **Cross-platform importer:** Use the bundled Python/PowerShell/shell scripts to transcode Rockstar's IMA ADPCM assets to high-quality MP3 via `ffmpeg`.
- **Manual uploads welcome:** Prefer to drag-and-drop? Upload individual MP3 stations in the browser—filenames are validated so everything stays authentic.
- **Missing file indicators:** Stations that are still waiting for their MP3s are greyed out with explicit filenames so you always know what to provide next.
- **Real-time synchronisation:** The broadcast clock follows your real-world time-of-day. Switching stations or skipping forward/backward keeps every station aligned, just like the original engine.
- **Offset controls & persistence:** Adjust or reset the shared offset to correct drift, and pick up where you left off thanks to `localStorage`.

## Getting started

1. Serve the `web/` folder via any static HTTP server. Examples:
   ```bash
   # Python 3
   cd web
   python -m http.server 5173
   ```
2. Open the reported URL in a modern browser (the app relies on ES modules and the Web Audio API).
3. Choose **Grand Theft Auto III** on the home screen.
4. Follow the on-screen steps to prepare your audio.

### Preparing your audio

1. Rip each station (`HEAD.wav`, `CLASS.wav`, `FLASH.wav`, `KJAH.wav`, `LIPS.wav`, `RISE.wav`, `MSX.wav`, `CHAT.wav`, `GAME.wav`) from your own copy of GTA III.
2. Run the importer (`python tools/import_gta3_audio.py --gta3-dir <path>`) so the structure looks like this (only the MP3 files are used by the web player):

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

3. Start the web app and click **Scan GTA III folder**. The player will pull in any MP3 files it finds—there is no hash or MD5 verification, so as long as the filenames match, the audio is accepted. Any station that remains grey after the scan will list the exact filename it is waiting for, and you can upload the MP3 manually via the provided inputs.

### Import GTA III Audio (MP3)

The `tools/import_gta3_audio.py` helper looks for the original GTA III station WAVs, converts them to high-quality MP3 (44.1 kHz stereo, `-q:a 2`), and places them under `web/sounds/gta/3/` with the canonical uppercase filenames. The app loads those MP3s exclusively.

- Install [`ffmpeg`](https://ffmpeg.org/download.html) (or ensure `avconv` is available) so the script can transcode the audio. The executable must be discoverable on your `PATH`.
- Run the importer from the repository root with one of the following commands:

  ```bash
  # Windows PowerShell (explicit path)
  python tools/import_gta3_audio.py --gta3-dir "C:\\Games\\GTA3\\audio"

  # macOS / Linux (explicit path)
  python3 tools/import_gta3_audio.py --gta3-dir "/Applications/GTA3/audio"

  # POSIX shell wrapper (prompts for the path if omitted)
  ./tools/import_gta3_audio.sh

  # Windows wrapper (prompts for the path if omitted)
  powershell -ExecutionPolicy Bypass -File tools/import_gta3_audio.ps1
  ```

If you prefer to manage files manually, copy the MP3s into `web/sounds/gta/3/` yourself—just keep the filenames exactly as the game shipped.

### Station timing

The player computes the target playback position from the real time-of-day and the global offset. To match Rockstar's implementation:

- Midnight (00:00) aligns with the beginning of every station's programme.
- The displayed offset shows how much the internal broadcast clock deviates from real time.
- Skip buttons adjust the offset in ±30 second steps.

## Project structure

```
web/
  index.html        # Application shell
  styles.css        # Styling for the UI
  app.js            # Gameplay logic and playback synchronisation (MP3 playback only)
  sounds/
    README.md       # Drop-in folder instructions
    gta/
      3/            # Place GTA III MP3 files here
tools/
  import_gta3_audio.py   # Cross-platform importer (requires ffmpeg/avconv)
  import_gta3_audio.sh   # POSIX wrapper that prompts for the source path
  import_gta3_audio.ps1  # PowerShell wrapper that prompts for the source path
```


## Roadmap

- Add full station libraries and UI for Vice City, San Andreas, and Liberty City Stories.
- Surface cue-sheet support (track listings, DJ chatter markers).
- Integrate service worker caching and a more robust persistence layer.
- Wrap the web app in a native shell (Capacitor, Tauri, or React Native WebView) for distribution on mobile app stores.

## Legal notice

You must rip the audio assets from a copy of the game that you own. This project does not distribute copyrighted material and only performs local playback of files you provide.
