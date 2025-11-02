const STORAGE_KEYS = {
  OFFSET: "gta-radio-time-offset",
  LAST_GAME: "gta-radio-last-game",
import { md5FromArrayBuffer } from "./md5.js";

const STORAGE_KEYS = {
  OFFSET: "gta-radio-time-offset",
  LAST_GAME: "gta-radio-last-game",
  MANIFEST: "gta-radio-manifest",
};

const GTA3_STATIONS = [
  { id: "HEAD", name: "Head Radio", fileName: "HEAD.wav" },
  { id: "DOUBLE_CLEF", name: "Double Clef FM", fileName: "CLASS.wav" },
  { id: "FLASH", name: "Flashback 95.6", fileName: "FLASH.wav" },
  { id: "JAH", name: "K-JAH Radio", fileName: "KJAH.wav" },
  { id: "LIPS", name: "Lips 106", fileName: "LIPS.wav" },
  { id: "RISE", name: "Rise FM", fileName: "RISE.wav" },
  { id: "MSX", name: "MSX FM", fileName: "MSX.wav" },
  { id: "CHATTERBOX", name: "Chatterbox FM", fileName: "CHAT.wav" },
  { id: "GAME", name: "Game Radio", fileName: "GAME.wav" },
];

const GAME_LIBRARY_FOLDERS = {
  gta3: "sounds/gta/3",
const DEFAULT_MANIFEST = {
  id: "gta3",
  version: 1,
  stations: GTA3_STATIONS.reduce((acc, station) => {
    acc[station.id] = {
      fileName: station.fileName,
      // Replace the placeholder string with the real MD5 hash from your legally ripped copy.
      expectedMd5: "REPLACE_WITH_REAL_MD5",
    };
    return acc;
  }, {}),
};

const GAMES = [
  {
    id: "gta3",
    name: "Grand Theft Auto III",
    status: "available",
    description:
      "Sync your GTA III radio stations with the original broadcast clock. Follow the guided setup below.",
    description: "Upload the nine original radio station WAV files ripped from your copy of GTA III.",
    stations: GTA3_STATIONS,
  },
  { id: "vc", name: "Grand Theft Auto: Vice City", status: "soon" },
  { id: "sa", name: "Grand Theft Auto: San Andreas", status: "soon" },
  { id: "lcs", name: "Liberty City Stories", status: "soon" },
];

const state = {
  selectedGame: null,
  stations: new Map(),
  currentStationId: null,
  offsetSeconds: Number(localStorage.getItem(STORAGE_KEYS.OFFSET)) || 0,
  tickHandle: null,
};

const els = {
  gameSelection: document.getElementById("game-selection"),
  stationManager: document.getElementById("station-manager"),
  player: document.getElementById("player"),
};

function formatClock(seconds) {
  const sign = seconds < 0 ? "-" : "";
  const absSeconds = Math.abs(seconds);
  const h = Math.floor(absSeconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((absSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(absSeconds % 60).toString().padStart(2, "0");
  return `${sign}${h}:${m}:${s}`;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function nowSeconds() {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

function saveOffset() {
  localStorage.setItem(STORAGE_KEYS.OFFSET, String(state.offsetSeconds));
}

function renderGameSelection() {
  const lastGame = localStorage.getItem(STORAGE_KEYS.LAST_GAME);
  const container = document.createElement("div");
  container.innerHTML = `
    <h2>Select your game</h2>
    <p class="info-text">
      Pick the title you want to simulate. Each game needs its original radio audio ripped from your own copy.
    </p>
  `;

  const grid = document.createElement("div");
  grid.className = "game-grid";

  for (const game of GAMES) {
    const card = document.createElement("article");
    card.className = "game-card";
    card.innerHTML = `
      <h3>${game.name}</h3>
      ${game.description ? `<p>${game.description}</p>` : ""}
      ${game.status === "soon" ? `<span class="badge">Coming soon</span>` : ""}
    `;
    const button = document.createElement("button");
    button.textContent = game.status === "available" ? "Open setup" : "Unavailable";
    button.disabled = game.status !== "available";
    button.addEventListener("click", () => selectGame(game.id));
    if (game.id === lastGame && game.status === "available") {
      button.textContent = "Resume";
    }
    card.appendChild(button);
    grid.appendChild(card);
  }

  container.appendChild(grid);
  els.gameSelection.replaceChildren(container);
}

function selectGame(gameId) {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game || game.status !== "available") return;
  state.selectedGame = game;
  state.manifest = loadStoredManifest();
  localStorage.setItem(STORAGE_KEYS.LAST_GAME, game.id);
  renderStationManager();
  els.stationManager.hidden = false;
  renderPlayer();
  els.player.hidden = false;
}

function getLibraryFolder(gameId) {
  return GAME_LIBRARY_FOLDERS[gameId] || "";
}

function renderStationManager() {
  if (!state.selectedGame) return;

  const folderPath = getLibraryFolder(state.selectedGame.id);
  const folderDisplay = folderPath ? `${folderPath}/` : "the expected folder";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <h2>${state.selectedGame.name} station setup</h2>
    <p class="info-text">
      Follow these steps to mirror the way GTA III keeps every station in sync with a shared broadcast clock.
    </p>
    <ol class="instruction-list">
      <li>Rip each radio station from your own copy of the game as an unmodified <code>.wav</code> file.</li>
      <li>Create the folder <code>${folderDisplay}</code> inside the project and copy the files there without renaming them.</li>
      <li>Press <strong>Scan GTA III folder</strong> to pull them in automatically, or upload individual files below.</li>
    </ol>
    <p class="info-text">
      The filenames must stay exactly as the game shipped (HEAD.wav, CLASS.wav, RISE.wav, etc.). If a station is missing, the status message will point you to the fix.
    </p>
    <div class="controls">
      <button id="scan-library">Scan GTA III folder</button>
      <button id="reset-offset">Reset broadcast clock</button>
      <span class="station-status" data-state="waiting" id="offset-readout">Offset: ${formatClock(
        state.offsetSeconds
      )}</span>
    </div>
  `;

  const scanButton = wrapper.querySelector("#scan-library");
  scanButton?.addEventListener("click", () => scanLocalLibrary(folderPath));

  const resetButton = wrapper.querySelector("#reset-offset");
  resetButton?.addEventListener("click", () => {
function renderStationManager() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <h2>${state.selectedGame.name} stations</h2>
    <p class="info-text">
      Provide the original WAV files exactly as exported by the game. Each upload is validated against
      an MD5 manifest to ensure it matches the untouched asset.
    </p>
    <div class="controls">
      <button id="load-manifest">Load MD5 manifest</button>
      <button id="reset-offset">Reset broadcast clock</button>
      <span class="station-status" data-state="waiting" id="offset-readout">Offset: ${formatClock(state.offsetSeconds)}</span>
    </div>
  `;

  const manifestButton = wrapper.querySelector("#load-manifest");
  manifestButton.addEventListener("click", promptManifestUpload);

  const resetButton = wrapper.querySelector("#reset-offset");
  resetButton.addEventListener("click", () => {
    state.offsetSeconds = 0;
    saveOffset();
    updateOffsetReadout();
    if (state.currentStationId) {
      syncActiveStation();
    }
  });

  const list = document.createElement("div");
  list.className = "station-list";

  for (const station of state.selectedGame.stations) {
    const item = document.createElement("div");
    item.className = "station-item";
    item.dataset.stationId = station.id;

    const info = document.createElement("div");
    info.innerHTML = `
      <strong>${station.name}</strong>
      <div class="station-status" data-state="waiting">Place <code>${station.fileName}</code> in <code>${folderDisplay}</code> or upload it below.</div>
      <div class="station-status" data-state="waiting">Awaiting upload</div>
    `;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".wav,.WAV";
    fileInput.addEventListener("change", (event) => onFileSelected(station, event));

    item.appendChild(info);
    item.appendChild(fileInput);
    list.appendChild(item);
  }

  wrapper.appendChild(list);

  const warning = document.createElement("div");
  warning.className = "warning";
  warning.innerHTML = `
    <strong>Reminder:</strong> Only use audio you legally ripped from a copy of the game you own. This simulator never uploads your files.
    For reference on timing, inspect the open-source <code>openrw</code> project, which recreates the same radio logic.
    <strong>Important:</strong> This tool only works with audio you ripped yourself. Do not distribute copyrighted material.
    For authentic timing information, compare against <code>openrw</code>'s radio implementation.
  `;

  wrapper.appendChild(warning);

  els.stationManager.replaceChildren(wrapper);
  scanLocalLibrary(folderPath);
}

async function scanLocalLibrary(folderPath) {
  if (!state.selectedGame) return;

  const folderDisplay = folderPath ? `${folderPath}/` : "the expected folder";

  for (const station of state.selectedGame.stations) {
    updateStationStatus(station.id, "pending", `Looking for ${station.fileName} in ${folderDisplay}...`);
    try {
      await loadStationFromLibrary(station, folderPath);
    } catch (error) {
      const fallback = describeRecord(station.id);
      if (fallback) {
        updateStationStatus(station.id, "valid", fallback);
      } else {
        const guidance = folderPath
          ? `Copy ${station.fileName} into ${folderDisplay} or upload it manually.`
          : `Upload ${station.fileName} manually using the button below.`;
        updateStationStatus(station.id, "error", `File not found. ${guidance}`);
      }
    }
  }

  updateStationSelector();
  updatePlayerControls();
}

async function loadStationFromLibrary(station, folderPath) {
  const basePath = `${folderPath}/${station.fileName}`;
  const src = `${basePath}?v=${Date.now()}`;
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "metadata";
  const metadataPromise = waitForMetadata(audio);
  audio.src = src;
  audio.load();
  await metadataPromise;

  const { wasCurrent, wasPlaying } = setStationRecord(station.id, {
    audio,
    duration: audio.duration,
    source: "library",
    origin: basePath,
  });

  updateStationStatus(station.id, "valid", describeRecord(station.id));

  if (!state.currentStationId) {
    selectStation(station.id);
  } else if (wasCurrent) {
    syncActiveStation(wasPlaying);
    updatePlayerControls();
  } else {
    updateStationSelector();
    updatePlayerControls();
  }
}

function describeRecord(stationId) {
  const record = state.stations.get(stationId);
  if (!record) return "";
  const duration = isFinite(record.duration) ? formatDuration(record.duration) : "unknown length";
  if (record.source === "library") {
    return `Loaded from ${record.origin} • ${duration}`;
  }
  if (record.source === "upload") {
    return `Using uploaded file (${record.origin}) • ${duration}`;
  }
  return `Ready • ${duration}`;
}

function setStationRecord(stationId, record) {
  const previous = state.stations.get(stationId);
  const wasCurrent = state.currentStationId === stationId;
  const wasPlaying = wasCurrent && previous ? !previous.audio.paused : false;

  if (previous?.audio) {
    previous.audio.pause();
  }
  if (previous?.objectUrl && previous.objectUrl !== record.objectUrl) {
    URL.revokeObjectURL(previous.objectUrl);
  }

  state.stations.set(stationId, record);
  return { wasCurrent, wasPlaying };
  updateOffsetReadout();
}

function promptManifestUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.id !== "gta3" || !data?.stations) {
        alert("Invalid manifest. Expected an object with id 'gta3' and a stations map.");
        return;
      }
      state.manifest = data;
      persistManifest(data);
      refreshAllStations();
      alert("Manifest loaded successfully.");
    } catch (error) {
      console.error("Failed to load manifest", error);
      alert("Failed to load manifest. See console for details.");
    }
  });
  input.click();
}

function refreshAllStations() {
  for (const station of state.selectedGame.stations) {
    const record = state.stations.get(station.id);
    if (!record?.file) continue;
    validateStationFile(station, record.file);
  }
}

function updateOffsetReadout() {
  const readout = document.getElementById("offset-readout");
  if (readout) {
    readout.textContent = `Offset: ${formatClock(state.offsetSeconds)}`;
  }
}

async function onFileSelected(station, event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.name !== station.fileName) {
    updateStationStatus(
      station.id,
      "error",
      `Rename the file to ${station.fileName} so it matches the original asset name.`
    );
    return;
  }

  updateStationStatus(station.id, "pending", "Loading upload...");
  try {
    await loadStationFromUpload(station, file);
  } catch (error) {
    console.error("Failed to load upload", error);
    updateStationStatus(station.id, "error", "Unable to read the uploaded file. Try ripping it again.");
  }
}

