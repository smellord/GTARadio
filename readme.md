# GTA Radio Station Simulator

This project is a proof-of-concept web application that emulates the Grand Theft Auto III radio behaviour. Once you upload the original radio station audio from your copy of GTA III, the player keeps every station in sync with a shared broadcast clock, so swapping stations instantly resumes wherever the in-game schedule would be.

## Features

- **Game picker:** GTA III is available today; later entries are marked "coming soon" to match the planned roadmap.
- **Station validation:** Each upload checks the filename and MD5 hash against a manifest so that only untouched assets are accepted.
- **Real-time synchronisation:** The broadcast clock follows your real-world time-of-day. Switching stations or skipping forward/backward keeps every station aligned, just like the original engine.
- **Offset controls:** Adjust or reset the shared offset to correct drift or jump ahead/back.
- **Persistence:** The selected game, manifest, and offset are cached in `localStorage`, allowing you to continue where you left off.

## Getting started

1. Serve the `web/` folder via any static HTTP server. Examples:
   ```bash
   # Python 3
   cd web
   python -m http.server 5173
   ```
2. Open the reported URL in a modern browser (the app relies on ES modules and the Web Audio API).
3. Choose **Grand Theft Auto III** on the home screen.
4. Upload the nine radio WAV files exactly as exported by the game (e.g. `HEAD.wav`, `RISE.wav`).
5. Provide an MD5 manifest so the player can verify your files.

### MD5 manifest

The application ships with placeholder MD5 values. Create a JSON file with the following structure and click **Load MD5 manifest** to import it:

```json
{
  "id": "gta3",
  "version": 1,
  "stations": {
    "HEAD": { "fileName": "HEAD.wav", "expectedMd5": "<md5 hash>" },
    "DOUBLE_CLEF": { "fileName": "CLASS.wav", "expectedMd5": "<md5 hash>" }
    // ... remaining stations ...
  }
}
```

You can generate the MD5 hashes with your favourite hashing tool or reuse the checksums distributed with the [openrw](https://github.com/rwengine/openrw) project.

### Station timing

The player computes the target playback position from the real time-of-day and the global offset. To match Rockstar's implementation:

- Midnight (00:00) aligns with the beginning of every station's programme.
- The displayed offset shows how much the internal broadcast clock deviates from real time.
- Skip buttons adjust the offset in ±30 second steps.

## Project structure

```
web/
  index.html    # Application shell
  styles.css    # Styling for the UI
  md5.js        # Dependency-free MD5 implementation used for file validation
  app.js        # Gameplay logic, manifest handling, and playback synchronisation
.github/workflows/
  deploy.yml    # GitHub Pages workflow for one-click deployments
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

- Add manifests and UI for Vice City, San Andreas, and Liberty City Stories.
- Surface cue-sheet support (track listings, DJ chatter markers).
- Integrate service worker caching and a more robust persistence layer.
- Wrap the web app in a native shell (Capacitor, Tauri, or React Native WebView) for distribution on mobile app stores.

## Legal notice

You must rip the audio assets from a copy of the game that you own. This project does not distribute copyrighted material and only performs local playback of files you provide.
