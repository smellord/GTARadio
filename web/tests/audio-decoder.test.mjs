import { preparePlayableAudio } from "../audio-decoder.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function writeFourCC(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function createTestAdpcmWav() {
  const sampleRate = 32000;
  const numChannels = 2;
  const samplesPerBlock = 4;
  const bytesPerChannel = Math.ceil((samplesPerBlock - 1) / 2);
  const dataBytes = bytesPerChannel * numChannels;
  const blockAlign = 4 * numChannels + dataBytes;
  const dataSize = blockAlign;
  const fmtChunkSize = 20;
  const fileSize = 12 + (8 + fmtChunkSize) + (8 + dataSize);
  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);

  writeFourCC(view, 0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeFourCC(view, 8, "WAVE");
  writeFourCC(view, 12, "fmt ");
  view.setUint32(16, fmtChunkSize, true);
  view.setUint16(20, 0x0011, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  const byteRate = Math.floor((sampleRate * blockAlign) / samplesPerBlock);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 4, true);
  view.setUint16(36, 2, true);
  view.setUint16(38, samplesPerBlock, true);

  const dataOffset = 12 + 8 + fmtChunkSize;
  writeFourCC(view, dataOffset, "data");
  view.setUint32(dataOffset + 4, dataSize, true);

  let offset = dataOffset + 8;
  for (let channel = 0; channel < numChannels; channel += 1) {
    view.setInt16(offset, channel === 0 ? 0 : 1000, true); // different predictors per channel
    view.setUint8(offset + 2, 0);
    view.setUint8(offset + 3, 0);
    offset += 4;
  }

  const dataStart = dataOffset + 8 + 4 * numChannels;
  let writeOffset = dataStart;
  const dataPattern = [0x00, 0x00, 0x10, 0x10];
  for (let i = 0; i < dataBytes; i += 1) {
    view.setUint8(writeOffset + i, dataPattern[i % dataPattern.length]);
  }

  return { arrayBuffer, samplesPerBlock, numChannels };
}

function createTestPcmWav() {
  const sampleRate = 8000;
  const numChannels = 1;
  const samples = 8;
  const bytesPerSample = 2;
  const dataSize = samples * numChannels * bytesPerSample;
  const fileSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);

  writeFourCC(view, 0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeFourCC(view, 8, "WAVE");
  writeFourCC(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 0x0001, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeFourCC(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    const sampleValue = i % 2 === 0 ? 1000 : -1000;
    view.setInt16(offset, sampleValue, true);
    offset += 2;
  }

  return arrayBuffer;
}

function parseBitsPerSample(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  return view.getUint16(34, true);
}

async function run() {
  const { arrayBuffer: adpcmBuffer, samplesPerBlock, numChannels } = createTestAdpcmWav();
  let threw = false;
  try {
    preparePlayableAudio(adpcmBuffer, { allowAdpcmDecode: false });
  } catch (error) {
    threw = true;
  }
  assert(threw, "Expected ADPCM decode to fail when disabled");

  const decoded = preparePlayableAudio(adpcmBuffer, { allowAdpcmDecode: true });
  assert(decoded.format === "ima-adpcm", "Unexpected format tag");
  assert(decoded.duration > 0, "Decoded audio should have a duration");
  assert(decoded.frames === samplesPerBlock, "Unexpected number of frames decoded");

  const pcmBuffer = await decoded.blob.arrayBuffer();
  assert(parseBitsPerSample(pcmBuffer) === 16, "Decoded PCM should be 16-bit");
  const samples = new Int16Array(pcmBuffer, 44);
  assert(samples.length >= samplesPerBlock * numChannels, "Decoded sample data is truncated");
  assert(samples[0] === 0, "Channel 0 predictor not preserved");
  assert(samples[1] === 1000, "Channel 1 predictor not preserved");

  const pcmSource = preparePlayableAudio(createTestPcmWav());
  assert(pcmSource.format === "pcm", "PCM source should stay PCM");

  console.log("audio-decoder tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