async function loadStationFromUpload(station, file) {
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "metadata";
  const url = URL.createObjectURL(file);
  const metadataPromise = waitForMetadata(audio);
  audio.src = url;
  audio.load();

  try {
    await metadataPromise;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }

  const { wasCurrent, wasPlaying } = setStationRecord(station.id, {
    audio,
    duration: audio.duration,
    source: "upload",
    origin: file.name,
    objectUrl: url,
  });

  updateStationStatus(station.id, "valid", describeRecord(station.id));

  if (!state.currentStationId) {
    selectStation(station.id);
  } else if (wasCurrent) {
    syncActiveStation(wasPlaying);
    updatePlayerControls();
  } else {
    updateStationSelector();
    updatePlayerControls();
    updateStationStatus(station.id, "error", `Expected file named ${station.fileName}`);
    return;
  }

  updateStationStatus(station.id, "pending", "Hashing...");
  await validateStationFile(station, file);
}

async function validateStationFile(station, file) {
  try {
    const buffer = await file.arrayBuffer();
    const computedMd5 = md5FromArrayBuffer(buffer);
    const manifestEntry = state.manifest.stations?.[station.id];

    if (!manifestEntry) {
      updateStationStatus(station.id, "error", "No MD5 defined in manifest.");
      return;
    }

    if (!manifestEntry.expectedMd5 || manifestEntry.expectedMd5 === "REPLACE_WITH_REAL_MD5") {
      updateStationStatus(station.id, "error", "Manifest missing MD5. Update your manifest file.");
      return;
    }

    const expected = manifestEntry.expectedMd5.toLowerCase();

    if (computedMd5.toLowerCase() !== expected) {
      updateStationStatus(station.id, "error", "MD5 mismatch. Verify you ripped the correct file.");
      return;
    }

    const audio = new Audio();
    audio.src = URL.createObjectURL(new Blob([buffer], { type: file.type || "audio/wav" }));
    audio.loop = true;
    await waitForMetadata(audio);

    state.stations.set(station.id, {
      file,
      md5: computedMd5,
      audio,
      duration: audio.duration,
    });

    updateStationStatus(station.id, "valid", `Verified • ${formatDuration(audio.duration)}`);

    if (!state.currentStationId) {
      selectStation(station.id);
    } else if (state.currentStationId === station.id) {
      syncActiveStation();
    }
    updatePlayerControls();
  } catch (error) {
    console.error("Failed to validate station", error);
    updateStationStatus(station.id, "error", "Failed to read file");
  }
}

