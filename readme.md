# GTA Radio Station Simulator

This project is a proof-of-concept web application that emulates the Grand Theft Auto III radio behaviour. Once you supply the original radio station audio from your copy of GTA III, the player keeps every station in sync with a shared broadcast clock, so swapping stations instantly resumes wherever the in-game schedule would be.

## Features

- **Guided setup:** GTA III is available today; later entries are marked "coming soon". The interface walks you through ripping, organising, and loading each station.
- **Automatic folder scan:** Drop the WAV files into `web/sounds/gta/3/` and the app loads them automatically at runtime.
- **GTA III ADPCM support:** The original 32 kHz stereo IMA ADPCM assets are decoded in-browser so you can use the untouched game files.
- **Manual uploads welcome:** If you prefer, upload individual stations in the browser—filenames are validated so everything stays authentic.
- **Missing file indicators:** Stations that are still waiting for their WAVs are greyed out with explicit filenames so you always know what to provide next.
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
2. Create the folder structure below and copy the files into it without renaming them:

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

3. Start the web app and click **Scan GTA III folder**. The player will pull in any files it finds—there is no hash or MD5 verification, so as long as the filenames match, the audio is accepted. Any station that remains grey after the scan will list the exact filename it is waiting for, and you can upload it manually via the provided inputs.

> **Why the decode step matters:** GTA III ships its radio stations as 32 kHz stereo IMA ADPCM WAVs (format tag `0x0011`). Browsers cannot stream those files directly, so the simulator converts them to uncompressed PCM on the fly before playback. This only applies to the GTA III profile; future games may use different codecs and will ship with their own decoders.

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
  app.js            # Gameplay logic and playback synchronisation
  audio-decoder.js  # WAV parser + GTA III IMA ADPCM to PCM converter
  sounds/
    README.md       # Drop-in folder instructions
    gta/
      3/            # Place your GTA III WAV files here
```


## Roadmap

- Add full station libraries and UI for Vice City, San Andreas, and Liberty City Stories.
- Surface cue-sheet support (track listings, DJ chatter markers).
- Integrate service worker caching and a more robust persistence layer.
- Wrap the web app in a native shell (Capacitor, Tauri, or React Native WebView) for distribution on mobile app stores.

## Legal notice

You must rip the audio assets from a copy of the game that you own. This project does not distribute copyrighted material and only performs local playback of files you provide.
