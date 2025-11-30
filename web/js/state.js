// Shared constants and state for the GTA radio web app.
export const STORAGE_KEYS = {
  OFFSET: 'gta-radio-time-offset',
  LAST_GAME: 'gta-radio-last-game',
};

export const GTA3_STATIONS = [
  { id: 'HEAD', stem: 'HEAD', name: 'Head Radio' },
  { id: 'DOUBLE_CLEF', stem: 'CLASS', name: 'Double Clef FM' },
  { id: 'FLASH', stem: 'FLASH', name: 'Flashback 95.6' },
  { id: 'JAH', stem: 'KJAH', name: 'K-JAH Radio' },
  { id: 'LIPS', stem: 'LIPS', name: 'Lips 106' },
  { id: 'RISE', stem: 'RISE', name: 'Rise FM' },
  { id: 'MSX', stem: 'MSX', name: 'MSX FM' },
  { id: 'CHATTERBOX', stem: 'CHAT', name: 'Chatterbox FM' },
  { id: 'GAME', stem: 'GAME', name: 'Game Radio' },
];

export const GAME_LIBRARY_FOLDERS = {
  gta3: 'sounds/gta/3',
};

export const GAMES = [
  {
    id: 'gta3',
    name: 'Grand Theft Auto III',
    status: 'available',
    description:
      'Sync your GTA III radio stations with the real broadcast clock. Follow the guided setup below.',
    stations: GTA3_STATIONS,
  },
  { id: 'vc', name: 'Grand Theft Auto: Vice City', status: 'soon' },
  { id: 'sa', name: 'Grand Theft Auto: San Andreas', status: 'soon' },
  { id: 'lcs', name: 'Liberty City Stories', status: 'soon' },
];

export const state = {
  selectedGame: null,
  stations: new Map(),
  currentStationId: null,
  offsetSeconds: Number(localStorage.getItem(STORAGE_KEYS.OFFSET)) || 0,
  tickHandle: null,
  importPath: '',
  importJobId: null,
  importLoadedStems: new Set(),
};

export function resetLibraryState() {
  for (const record of state.stations.values()) {
    try {
      record.audio.pause();
      record.audio.src = '';
    } catch (error) {
      console.warn('Unable to pause audio during reset', error);
    }
    if (record.objectUrl) {
      try {
        URL.revokeObjectURL(record.objectUrl);
      } catch (revokeError) {
        console.warn('Failed to revoke object URL', revokeError);
      }
    }
  }
  state.stations.clear();
  state.currentStationId = null;
}

export function saveOffset() {
  localStorage.setItem(STORAGE_KEYS.OFFSET, String(state.offsetSeconds));
}

export function nowSeconds() {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function formatClock(seconds) {
  const sign = seconds < 0 ? '-' : '';
  const absSeconds = Math.abs(seconds);
  const h = Math.floor(absSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((absSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(absSeconds % 60).toString().padStart(2, '0');
  return `${sign}${h}:${m}:${s}`;
}
