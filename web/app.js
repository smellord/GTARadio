const STORAGE_KEYS = {
  OFFSET: "gta-radio-time-offset",
  LAST_GAME: "gta-radio-last-game",
};

const IMPORT_START_ENDPOINT = "/api/import-gta3-start";
const IMPORT_STATUS_ENDPOINT = "/api/import-gta3-status";
const IMPORT_BROWSE_ENDPOINT = "/api/import-gta3-browse";

const GTA3_STATIONS = [
  { id: "HEAD", stem: "HEAD", name: "Head Radio", mp3Name: "HEAD.mp3" },
  { id: "DOUBLE_CLEF", stem: "CLASS", name: "Double Clef FM", mp3Name: "CLASS.mp3" },
  { id: "FLASH", stem: "FLASH", name: "Flashback 95.6", mp3Name: "FLASH.mp3" },
  { id: "JAH", stem: "KJAH", name: "K-JAH Radio", mp3Name: "KJAH.mp3" },
  { id: "LIPS", stem: "LIPS", name: "Lips 106", mp3Name: "LIPS.mp3" },
  { id: "RISE", stem: "RISE", name: "Rise FM", mp3Name: "RISE.mp3" },
  { id: "MSX", stem: "MSX", name: "MSX FM", mp3Name: "MSX.mp3" },
  { id: "CHATTERBOX", stem: "CHAT", name: "Chatterbox FM", mp3Name: "CHAT.mp3" },
  { id: "GAME", stem: "GAME", name: "Game Radio", mp3Name: "GAME.mp3" },
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
  importPath: "",
  importElements: null,
  importJobId: null,
  importLoadedStems: new Set(),
};

const els = {
  gameSelection: document.getElementById("game-selection"),
  stationManager: document.getElementById("station-manager"),
  player: document.getElementById("player"),
};

function resetLibraryState() {
  for (const record of state.stations.values()) {
    try {
      record.audio.pause();
      record.audio.src = "";
    } catch (error) {
      console.warn("Unable to pause audio during reset", error);
    }
    if (record.objectUrl) {
      try {
        URL.revokeObjectURL(record.objectUrl);
      } catch (revokeError) {
        console.warn("Failed to revoke object URL", revokeError);
      }
    }
  }
  state.stations.clear();
  state.currentStationId = null;
  updateNowPlaying();
  updatePlayerControls();
}

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

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  resetLibraryState();
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
      <li>Start the dev server with <code>python tools/serve.py</code> so the importer endpoint is available.</li>
      <li>Click <strong>Browse…</strong> below, select your GTA III installation folder (the game root), then import to copy or convert every station into <code>${folderDisplay}</code> as MP3.</li>
    </ol>
    <div class="importer" id="gta3-importer">
      <form id="gta3-import-form" class="importer__form">
        <label class="importer__label" for="gta3-import-path">GTA III game directory</label>
        <div class="importer__row importer__row--actions">
          <input id="gta3-import-path" type="text" placeholder="Select your GTA III folder" autocomplete="off" readonly />
          <div class="importer__buttons">
            <button type="button" id="gta3-import-browse">Browse…</button>
            <button type="submit" id="gta3-import-submit" disabled>Import and convert</button>
          </div>
        </div>
        <progress id="gta3-import-progress" max="100" value="0" hidden></progress>
        <p class="station-status" data-state="waiting" id="import-feedback">
          Waiting for import. Launch <code>python tools/serve.py</code>, then browse to your GTA III game directory.
        </p>
      </form>
    </div>
    <p class="info-text">
      Any station that remains grey lists the <code>.mp3</code> filename you still need to provide.
    </p>
    <div class="controls">
      <button id="refresh-library">Refresh station library</button>
      <button id="reset-offset">Reset broadcast clock</button>
      <span class="station-status" data-state="waiting" id="offset-readout">Offset: ${formatClock(
        state.offsetSeconds
      )}</span>
    </div>
  `;

  state.importPath = "";
  state.importElements = null;
  state.importJobId = null;
  state.importLoadedStems = new Set();

  const importForm = wrapper.querySelector("#gta3-import-form");
  const browseButton = wrapper.querySelector("#gta3-import-browse");
  const importInput = wrapper.querySelector("#gta3-import-path");
  const importSubmit = wrapper.querySelector("#gta3-import-submit");
  const importFeedback = wrapper.querySelector("#import-feedback");
  const importProgress = wrapper.querySelector("#gta3-import-progress");

  state.importElements = {
    input: importInput,
    submit: importSubmit,
    feedback: importFeedback,
    browse: browseButton,
    progress: importProgress,
  };

  importForm?.addEventListener("submit", (event) => onImportSubmit(event, folderPath));

  browseButton?.addEventListener("click", async () => {
    await requestDirectorySelection();
  });

  const refreshButton = wrapper.querySelector("#refresh-library");
  refreshButton?.addEventListener("click", () => scanLocalLibrary(folderPath));

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
      <div class="station-status" data-state="missing">File <code>${station.mp3Name}</code> expected in <code>${folderDisplay}</code>. Use the importer above to generate it.</div>
    `;

    item.appendChild(info);
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
  loadImportCache(folderPath).finally(() => scanLocalLibrary(folderPath));
}

