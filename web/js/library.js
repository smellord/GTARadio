// Helpers for loading and validating station audio from the local library.
import { GAME_LIBRARY_FOLDERS, formatDuration } from './state.js';

export function getLibraryFolder(gameId) {
  return GAME_LIBRARY_FOLDERS[gameId] || '';
}

export function expectedMp3Name(station) {
  return `${station.stem}.mp3`;
}

export function describeExpectedFilePlain(station) {
  return expectedMp3Name(station);
}

export function describeExpectedFilePathsPlain(station, folderPath) {
  if (!folderPath) return describeExpectedFilePlain(station);
  const base = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  return `${base}${expectedMp3Name(station)}`;
}

export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function waitForMetadata(audio) {
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
      reject(new Error('Audio metadata failed to load'));
    };
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };
    audio.addEventListener('loadedmetadata', onLoaded, { once: true });
    audio.addEventListener('error', onError, { once: true });
  });
}

export async function resolveStationUrl(station, folderPath) {
  const base = folderPath ? `${folderPath}/` : '';
  const candidatePath = `${base}${expectedMp3Name(station)}`;
  const url = `${candidatePath}?t=${Date.now()}`;
  const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Missing ${describeExpectedFilePlain(station)}`);
  }
  return { url, origin: candidatePath };
}

export async function loadStationFromLibrary(station, folderPath) {
  const resolved = await resolveStationUrl(station, folderPath);
  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'metadata';
  audio.src = resolved.url;
  audio.load();
  await waitForMetadata(audio);

  return {
    audio,
    duration: audio.duration,
    source: 'library',
    origin: resolved.origin,
    objectUrl: null,
    note: 'MP3 stream',
    format: 'mp3',
  };
}

export async function scanLibrary(game, folderPath, onStatus) {
  const records = new Map();
  for (const station of game.stations) {
    try {
      const record = await loadStationFromLibrary(station, folderPath);
      records.set(station.id, record);
      onStatus?.({
        station,
        state: 'valid',
        message: `Loaded ${expectedMp3Name(station)} (${formatDuration(record.duration)})`,
      });
    } catch (error) {
      onStatus?.({
        station,
        state: 'missing',
        message: `Missing ${describeExpectedFilePathsPlain(station, folderPath)}`,
        error,
      });
    }
  }
  return records;
}
