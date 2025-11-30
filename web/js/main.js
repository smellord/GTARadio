import { GAMES, state, resetLibraryState, saveOffset, formatClock } from './state.js';
import {
  describeExpectedFilePathsPlain,
  getLibraryFolder,
  scanLibrary,
} from './library.js';
import {
  renderPlayer,
  selectStation,
  setStationRecord,
  clearStationRecord,
  updateStationSelector,
  startTick,
  stopTick,
  syncActiveStation,
} from './player.js';
import {
  initImporter,
  setImportPath,
  browseForDirectory,
  startImport,
  attachAutoStartFromQuery,
} from './importer.js';

const els = {
  gameSelection: document.getElementById('game-selection'),
  stationManager: document.getElementById('station-manager'),
  player: document.getElementById('player'),
};

function renderGameSelection() {
  const lastGame = localStorage.getItem('gta-radio-last-game');
  const container = document.createElement('div');
  container.innerHTML = `
    <h2>Select your game</h2>
    <p class="info-text">
      Pick the title you want to simulate. Each game needs its original radio audio ripped from your own copy.
    </p>
  `;
  const grid = document.createElement('div');
  grid.className = 'game-grid';
  for (const game of GAMES) {
    const card = document.createElement('article');
    card.className = 'game-card';
    card.innerHTML = `
      <h3>${game.name}</h3>
      ${game.description ? `<p>${game.description}</p>` : ''}
      ${game.status === 'soon' ? '<span class="badge">Coming soon</span>' : ''}
    `;
    const button = document.createElement('button');
    button.textContent = game.status === 'available' ? 'Open setup' : 'Unavailable';
    button.disabled = game.status !== 'available';
    if (game.id === lastGame && game.status === 'available') {
      button.textContent = 'Resume';
    }
    button.addEventListener('click', () => selectGame(game.id));
    card.appendChild(button);
    grid.appendChild(card);
  }
  container.appendChild(grid);
  els.gameSelection.replaceChildren(container);
}

function selectGame(gameId) {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game || game.status !== 'available') return;
  // Reset any previous state so switching games never leaves stray audio playing.
  resetLibraryState();
  stopTick();
  state.selectedGame = game;
  localStorage.setItem('gta-radio-last-game', game.id);
  renderStationManager();
  els.stationManager.hidden = false;
  renderPlayer(els.player, game, (stationId) => selectStation(stationId, game));
  els.player.hidden = false;
  refreshLibrary();
  startTick(game);
  attachAutoStartFromQuery(game.id);
}

async function refreshLibrary() {
  if (!state.selectedGame) return;
  const game = state.selectedGame;
  const folderPath = getLibraryFolder(game.id);
  const list = els.stationManager.querySelector('.station-list');
  if (list) {
    list.querySelectorAll('.station-status').forEach((el) => {
      el.dataset.state = 'pending';
      el.textContent = 'Checking…';
    });
  }
  for (const station of game.stations) {
    clearStationRecord(station.id);
  }
  try {
    // Load each station serially so we can surface clear status text per file.
    const records = await scanLibrary(game, folderPath, ({ station, state: stateKey, message }) => {
      updateStationStatus(station.id, stateKey, message);
    });
    for (const [stationId, record] of records) {
      setStationRecord(stationId, record);
    }
    if (!state.currentStationId) {
      const firstReady = game.stations.find((s) => state.stations.has(s.id));
      if (firstReady) selectStation(firstReady.id, game);
    }
    updateStationSelector(game, (stationId) => selectStation(stationId, game));
    syncActiveStation(game, true);
  } catch (error) {
    console.error('Library scan failed', error);
  }
}

function renderStationManager() {
  if (!state.selectedGame) return;
  const folderPath = getLibraryFolder(state.selectedGame.id);
  const folderDisplay = folderPath ? `${folderPath}/` : 'the expected folder';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <h2>${state.selectedGame.name} station setup</h2>
    <p class="info-text">
      Start the dev server with <code>python tools/serve.py</code>, click <strong>Browse…</strong> to point at your GTA III installation folder, then import to copy or convert every station into <code>${folderDisplay}</code> as MP3.
    </p>
    <div class="importer" id="gta3-importer">
      <form id="gta3-import-form" class="importer__form">
        <label class="importer__label" for="gta3-import-path">GTA III game directory</label>
        <div class="importer__row importer__row--actions">
          <input
            id="gta3-import-path"
            name="gta3-import-path"
            type="text"
            autocomplete="off"
            placeholder="E:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto 3"
            required
          />
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
    <div class="station-list"></div>
    <div class="controls">
      <button id="reset-offset">Reset broadcast clock</button>
      <span class="station-status" data-state="waiting" id="offset-readout">Offset: ${formatClock(
        state.offsetSeconds,
      )}</span>
    </div>
  `;
  els.stationManager.replaceChildren(wrapper);
  const importForm = wrapper.querySelector('#gta3-import-form');
  const browseButton = wrapper.querySelector('#gta3-import-browse');
  const importInput = wrapper.querySelector('#gta3-import-path');
  const importSubmit = wrapper.querySelector('#gta3-import-submit');
  const importFeedback = wrapper.querySelector('#import-feedback');
  const importProgress = wrapper.querySelector('#gta3-import-progress');

  initImporter({
    input: importInput,
    submit: importSubmit,
    feedback: importFeedback,
    browse: browseButton,
    progress: importProgress,
  });
  setImportPath(state.importPath);

  importForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    startImport();
  });
  browseButton?.addEventListener('click', () => browseForDirectory());
  importInput?.addEventListener('input', (event) => setImportPath(event.target.value));
  wrapper.querySelector('#reset-offset')?.addEventListener('click', () => {
    state.offsetSeconds = 0;
    saveOffset();
    document.getElementById('offset-readout').textContent = `Offset: ${formatClock(state.offsetSeconds)}`;
    syncActiveStation(state.selectedGame);
  });

  renderStations(wrapper.querySelector('.station-list'), folderDisplay);
}

function renderStations(container, folderDisplay) {
  if (!state.selectedGame || !container) return;
  container.replaceChildren();
  for (const station of state.selectedGame.stations) {
    const item = document.createElement('div');
    item.className = 'station-item';
    item.dataset.stationId = station.id;
    item.innerHTML = `
      <div class="station-item__header">
        <strong>${station.name}</strong>
        <span class="station-badge">${station.stem}.mp3</span>
      </div>
      <div class="station-status" data-state="waiting">File <code>${describeExpectedFilePathsPlain(
        station,
        folderDisplay,
      )}</code> required.</div>
    `;
    container.appendChild(item);
  }
}

function updateStationStatus(stationId, stateKey, message) {
  const item = els.stationManager.querySelector(`.station-item[data-station-id="${stationId}"]`);
  if (!item) return;
  item.classList.remove('station-item--valid', 'station-item--error', 'station-item--missing');
  if (stateKey === 'valid') item.classList.add('station-item--valid');
  if (stateKey === 'error') item.classList.add('station-item--error');
  if (stateKey === 'missing') item.classList.add('station-item--missing');
  const status = item.querySelector('.station-status');
  if (status) {
    status.dataset.state = stateKey;
    status.innerHTML = String(message);
  }
}

window.addEventListener('station-ready', () => refreshLibrary());

renderGameSelection();
const lastGame = localStorage.getItem('gta-radio-last-game');
if (lastGame) {
  selectGame(lastGame);
}
