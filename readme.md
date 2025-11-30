# GTA Radio Station Simulator

This project is a proof-of-concept web application that emulates the Grand Theft Auto III radio behaviour. Once you supply the original radio station audio from your copy of GTA III, the player keeps every station in sync with a shared broadcast clock, so swapping stations instantly resumes wherever the in-game schedule would be.

## Features

- **Guided setup:** GTA III is available today; later entries are marked "coming soon". The interface walks you through ripping, converting, and loading each station.
- **One-click importer:** Launch the included Python dev server, click **Browse…**, and point at your GTA III installation folder—the backend locates the Audio assets and copies/converts everything to MP3 automatically with live progress updates.
- **Cross-platform scripts:** Prefer the command line? Use the bundled Python/PowerShell/shell utilities to transcode Rockstar's IMA ADPCM assets to high-quality MP3 via `ffmpeg`.
- **Missing file indicators:** Stations that are still waiting for their MP3s are greyed out with explicit filenames so you always know what to provide next.
- **Real-time synchronisation:** The broadcast clock follows your real-world time-of-day. Switching stations or skipping forward/backward keeps every station aligned, just like the original engine.
- **Offset controls & persistence:** Adjust or reset the shared offset to correct drift, and pick up where you left off thanks to `localStorage`.

## Getting started

1. From the repository root, start the bundled dev server so the importer endpoint is available (it opens your browser to the web app automatically):
   ```bash
   python tools/serve.py --port 4173
   ```
   (Use `--bind 127.0.0.1` if you only want to expose localhost.)
   > **Note:** The importer endpoints are only available through `tools/serve.py`. A plain `python -m http.server` instance cannot run the conversion workflow.
2. If the browser does not open automatically, point it to `http://127.0.0.1:4173/`.
3. Choose **Grand Theft Auto III** on the home screen.
4. Follow the on-screen steps—click **Browse…** in the importer, select your GTA III installation directory (the game root), then import. You can also paste the full game path into the input field if the native picker is unavailable.

### Preparing your audio

1. Rip each station (`HEAD.wav`, `CLASS.wav`, `FLASH.wav`, `KJAH.wav`, `LIPS.wav`, `RISE.wav`, `MSX.wav`, `CHAT.wav`, `GAME.wav`) from your own copy of GTA III.
2. With `tools/serve.py` running, click **Browse…** in the importer, select the GTA III installation directory (the folder that contains the `Audio` subdirectory), and submit. The backend locates the WAV files automatically, then copies or converts each station into `web/sounds/gta/3/` as MP3 while the UI shows station-by-station progress.
   > The Browse button opens a native folder picker via Tk. If you're running headless (e.g., SSH without a desktop), use the CLI importer instead.

   After a successful import, the directory structure will look like:

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

3. Click **Refresh station library** in the UI. The player pulls in every MP3 with the canonical filenames—no hashes involved. Grey stations list the files that are still missing, and turn green one-by-one during import as soon as each MP3 becomes readable.

### Import GTA III Audio (MP3)

The recommended workflow is to run `python tools/serve.py`, open the app, and use the importer to select your GTA III installation directory. The backend locates Rockstar's IMA ADPCM WAVs inside the `Audio` subfolder, converts them to high-quality MP3 (44.1 kHz stereo, `-q:a 2`), and stores them inside `web/sounds/gta/3/` with the canonical uppercase filenames. The browser then plays only those MP3 files. Every successful import also writes `web/sounds/gta/3/import-cache.json`, and the UI surfaces that summary for quick confirmation. If the GUI picker fails, you can paste your path and the importer will make the same `GET /api/import-gta3-start?gta3_dir=<path>` request the server accepts from the address bar.

Need automation or CI integration? The same logic is exposed via `tools/import_gta3_audio.py`:

- Install [`ffmpeg`](https://ffmpeg.org/download.html) (or ensure `avconv` is available) so the script can transcode the audio. The executable must be discoverable on your `PATH`.
- Run the importer from the repository root with one of the following commands:

  ```bash
  # Windows PowerShell (explicit path)
  python tools/import_gta3_audio.py --gta3-dir "C:\\Games\\GTA3"

  # macOS / Linux (explicit path)
  python3 tools/import_gta3_audio.py --gta3-dir "/Applications/GTA3"

  # POSIX shell wrapper (prompts for the path if omitted)
  ./tools/import_gta3_audio.sh  # prompts for the root if omitted

  # Windows wrapper (prompts for the path if omitted)
  powershell -ExecutionPolicy Bypass -File tools/import_gta3_audio.ps1  # prompts for the root if omitted
  ```

  Add `--json` if you need structured output, or `--tool <path-to-ffmpeg>` to force a specific binary.

If you want to manage files manually, copy the MP3s into `web/sounds/gta/3/` yourself—just keep the filenames exactly as the game shipped.

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
  serve.py               # Dev server with import APIs (/api/import-gta3-start, /api/import-gta3-status, /api/import-gta3-browse)
```


## Roadmap

- Add full station libraries and UI for Vice City, San Andreas, and Liberty City Stories.
- Surface cue-sheet support (track listings, DJ chatter markers).
- Integrate service worker caching and a more robust persistence layer.
- Wrap the web app in a native shell (Capacitor, Tauri, or React Native WebView) for distribution on mobile app stores.

## Legal notice

You must rip the audio assets from a copy of the game that you own. This project does not distribute copyrighted material and only performs local playback of files you provide.
