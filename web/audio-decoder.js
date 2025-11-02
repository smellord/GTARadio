const RIFF_HEADER = 0x52494646; // "RIFF"
const WAVE_HEADER = 0x57415645; // "WAVE"
const FMT_CHUNK = 0x666d7420; // "fmt "
const DATA_CHUNK = 0x64617461; // "data"

const AUDIO_FORMAT_PCM = 0x0001;
const AUDIO_FORMAT_IMA_ADPCM = 0x0011;

const IMA_INDEX_TABLE = [
  -1, -1, -1, -1, 2, 4, 6, 8,
  -1, -1, -1, -1, 2, 4, 6, 8,
];

const IMA_STEP_TABLE = [
   7,   8,   9,  10,  11,  12,  13,  14,
  16,  17,  19,  21,  23,  25,  28,  31,
  34,  37,  41,  45,  50,  55,  60,  66,
  73,  80,  88,  97, 107, 118, 130, 143,
 157, 173, 190, 209, 230, 253, 279, 307,
 337, 371, 408, 449, 494, 544, 598, 658,
 724, 796, 876, 963, 1060, 1166, 1282, 1411,
 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024,
 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
 32767,
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const readFourCC = (view, offset) =>
  view.getUint32(offset, false); // big-endian for ASCII comparisons

export function parseWavHeader(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 12) {
    throw new Error("File is too small to be a valid WAV");
  }

  if (view.getUint32(0, false) !== RIFF_HEADER || view.getUint32(8, false) !== WAVE_HEADER) {
    throw new Error("WAV header not found");
  }

  let offset = 12;
  let fmt = null;
  let dataOffset = null;
  let dataSize = null;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readFourCC(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > view.byteLength) {
      break;
    }

    if (chunkId === FMT_CHUNK) {
      const audioFormat = view.getUint16(chunkStart, true);
      const numChannels = view.getUint16(chunkStart + 2, true);
      const sampleRate = view.getUint32(chunkStart + 4, true);
      const byteRate = view.getUint32(chunkStart + 8, true);
      const blockAlign = view.getUint16(chunkStart + 12, true);
      const bitsPerSample = view.getUint16(chunkStart + 14, true);
      let cbSize = 0;
      let samplesPerBlock = null;

      if (chunkSize > 16) {
        cbSize = view.getUint16(chunkStart + 16, true);
        if (audioFormat === AUDIO_FORMAT_IMA_ADPCM && cbSize >= 2) {
          samplesPerBlock = view.getUint16(chunkStart + 18, true);
        }
      }

      fmt = {
        audioFormat,
        numChannels,
        sampleRate,
        byteRate,
        blockAlign,
        bitsPerSample,
        cbSize,
        samplesPerBlock,
      };
    } else if (chunkId === DATA_CHUNK) {
      dataOffset = chunkStart;
      dataSize = chunkSize;
    }

    offset = chunkEnd + (chunkSize % 2 === 1 ? 1 : 0);
  }

  if (!fmt) {
    throw new Error("fmt chunk not found in WAV");
  }

  if (dataOffset == null || dataSize == null) {
    throw new Error("data chunk not found in WAV");
  }

  const duration = fmt.audioFormat === AUDIO_FORMAT_PCM && fmt.byteRate > 0
    ? dataSize / fmt.byteRate
    : null;

  return {
    ...fmt,
    dataOffset,
    dataSize,
    duration,
  };
}

function decodeImaNibble(nibble, predictor, stepIndex) {
  let step = IMA_STEP_TABLE[stepIndex];
  let diff = step >> 3;
  if (nibble & 1) diff += step >> 2;
  if (nibble & 2) diff += step >> 1;
  if (nibble & 4) diff += step;

  if (nibble & 8) {
    predictor -= diff;
  } else {
    predictor += diff;
  }

  predictor = clamp(predictor, -32768, 32767);
  stepIndex = clamp(stepIndex + IMA_INDEX_TABLE[nibble & 0x0f], 0, 88);

  return { sample: predictor, predictor, stepIndex };
}

