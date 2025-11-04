const STORAGE_KEYS = {
  OFFSET: "gta-radio-time-offset",
  LAST_GAME: "gta-radio-last-game",
};

const GTA3_STATIONS = [
  { id: "HEAD", name: "Head Radio", mp3Name: "HEAD.mp3" },
  { id: "DOUBLE_CLEF", name: "Double Clef FM", mp3Name: "CLASS.mp3" },
  { id: "FLASH", name: "Flashback 95.6", mp3Name: "FLASH.mp3" },
  { id: "JAH", name: "K-JAH Radio", mp3Name: "KJAH.mp3" },
  { id: "LIPS", name: "Lips 106", mp3Name: "LIPS.mp3" },
  { id: "RISE", name: "Rise FM", mp3Name: "RISE.mp3" },
  { id: "MSX", name: "MSX FM", mp3Name: "MSX.mp3" },
  { id: "CHATTERBOX", name: "Chatterbox FM", mp3Name: "CHAT.mp3" },
  { id: "GAME", name: "Game Radio", mp3Name: "GAME.mp3" },
];

const GAME_LIBRARY_FOLDERS = {
  gta3: "sounds/gta/3",
};

const GAMES = [
  {
    id: "gta3",
    name: "Grand Theft Auto III",
    status: "available",
    description:
      "Sync your GTA III radio stations with the original broadcast clock. Follow the guided setup below.",
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

function getStationMp3Name(station) {
  return station.mp3Name;
}

function describeExpectedFilePlain(station) {
  return getStationMp3Name(station);
}

function describeExpectedFileHtml(station) {
  return `<code>${getStationMp3Name(station)}</code>`;
}

function describeExpectedFilePathsPlain(station, folderPath) {
  if (!folderPath) {
    return describeExpectedFilePlain(station);
  }
  const base = folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
  return `${base}${getStationMp3Name(station)}`;
}

function describeExpectedFilePathsHtml(station, folderPath) {
  if (!folderPath) {
    return describeExpectedFileHtml(station);
  }
  const base = folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
  return `<code>${base}${getStationMp3Name(station)}</code>`;
}

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
        <li>Rip each radio station from your own copy of the game as an unmodified <code>.wav</code> file (HEAD.wav, CLASS.wav, etc.).</li>
        <li>Run <code>python tools/import_gta3_audio.py</code> (PowerShell and shell wrappers live in <code>/tools</code>) to convert them into MP3s inside <code>${folderDisplay}</code>. The web player only loads these MP3 versions.</li>
        <li>Press <strong>Scan GTA III folder</strong> to pull them in automatically, or upload individual MP3s below.</li>
      </ol>
      <p class="info-text">
        Any station that remains grey lists the <code>.mp3</code> filename you still need to provide.
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
    item.className = "station-item station-item--missing";
    item.dataset.stationId = station.id;

      const info = document.createElement("div");
      info.innerHTML = `
        <strong>${station.name}</strong>
        <div class="station-status" data-state="missing">File <code>${station.mp3Name}</code> expected in <code>${folderDisplay}</code>. Run the importer or add it below.</div>
      `;

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".mp3,.MP3";
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
  `;

  wrapper.appendChild(warning);

  els.stationManager.replaceChildren(wrapper);
  scanLocalLibrary(folderPath);
}

async function scanLocalLibrary(folderPath) {
  if (!state.selectedGame) return;

  const folderDisplay = folderPath ? `${folderPath}/` : "the expected folder";
  const folderForPaths = folderPath ? `${folderPath}/` : null;

  for (const station of state.selectedGame.stations) {
    const expectedHtml = folderForPaths
      ? describeExpectedFilePathsHtml(station, folderForPaths)
      : describeExpectedFileHtml(station);
    updateStationStatus(
      station.id,
      "pending",
      `Looking for ${expectedHtml} in ${folderDisplay}...`
    );
    try {
      await loadStationFromLibrary(station, folderPath);
    } catch (error) {
      console.warn(`Failed to load ${station.mp3Name} from library`, error);
      const fallback = describeRecord(station.id);
      if (fallback) {
        updateStationStatus(station.id, "valid", fallback);
      } else {
        const expected = folderForPaths
          ? describeExpectedFilePathsHtml(station, folderForPaths)
          : describeExpectedFileHtml(station);
        const guidance = folderPath
          ? `File ${expected} is missing or unreadable.`
          : `Upload ${expected} manually using the button below.`;
        const details = error instanceof Error ? error.message : "Unknown error";
        updateStationStatus(
          station.id,
          "error",
          `${guidance}<br />Reason: ${details}`
        );
      }
    }
  }

  updateStationSelector();
  updatePlayerControls();
}

async function resolveStationUrl(station, folderPath) {
  const mp3Name = getStationMp3Name(station);
  const base = folderPath ? `${folderPath}/` : "";
  const version = Date.now();
  const candidatePath = `${base}${mp3Name}`;
  const url = `${candidatePath}?v=${version}`;

  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (response.ok) {
      return { url, origin: candidatePath };
    }
    if (response.status !== 404) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to reach ${candidatePath}: ${message}`);
  }

  throw new Error(`Missing ${describeExpectedFilePlain(station)}`);
}