function waitForMetadata(audio) {
  return new Promise((resolve, reject) => {
    if (!isNaN(audio.duration) && audio.duration > 0) {
      resolve();
      return;
    }

    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Audio metadata failed to load"));
    };

    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
    };

    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
}

function updateStationStatus(stationId, stateKey, message) {
  const item = els.stationManager.querySelector(`.station-item[data-station-id="${stationId}"]`);
  if (!item) return;
  item.classList.remove("station-item--valid", "station-item--error");
  if (stateKey === "valid") item.classList.add("station-item--valid");
  if (stateKey === "error") item.classList.add("station-item--error");
  const status = item.querySelector(".station-status");
  if (status) {
    status.dataset.state = stateKey;
    status.innerHTML = message;
    status.textContent = message;
  }
}

function renderPlayer() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <h2>Radio player</h2>
    <div class="info-text">
      Once every station is ready, pick one below. The simulator keeps each loop aligned with the shared broadcast clock even when you hop between stations.
      Switching stations keeps the global broadcast clock in sync. Skipping adjusts the shared offset for every station.
    </div>
    <div class="controls" id="player-controls">
      <button id="play-pause" disabled>Play</button>
      <button id="skip-back" disabled>-30s</button>
      <button id="skip-forward" disabled>+30s</button>
      <span class="station-status" data-state="waiting" id="now-playing">No station loaded</span>
    </div>
    <div class="station-selector" id="station-selector"></div>
  `;

  els.player.replaceChildren(wrapper);
  updateStationSelector();
  updatePlayerControls();
}

function updateStationSelector() {
  const container = document.getElementById("station-selector");
  if (!container || !state.selectedGame) return;
  if (!container) return;
  container.replaceChildren();

  for (const station of state.selectedGame.stations) {
    const button = document.createElement("button");
    button.textContent = station.name;
    button.disabled = !state.stations.has(station.id);
    button.classList.toggle("active", station.id === state.currentStationId);
    button.addEventListener("click", () => selectStation(station.id));
    container.appendChild(button);
  }
}

function selectStation(stationId) {
  const record = state.stations.get(stationId);
  if (!record) return;

  if (state.currentStationId && state.currentStationId !== stationId) {
    const previous = state.stations.get(state.currentStationId);
    previous?.audio.pause();
  }

  state.currentStationId = stationId;
  updateStationSelector();
  syncActiveStation(true);
  updatePlayerControls();
}

function syncActiveStation(autoPlay = false) {
  const record = state.stations.get(state.currentStationId);
  if (!record) return;

  const now = nowSeconds();
  const total = record.duration;
  if (!isFinite(total) || total <= 0) return;
  const target = ((now + state.offsetSeconds) % total + total) % total;
  record.audio.currentTime = target;
  if (autoPlay) {
    record.audio.play().catch((error) => console.warn("Playback failed", error));
  }
  updateNowPlaying();
}

function updateNowPlaying() {
  const label = document.getElementById("now-playing");
  if (!label) return;
  const record = state.stations.get(state.currentStationId);
  if (!record) {
    label.dataset.state = "waiting";
    label.textContent = "No station loaded";
    return;
  }

  const now = nowSeconds();
  const total = record.duration;
  const position = ((now + state.offsetSeconds) % total + total) % total;
  label.dataset.state = "valid";
  const stationName = state.selectedGame?.stations.find((s) => s.id === state.currentStationId)?.name || "";
  label.textContent = `${stationName} • ${formatDuration(position)} / ${formatDuration(total)}`;
  label.textContent = `${state.selectedGame.stations.find((s) => s.id === state.currentStationId)?.name || ""} • ${formatDuration(position)} / ${formatDuration(total)}`;
}

function updatePlayerControls() {
  const playPause = document.getElementById("play-pause");
  const back = document.getElementById("skip-back");
  const forward = document.getElementById("skip-forward");

  const hasActive = !!state.currentStationId && state.stations.has(state.currentStationId);
  if (playPause) {
    playPause.disabled = !hasActive;
    playPause.textContent = isPlaying() ? "Pause" : "Play";
    playPause.onclick = () => {
      if (!hasActive) return;
      const record = state.stations.get(state.currentStationId);
      if (!record) return;
      if (isPlaying()) {
        record.audio.pause();
      } else {
        record.audio.play().catch((error) => console.warn("Playback failed", error));
      }
      updatePlayerControls();
    };
  }

  const adjust = (delta) => {
    state.offsetSeconds += delta;
    saveOffset();
    updateOffsetReadout();
    syncActiveStation();
  };

  if (back) {
    back.disabled = !hasActive;
    back.onclick = () => adjust(-30);
  }

  if (forward) {
    forward.disabled = !hasActive;
    forward.onclick = () => adjust(30);
  }
}

function isPlaying() {
  const record = state.stations.get(state.currentStationId);
  return !!record && !record.audio.paused;
}

function startTick() {
  stopTick();
  state.tickHandle = window.setInterval(() => {
    if (isPlaying()) {
      updateNowPlaying();
    }
  }, 1000);
}

function stopTick() {
  if (state.tickHandle) {
    window.clearInterval(state.tickHandle);
    state.tickHandle = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopTick();
  } else {
    startTick();
    syncActiveStation();
  }
});

function init() {
  state.manifest = loadStoredManifest();
  renderGameSelection();
  startTick();

  const lastGame = localStorage.getItem(STORAGE_KEYS.LAST_GAME);
  if (lastGame) {
    selectGame(lastGame);
  }
}

window.addEventListener("beforeunload", () => {
  for (const record of state.stations.values()) {
    record.audio.pause();
    if (record.objectUrl) {
      URL.revokeObjectURL(record.objectUrl);
    }
  }
  stopTick();
});

init();
