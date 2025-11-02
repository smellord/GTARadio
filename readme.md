# GTA Radio Station Simulator

This project is a proof-of-concept web application that emulates the Grand Theft Auto III radio behaviour. Once you supply the original radio station audio from your copy of GTA III, the player keeps every station in sync with a shared broadcast clock, so swapping stations instantly resumes wherever the in-game schedule would be.

## Features

- **Guided setup:** GTA III is available today; later entries are marked "coming soon". The interface walks you through ripping, organising, and loading each station.
- **Automatic folder scan:** Drop the WAV files into `web/sounds/gta/3/` and the app loads them automatically at runtime.
- **Manual uploads welcome:** If you prefer, upload individual stations in the browser—filenames are validated so everything stays authentic.
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

3. Start the web app and click **Scan GTA III folder**. The player will pick up any files it finds. If a station is still missing you can upload it manually via the provided inputs.

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
  sounds/
    README.md       # Drop-in folder instructions
    gta/
      3/            # Place your GTA III WAV files here
.github/workflows/
  deploy.yml        # GitHub Pages workflow for one-click deployments
```

## Deploying to GitHub Pages

Once you push this repository to your own GitHub account you can enable automated deployments to GitHub Pages using the included workflow:

1. Make sure your default branch is named `main` (rename it locally and push if necessary).
2. Push the entire repository to GitHub:
   ```bash
   git remote add origin git@github.com:<your-user>/gta-radio-simulator.git
   git push -u origin main
   ```
3. In your GitHub repository, navigate to **Settings → Pages**.
4. In the **Build and deployment** section, choose **GitHub Actions** as the source.
5. Save the settings. The next push to `main` (or a manual **Run workflow** from the **Actions** tab) will build the `web/` directory and publish it to GitHub Pages.
6. Once the deployment completes, the workflow summary links directly to the live URL so you can test the simulator instantly.

If you prefer manual uploads instead of Pages, you can also copy the contents of `web/` into any static host (Netlify, Vercel, itch.io, etc.).

## Roadmap

- Add full station libraries and UI for Vice City, San Andreas, and Liberty City Stories.
- Surface cue-sheet support (track listings, DJ chatter markers).
- Integrate service worker caching and a more robust persistence layer.
- Wrap the web app in a native shell (Capacitor, Tauri, or React Native WebView) for distribution on mobile app stores.

## Legal notice

You must rip the audio assets from a copy of the game that you own. This project does not distribute copyrighted material and only performs local playback of files you provide.