async function scanLocalLibrary(folderPath) {
  if (!state.selectedGame) return;

  const folderDisplay = folderPath ? `${folderPath}/` : "the expected folder";
  const folderForPaths = folderPath ? `${folderPath}/` : null;
  let removedActive = false;

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
      const wasCurrent = clearStationRecord(station.id);
      removedActive = removedActive || wasCurrent;
      const expected = folderForPaths
        ? describeExpectedFilePathsHtml(station, folderForPaths)
        : describeExpectedFileHtml(station);
      const guidance = folderPath
        ? `File ${expected} is missing or unreadable.`
        : `Use the importer above to provide ${expected}.`;
      const details = error instanceof Error ? escapeHtml(error.message) : "Unknown error";
      updateStationStatus(
        station.id,
        "error",
        `${guidance}<br />Reason: ${details}`
      );
    }
  }

  updateStationSelector();
  updatePlayerControls();
  if (removedActive) {
    updateNowPlaying();
  }
}

async function onImportSubmit(event, folderPath) {
  event.preventDefault();
  const importElements = state.importElements;
  if (!importElements) return;

  const { submit, feedback, input, browse, progress } = importElements;
  if (!submit || !feedback) return;

  if (!state.importPath) {
    feedback.dataset.state = "error";
    feedback.innerHTML = "Browse to your GTA III game directory before importing.";
    return;
  }

  feedback.dataset.state = "pending";
  feedback.innerHTML = "Starting conversion…";
  submit.disabled = true;
  if (browse) browse.disabled = true;
  if (progress) {
    progress.hidden = false;
    progress.value = 0;
  }

  state.importLoadedStems = new Set();

  try {
    const job = await startImportJob(state.importPath);
    const jobId = job?.id;
    if (!jobId) {
      throw new Error("Import job did not return an id.");
    }
    state.importJobId = jobId;
    await monitorImportJob(jobId, folderPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    feedback.dataset.state = "error";
    feedback.innerHTML = escapeHtml(message);
    if (progress) {
      progress.hidden = true;
      progress.value = 0;
    }
  } finally {
    state.importJobId = null;
    submit.disabled = false;
    if (browse) browse.disabled = false;
  }

  if (input && state.importPath) {
    input.value = state.importPath;
  }

  await loadImportCache(folderPath, { force: true });
}

function formatImportSummary(summary) {
  const expected = summary.expected ?? GTA3_STATIONS.length;
  const found = summary.found ?? 0;
  const converted = summary.converted ?? 0;
  const copied = summary.copied ?? 0;
  const target = summary.target ? `<code>${escapeHtml(summary.target)}</code>` : "the project sounds folder";
  const audioDir = summary.audio_dir ? `<code>${escapeHtml(summary.audio_dir)}</code>` : null;
  const sourceRoot = summary.source_root ? `<code>${escapeHtml(summary.source_root)}</code>` : null;
  const parts = [
    `${found}/${expected} stations ready`,
    `${converted} converted`,
    `${copied} copied`,
    `Output: ${target}`,
  ];
  if (sourceRoot) {
    parts.push(`Game: ${sourceRoot}`);
  }
  if (audioDir) {
    parts.push(`Audio: ${audioDir}`);
  }
  if (summary.tool) {
    parts.push(`Tool: ${escapeHtml(summary.tool)}`);
  }
  if (summary.cache_file) {
    parts.push(`Cache: <code>${escapeHtml(summary.cache_file)}</code>`);
  }
  if (summary.cache_error) {
    parts.push(`Cache error: ${escapeHtml(summary.cache_error)}`);
  }
  if (summary.missing && summary.missing.length) {
    parts.push(`Missing: ${summary.missing.map((stem) => `<code>${escapeHtml(stem)}</code>`).join(", ")}`);
  }
  if (summary.failures && summary.failures.length) {
    parts.push(`Failed: ${summary.failures.map((stem) => `<code>${escapeHtml(stem)}</code>`).join(", ")}`);
  }
  return parts.join(" • ");
}

function setImportPath(path) {
  state.importPath = path || "";
  const importElements = state.importElements;
  if (!importElements) return;

  const { input, submit, feedback, progress } = importElements;
  if (input) {
    input.value = state.importPath;
  }
  if (submit) {
    submit.disabled = !state.importPath;
  }
  if (progress) {
    progress.value = 0;
    progress.hidden = true;
  }
  if (feedback) {
    if (state.importPath) {
      feedback.dataset.state = "pending";
      feedback.innerHTML = `Ready to import from <code>${escapeHtml(state.importPath)}</code>. Click <strong>Import and convert</strong>.`;
    } else {
      feedback.dataset.state = "waiting";
      feedback.innerHTML = "Waiting for import. Launch <code>python tools/serve.py</code>, then browse to your GTA III game directory.";
    }
  }
}

async function requestDirectorySelection() {
  const importElements = state.importElements;
  if (!importElements) return;

  const { browse, feedback } = importElements;
  if (browse) browse.disabled = true;

  try {
    const response = await fetch(IMPORT_BROWSE_ENDPOINT, {
      method: "POST",
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Browse request failed (${response.status})`);
    }
    const payload = await response.json();
    if (payload.cancelled) {
      if (feedback) {
        feedback.dataset.state = "waiting";
        feedback.innerHTML = "Directory selection cancelled. Browse again to continue.";
      }
      return;
    }
    if (payload.path) {
      setImportPath(payload.path);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open directory picker.";
    if (feedback) {
      feedback.dataset.state = "error";
      feedback.innerHTML = escapeHtml(message);
    }
  } finally {
    if (browse) browse.disabled = false;
  }
}

async function startImportJob(directoryPath) {
  let response;
  try {
    response = await fetch(IMPORT_START_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gta3_dir: directoryPath }),
    });
  } catch (networkError) {
    throw new Error("Unable to reach the import endpoint. Start the dev server via python tools/serve.py.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error || `Import start failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload.job || payload;
}

async function monitorImportJob(jobId, folderPath) {
  const importElements = state.importElements;
  if (!importElements) return;

  while (true) {
    let payload;
    try {
      payload = await requestJobStatus(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch job status.";
      if (importElements.feedback) {
        importElements.feedback.dataset.state = "error";
        importElements.feedback.innerHTML = escapeHtml(message);
      }
      throw error instanceof Error ? error : new Error(message);
    }

    const job = payload.job || {};
    await applyImportStatus(job, folderPath);

    if (job.status === "completed") {
      if (importElements.feedback) {
        importElements.feedback.dataset.state = "valid";
        importElements.feedback.innerHTML = formatImportSummary(job.summary || job.partial_summary || {});
      }
      if (importElements.progress) {
        importElements.progress.hidden = false;
        importElements.progress.value = 100;
      }
      await scanLocalLibrary(folderPath);
      return;
    }

    if (job.status === "failed") {
      const message = job.error ? escapeHtml(job.error) : "Import failed.";
      if (importElements.feedback) {
        importElements.feedback.dataset.state = "error";
        importElements.feedback.innerHTML = message;
      }
      throw new Error(job.error || "Import failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function requestJobStatus(jobId) {
  const response = await fetch(`${IMPORT_STATUS_ENDPOINT}?job=${encodeURIComponent(jobId)}&v=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Status request failed (${response.status})`);
  }
  return response.json();
}

async function applyImportStatus(job, folderPath) {
  const importElements = state.importElements;
  if (!importElements) return;

  const total = job.total || (state.selectedGame ? state.selectedGame.stations.length : 0);
  const processed = job.progress || (job.records ? Object.keys(job.records).length : 0);
  const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  if (importElements.progress) {
    importElements.progress.hidden = false;
    importElements.progress.value = percent;
  }

  if (importElements.feedback && job.status !== "completed") {
    const summary = job.summary || job.partial_summary || {};
    const summaryText = formatImportSummary(summary);
    const progressText = total
      ? `${processed}/${total} processed (${percent}%)`
      : `${processed} processed`;
    importElements.feedback.dataset.state = job.status === "failed" ? "error" : "pending";
    importElements.feedback.innerHTML = summaryText ? `${progressText} • ${summaryText}` : progressText;
  }

  const records = job.records || {};
  const folderForPaths = folderPath ? `${folderPath}/` : null;

  for (const record of Object.values(records)) {
    const stem = record.stem ? String(record.stem).toUpperCase() : null;
    if (!stem) continue;
    const station = findStationByStem(stem);
    if (!station) continue;

    if (record.status === "converted" || record.status === "copied") {
      if (!state.importLoadedStems.has(stem)) {
        state.importLoadedStems.add(stem);
        try {
          await loadStationFromLibrary(station, folderPath);
        } catch (error) {
          state.importLoadedStems.delete(stem);
          console.warn(`Converted ${station.stem} but failed to load`, error);
          const details = error instanceof Error ? escapeHtml(error.message) : "Unknown error";
          updateStationStatus(
            station.id,
            "pending",
            `Converted. Waiting for the browser to pick up the new MP3… (${details})`
          );
        }
      }
    } else if (record.status === "missing") {
      const expected = folderForPaths
        ? describeExpectedFilePathsHtml(station, folderForPaths)
        : describeExpectedFileHtml(station);
      updateStationStatus(
        station.id,
        "missing",
        `File ${expected} is missing. Select your GTA III folder and re-run the importer.`
      );
    } else if (record.status === "failed") {
      const reasonRaw =
        record.error ||
        (record.logs && record.logs.join("\n")) ||
        (record.exit_code ? `Encoder exited with code ${record.exit_code}` : "Unknown failure");
      const reason = escapeHtml(String(reasonRaw)).replace(/\n/g, "<br />");
      updateStationStatus(
        station.id,
        "error",
        `Import failed. ${reason}`
      );
    }
  }
}

function findStationByStem(stem) {
  if (!state.selectedGame) return null;
  const upper = String(stem || "").toUpperCase();
  return state.selectedGame.stations.find((station) => station.stem === upper) || null;
}

async function loadImportCache(folderPath, options = {}) {
  const { force = false } = options;
  if (!folderPath) return;
  const feedback = document.getElementById("import-feedback");
  if (!feedback) return;
  if (!force) {
    const currentState = feedback.dataset.state;
    if (currentState && currentState !== "waiting") {
      return;
    }
  }

  try {
    const response = await fetch(`${folderPath}/import-cache.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    feedback.dataset.state = "valid";
    feedback.innerHTML = formatImportSummary(data);
  } catch (error) {
    if (force) {
      console.warn("Unable to read import cache", error);
    }
  }
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
  return `Ready${details ? ` – ${details}` : ""}`;
}

function setStationRecord(stationId, record) {
  const previous = state.stations.get(stationId);
  const wasCurrent = state.currentStationId === stationId;
  const wasPlaying = wasCurrent && previous ? !previous.audio.paused : false;

  if (previous?.audio) {
    previous.audio.pause();
    previous.audio.src = "";
  }
  if (previous?.objectUrl && previous.objectUrl !== record.objectUrl) {
    URL.revokeObjectURL(previous.objectUrl);
  }

  state.stations.set(stationId, record);
  return { wasCurrent, wasPlaying };
}

function clearStationRecord(stationId) {
  const record = state.stations.get(stationId);
  if (!record) return false;

  try {
    record.audio.pause();
    record.audio.src = "";
  } catch (error) {
    console.warn("Unable to pause audio for station", stationId, error);
  }
  if (record.objectUrl) {
    try {
      URL.revokeObjectURL(record.objectUrl);
    } catch (revokeError) {
      console.warn("Failed to revoke object URL", revokeError);
    }
  }

  state.stations.delete(stationId);
  const wasCurrent = state.currentStationId === stationId;
  if (wasCurrent) {
    state.currentStationId = null;
  }
  return wasCurrent;
}

function updateOffsetReadout() {
  const readout = document.getElementById("offset-readout");
  if (readout) {
    readout.textContent = `Offset: ${formatClock(state.offsetSeconds)}`;
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
      button.title = `Missing ${describeExpectedFilePlain(station)}. Copy ${expectedPlain} via the importer.`;
    } else {
      button.title = `Missing ${describeExpectedFilePlain(station)}. Use the importer above to provide it.`;
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
