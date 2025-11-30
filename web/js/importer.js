// Handles communication with the Python dev server and importer UI wiring.
import { state } from './state.js';
import { escapeHtml } from './library.js';

const IMPORT_START_ENDPOINT = '/api/import-gta3-start';
const IMPORT_STATUS_ENDPOINT = '/api/import-gta3-status';
const IMPORT_BROWSE_ENDPOINT = '/api/import-gta3-browse';

let elements = null;
let progressTimer = null;

export function initImporter(domElements) {
  elements = domElements;
}

export function setImportPath(path) {
  state.importPath = path || '';
  if (!elements) return;
  const { input, submit, feedback, progress } = elements;
  if (input) input.value = state.importPath;
  if (submit) submit.disabled = !state.importPath;
  if (feedback) {
    if (state.importPath) {
      feedback.dataset.state = 'pending';
      feedback.innerHTML = `Ready to import from <code>${escapeHtml(state.importPath)}</code>. Click <strong>Import and convert</strong>.`;
    } else {
      feedback.dataset.state = 'waiting';
      feedback.innerHTML = 'Browse to your GTA III game directory before importing.';
    }
  }
  if (progress) {
    progress.hidden = true;
    progress.value = 0;
  }
}

export async function browseForDirectory() {
  if (!elements) return;
  const { browse, feedback } = elements;
  if (browse) browse.disabled = true;
  try {
    const response = await fetch(IMPORT_BROWSE_ENDPOINT, { method: 'POST' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json();
    if (data.cancelled) return;
    if (!data.path) throw new Error('No path returned');
    setImportPath(data.path);
  } catch (error) {
    if (feedback) {
      feedback.dataset.state = 'error';
      feedback.textContent = `Browse failed: ${error instanceof Error ? error.message : error}`;
    }
  } finally {
    if (browse) browse.disabled = false;
  }
}

export async function startImport() {
  if (!state.importPath || !elements) return;
  const { submit, feedback, progress } = elements;
  submit.disabled = true;
  if (progress) {
    progress.hidden = false;
    progress.value = 0;
  }
  try {
    const params = new URLSearchParams({ gta3_dir: state.importPath });
    const response = await fetch(`${IMPORT_START_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    if (!payload.job?.id) throw new Error('Missing job id');
    state.importJobId = payload.job.id;
    feedback.dataset.state = 'pending';
    feedback.textContent = 'Import running…';
    state.importLoadedStems.clear();
    pollImport();
  } catch (error) {
    feedback.dataset.state = 'error';
    feedback.textContent = `Import failed to start: ${error instanceof Error ? error.message : error}`;
    submit.disabled = false;
  }
}

export function attachAutoStartFromQuery(currentGameId) {
  const params = new URLSearchParams(window.location.search);
  const incomingPath = params.get('gta3_dir');
  if (incomingPath && currentGameId === 'gta3') {
    setImportPath(incomingPath);
    startImport();
  }
}

async function pollImport() {
  if (!state.importJobId || !elements) return;
  const { feedback, progress } = elements;
  try {
    // Poll the backend job for progress so the UI can reflect which stations are ready.
    const params = new URLSearchParams({ job: state.importJobId });
    const response = await fetch(`${IMPORT_STATUS_ENDPOINT}?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    const job = payload.job;
    const total = job.total || job.summary?.expected || 9;
    const done = job.progress || job.summary?.found || 0;
    const percent = Math.min(100, Math.round((done / total) * 100));
    if (progress) {
      progress.hidden = false;
      progress.value = percent;
    }
    if (feedback) {
      const base = `Importing… ${percent}%`;
      const summaryText = formatSummary(job.summary || job.partial_summary || {});
      feedback.dataset.state = job.status === 'failed' ? 'error' : 'pending';
      feedback.textContent = summaryText ? `${base} • ${summaryText}` : base;
    }
    if (job.records) {
      for (const [stem, record] of Object.entries(job.records)) {
        if (!state.importLoadedStems.has(stem) && record.status && record.status !== 'missing') {
          state.importLoadedStems.add(stem);
          window.dispatchEvent(new CustomEvent('station-ready', { detail: { stem } }));
        }
      }
    }
    if (job.status === 'completed' || job.status === 'failed') {
      state.importJobId = null;
      if (feedback && job.status === 'completed') {
        feedback.dataset.state = 'valid';
        feedback.textContent = 'Import complete.';
      }
      if (progress) progress.value = 100;
      return;
    }
  } catch (error) {
    if (feedback) {
      feedback.dataset.state = 'error';
      feedback.textContent = `Import polling failed: ${error instanceof Error ? error.message : error}`;
    }
    state.importJobId = null;
    return;
  }
  progressTimer = window.setTimeout(pollImport, 1000);
}

function formatSummary(summary) {
  const pieces = [];
  if (summary.found) pieces.push(`Found ${summary.found}`);
  if (summary.converted) pieces.push(`Converted ${summary.converted}`);
  if (summary.copied) pieces.push(`Copied ${summary.copied}`);
  if (summary.missing?.length) pieces.push(`Missing ${summary.missing.length}`);
  return pieces.join(' • ');
}

export function teardownImporter() {
  if (progressTimer) {
    window.clearTimeout(progressTimer);
    progressTimer = null;
  }
  state.importJobId = null;
}