export function decodeImaAdpcmToPcm(arrayBuffer, header) {
  const { numChannels, blockAlign, dataOffset, dataSize, samplesPerBlock } = header;
  const view = new DataView(arrayBuffer);
  const dataEnd = dataOffset + dataSize;

  const channelSamples = Array.from({ length: numChannels }, () => []);

  let offset = dataOffset;
  while (offset < dataEnd) {
    const remaining = dataEnd - offset;
    const blockSize = Math.min(blockAlign, remaining);

    if (blockSize <= 4 * numChannels) {
      break;
    }

    const bytesPerChannel = Math.floor((blockSize - 4 * numChannels) / numChannels);
    if (bytesPerChannel <= 0) {
      break;
    }

    const blockSamples = samplesPerBlock || (1 + bytesPerChannel * 2);

    const predictors = new Array(numChannels);
    const indices = new Array(numChannels);

    for (let channel = 0; channel < numChannels; channel += 1) {
      const headerOffset = offset + channel * 4;
      if (headerOffset + 4 > dataEnd) {
        predictors[channel] = 0;
        indices[channel] = 0;
        continue;
      }
      const predictor = view.getInt16(headerOffset, true);
      const index = clamp(view.getUint8(headerOffset + 2), 0, 88);
      predictors[channel] = predictor;
      indices[channel] = index;
      channelSamples[channel].push(predictor);
    }

    const dataStart = offset + 4 * numChannels;

    for (let channel = 0; channel < numChannels; channel += 1) {
      let predictor = predictors[channel];
      let stepIndex = indices[channel];
      const channelOffset = dataStart + channel * bytesPerChannel;
      let written = 1; // predictor already stored

      for (let i = 0; i < bytesPerChannel && written < blockSamples; i += 1) {
        if (channelOffset + i >= dataEnd) {
          break;
        }
        const byte = view.getUint8(channelOffset + i);
        const low = byte & 0x0f;
        const high = byte >> 4;

        const first = decodeImaNibble(low, predictor, stepIndex);
        predictor = first.predictor;
        stepIndex = first.stepIndex;
        channelSamples[channel].push(first.sample);
        written += 1;
        if (written >= blockSamples) break;

        const second = decodeImaNibble(high, predictor, stepIndex);
        predictor = second.predictor;
        stepIndex = second.stepIndex;
        channelSamples[channel].push(second.sample);
        written += 1;
      }
    }

    offset += blockSize;
    if (blockSize % 2 === 1) {
      offset += 1;
    }
  }

  const totalFrames = Math.min(...channelSamples.map((samples) => samples.length));
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) {
    throw new Error("ADPCM decode produced no audio frames");
  }

  const interleaved = new Int16Array(totalFrames * numChannels);
  for (let frame = 0; frame < totalFrames; frame += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = channelSamples[channel][frame] ?? 0;
      interleaved[frame * numChannels + channel] = sample;
    }
  }

  const pcmBuffer = createPcmWav(interleaved, header.sampleRate, numChannels);
  const duration = totalFrames / header.sampleRate;
  return { buffer: pcmBuffer, duration, frames: totalFrames };
}

function createPcmWav(samples, sampleRate, numChannels) {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeFourCC(view, 0, RIFF_HEADER);
  view.setUint32(4, 36 + dataSize, true);
  writeFourCC(view, 8, WAVE_HEADER);
  writeFourCC(view, 12, FMT_CHUNK);
  view.setUint32(16, 16, true); // fmt chunk length
  view.setUint16(20, AUDIO_FORMAT_PCM, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeFourCC(view, 36, DATA_CHUNK);
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return buffer;
}

function writeFourCC(view, offset, value) {
  view.setUint32(offset, value, false);
}

export function preparePlayableAudio(arrayBuffer, { allowAdpcmDecode = false } = {}) {
  const header = parseWavHeader(arrayBuffer);

  if (header.audioFormat === AUDIO_FORMAT_IMA_ADPCM) {
    if (!allowAdpcmDecode) {
      throw new Error("GTA III IMA ADPCM detected but decoding is disabled for this game");
    }
    const decoded = decodeImaAdpcmToPcm(arrayBuffer, header);
    return {
      blob: new Blob([decoded.buffer], { type: "audio/wav" }),
      note: `Decoded GTA III IMA ADPCM @ ${header.sampleRate} Hz`,
      format: "ima-adpcm",
      duration: decoded.duration,
      sampleRate: header.sampleRate,
    };
  }

  if (header.audioFormat === AUDIO_FORMAT_PCM) {
    return {
      blob: new Blob([arrayBuffer], { type: "audio/wav" }),
      note: `Uncompressed PCM @ ${header.sampleRate} Hz`,
      format: "pcm",
      duration: header.duration,
      sampleRate: header.sampleRate,
    };
  }

  throw new Error(`Unsupported WAV format 0x${header.audioFormat.toString(16)}`);
}

export const constants = {
  AUDIO_FORMAT_PCM,
  AUDIO_FORMAT_IMA_ADPCM,
};