async function loadStationFromLibrary(station, folderPath) {
  const resolved = await resolveStationUrl(station, folderPath);
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "metadata";

  const metadataPromise = waitForMetadata(audio);
  audio.src = resolved.url;
  audio.load();

  try {
    await metadataPromise;
  } catch (metadataError) {
    throw metadataError;
  }

  const { wasCurrent, wasPlaying } = setStationRecord(station.id, {
    audio,
    duration: audio.duration,
    source: "library",
    origin: resolved.origin,
    objectUrl: null,
    note: "MP3 stream",
    format: "mp3",
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
  const details = [record.note, duration].filter(Boolean).join(" • ");
  if (record.source === "library") {
    return `Loaded from ${record.origin}${details ? ` – ${details}` : ""}`;
  }
  if (record.source === "upload") {
    return `Using uploaded file (${record.origin})${details ? ` – ${details}` : ""}`;
  }
  return `Ready${details ? ` – ${details}` : ""}`;
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

  const expectedName = getStationMp3Name(station).toLowerCase();
  if (file.name.toLowerCase() !== expectedName) {
    const expected = describeExpectedFileHtml(station);
    updateStationStatus(
      station.id,
      "error",
      `Rename the file to match the original asset name (${expected}).`
    );
    return;
  }

  updateStationStatus(station.id, "pending", "Loading upload...");
  try {
    await loadStationFromUpload(station, file);
  } catch (error) {
    console.error("Failed to load upload", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    updateStationStatus(
      station.id,
      "error",
      `Unable to read the uploaded file.<br />Reason: ${details}`
    );
  }
}

async function loadStationFromUpload(station, file) {
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "metadata";

  const lowerName = file.name.toLowerCase();
  const isMp3 = lowerName.endsWith(".mp3") || file.type === "audio/mpeg";

  if (!isMp3) {
    throw new Error("Only MP3 uploads are supported. Use the importer to convert WAV files.");
  }

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
    note: "MP3 upload",
    format: "mp3",
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
  item.classList.remove("station-item--valid", "station-item--error", "station-item--missing");
  if (stateKey === "valid") item.classList.add("station-item--valid");
  if (stateKey === "error") item.classList.add("station-item--error");
  if (stateKey === "missing") item.classList.add("station-item--missing");
  const status = item.querySelector(".station-status");
  if (status) {
    status.dataset.state = stateKey;
    status.innerHTML = message;
  }
}

function renderPlayer() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <h2>Radio player</h2>
    <div class="info-text">
      Once every station is ready, pick one below. The simulator keeps each loop aligned with the shared broadcast clock even when you hop between stations.
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
  container.replaceChildren();

  const folderPath = getLibraryFolder(state.selectedGame.id);
  const folderDisplay = folderPath ? `${folderPath}/` : "";

  for (const station of state.selectedGame.stations) {
    const button = document.createElement("button");
    button.textContent = station.name;
    const hasRecord = state.stations.has(station.id);
    button.disabled = !hasRecord;
    button.classList.toggle("active", station.id === state.currentStationId);
    button.classList.toggle("missing", !hasRecord);
    if (hasRecord) {
      button.title = "Station ready";
    } else if (folderPath) {
      const expectedPlain = describeExpectedFilePathsPlain(station, folderDisplay);
      button.title = `Missing ${describeExpectedFilePlain(station)}. Copy ${expectedPlain} or upload below.`;
    } else {
      button.title = `Missing ${describeExpectedFilePlain(station)}. Upload it below.`;
    }
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
