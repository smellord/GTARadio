// Playback and clock synchronisation helpers.
import { GAME_LIBRARY_FOLDERS, state, nowSeconds, formatDuration, saveOffset } from './state.js';

const playerEls = {
  container: null,
  selector: null,
  nowPlaying: null,
  playPause: null,
  skipBack: null,
  skipForward: null,
};

function getBroadcastPosition(duration) {
  const daySeconds = nowSeconds();
  return ((daySeconds + state.offsetSeconds) % duration + duration) % duration;
}

function isPlaying() {
  const record = state.stations.get(state.currentStationId);
  return !!record && !record.audio.paused;
}

function updateNowPlayingLabel(game) {
  if (!playerEls.nowPlaying) return;
  const record = state.stations.get(state.currentStationId);
  if (!record) {
    playerEls.nowPlaying.dataset.state = 'waiting';
    playerEls.nowPlaying.textContent = 'No station loaded';
    return;
  }
  const total = record.duration;
  const position = getBroadcastPosition(total);
  const stationName = game?.stations.find((s) => s.id === state.currentStationId)?.name || '';
  playerEls.nowPlaying.dataset.state = 'valid';
  playerEls.nowPlaying.textContent = `${stationName} • ${formatDuration(position)} / ${formatDuration(total)}`;
}

export function syncActiveStation(game, autoPlay = false) {
  const record = state.stations.get(state.currentStationId);
  if (!record) return;
  if (!isFinite(record.duration) || record.duration <= 0) return;

  const target = getBroadcastPosition(record.duration);
  const drift = Math.abs(record.audio.currentTime - target);
  // Only seek when the drift is noticeable or when paused, to avoid 1s looping.
  // This keeps the "always playing" illusion without constantly resetting playback.
  if (!isFinite(record.audio.currentTime) || drift > 2 || record.audio.paused) {
    record.audio.currentTime = target;
  }
  if (autoPlay && record.audio.paused) {
    record.audio.play().catch((error) => console.warn('Playback failed', error));
  }
  updateNowPlayingLabel(game);
}

function updateControls(game) {
  const hasActive = !!state.currentStationId && state.stations.has(state.currentStationId);
  if (playerEls.playPause) {
    playerEls.playPause.disabled = !hasActive;
    playerEls.playPause.textContent = isPlaying() ? 'Pause' : 'Play';
    playerEls.playPause.onclick = () => {
      const record = state.stations.get(state.currentStationId);
      if (!record) return;
      if (isPlaying()) {
        record.audio.pause();
      } else {
        syncActiveStation(game, true);
      }
      updateControls(game);
    };
  }
  const adjust = (delta) => {
    state.offsetSeconds += delta;
    saveOffset();
    syncActiveStation(game);
    updateNowPlayingLabel(game);
  };
  if (playerEls.skipBack) {
    playerEls.skipBack.disabled = !hasActive;
    playerEls.skipBack.onclick = () => adjust(-30);
  }
  if (playerEls.skipForward) {
    playerEls.skipForward.disabled = !hasActive;
    playerEls.skipForward.onclick = () => adjust(30);
  }
}

export function renderPlayer(container, game, onSelectStation) {
  const wrapper = document.createElement('div');
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
  container.replaceChildren(wrapper);

  playerEls.container = container;
  playerEls.selector = wrapper.querySelector('#station-selector');
  playerEls.nowPlaying = wrapper.querySelector('#now-playing');
  playerEls.playPause = wrapper.querySelector('#play-pause');
  playerEls.skipBack = wrapper.querySelector('#skip-back');
  playerEls.skipForward = wrapper.querySelector('#skip-forward');

  updateStationSelector(game, onSelectStation);
  updateNowPlayingLabel(game);
  updateControls(game);
}

export function updateStationSelector(game, onSelectStation) {
  if (!playerEls.selector) return;
  playerEls.selector.replaceChildren();
  const folderPath = game ? GAME_LIBRARY_FOLDERS[game.id] : '';
  const folderDisplay = folderPath ? `${folderPath}/` : '';
  for (const station of game?.stations || []) {
    const button = document.createElement('button');
    button.textContent = station.name;
    const hasRecord = state.stations.has(station.id);
    button.disabled = !hasRecord;
    button.classList.toggle('active', station.id === state.currentStationId);
    button.classList.toggle('missing', !hasRecord);
    if (hasRecord) {
      button.title = 'Station ready';
    } else if (folderPath) {
      button.title = `Missing ${station.stem}.mp3. Copy ${folderDisplay}${station.stem}.mp3 via the importer.`;
    } else {
      button.title = `Missing ${station.stem}.mp3. Use the importer above to provide it.`;
    }
    button.addEventListener('click', () => onSelectStation?.(station.id));
    playerEls.selector.appendChild(button);
  }
  updateControls(game);
}

export function selectStation(stationId, game) {
  const record = state.stations.get(stationId);
  if (!record) return;
  if (state.currentStationId && state.currentStationId !== stationId) {
    const prev = state.stations.get(state.currentStationId);
    prev?.audio.pause();
  }
  state.currentStationId = stationId;
  syncActiveStation(game, true);
  updateControls(game);
  updateStationSelector(game, () => selectStation(stationId, game));
}

export function setStationRecord(stationId, record) {
  const previous = state.stations.get(stationId);
  if (previous?.audio) {
    previous.audio.pause();
    previous.audio.src = '';
  }
  if (previous?.objectUrl && previous.objectUrl !== record.objectUrl) {
    URL.revokeObjectURL(previous.objectUrl);
  }
  state.stations.set(stationId, record);
}

export function clearStationRecord(stationId) {
  const record = state.stations.get(stationId);
  if (!record) return false;
  try {
    record.audio.pause();
    record.audio.src = '';
  } catch (error) {
    console.warn('Unable to pause audio for station', stationId, error);
  }
  if (record.objectUrl) {
    try {
      URL.revokeObjectURL(record.objectUrl);
    } catch (revokeError) {
      console.warn('Failed to revoke object URL', revokeError);
    }
  }
  state.stations.delete(stationId);
  if (state.currentStationId === stationId) {
    state.currentStationId = null;
  }
  return true;
}

export function startTick(game) {
  stopTick();
  state.tickHandle = window.setInterval(() => syncActiveStation(game), 1000);
}

export function stopTick() {
  if (state.tickHandle) {
    window.clearInterval(state.tickHandle);
    state.tickHandle = null;
  }
}
