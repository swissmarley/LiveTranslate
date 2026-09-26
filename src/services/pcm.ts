/**
 * PCM helpers for streaming microphone audio to ElevenLabs Scribe Realtime, which expects
 * 16 kHz mono signed 16-bit little-endian samples, base64-encoded.
 */

export const STT_SAMPLE_RATE = 16_000;

/** Converts a captured buffer (interleaved when multi-channel) to mono Int16 samples. */
export function toMonoInt16(
  data: ArrayBuffer,
  encoding: 'int16' | 'float32',
  channels: number
): Int16Array {
  const channelCount = Math.max(1, Math.floor(channels));
  if (encoding === 'int16') {
    const samples = new Int16Array(data, 0, Math.floor(data.byteLength / 2));
    if (channelCount === 1) return samples;
    const frames = Math.floor(samples.length / channelCount);
    const mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < channelCount; c++) sum += samples[i * channelCount + c];
      mono[i] = Math.round(sum / channelCount);
    }
    return mono;
  }
  const floats = new Float32Array(data, 0, Math.floor(data.byteLength / 4));
  const frames = Math.floor(floats.length / channelCount);
  const mono = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channelCount; c++) sum += floats[i * channelCount + c];
    const value = Math.max(-1, Math.min(1, sum / channelCount));
    mono[i] = Math.round(value < 0 ? value * 32768 : value * 32767);
  }
  return mono;
}

/**
 * Streaming sample-rate converter. Downsampling averages the input samples around each
 * output position (a simple anti-aliasing box filter, plenty for speech recognition);
 * upsampling interpolates linearly. State carries across calls so chunk boundaries are seamless.
 */
export class Resampler {
  readonly fromRate: number;
  readonly toRate: number;
  private readonly step: number;
  private carry = new Int16Array(0);
  private position = 0;

  constructor(fromRate: number, toRate: number = STT_SAMPLE_RATE) {
    this.fromRate = fromRate;
    this.toRate = toRate;
    this.step = fromRate / toRate;
  }

  process(input: Int16Array): Int16Array {
    if (this.fromRate === this.toRate) return input;
    const src = this.carry.length ? concat(this.carry, input) : input;
    const step = this.step;
    const down = step > 1;
    const half = step / 2;
    const out = new Int16Array(Math.ceil(src.length / step) + 2);
    let count = 0;
    let pos = this.position;

    for (;;) {
      if (down) {
        const start = Math.max(0, Math.floor(pos - half));
        const end = Math.ceil(pos + half);
        if (end > src.length) break;
        let sum = 0;
        for (let k = start; k < end; k++) sum += src[k];
        out[count++] = Math.round(sum / (end - start));
      } else {
        const i = Math.floor(pos);
        if (i + 1 >= src.length) break;
        const frac = pos - i;
        out[count++] = Math.round(src[i] + (src[i + 1] - src[i]) * frac);
      }
      pos += step;
    }

    const keep = Math.max(0, Math.floor(down ? pos - half : pos));
    this.carry = src.slice(keep);
    this.position = pos - keep;
    return out.slice(0, count);
  }
}

function concat(a: Int16Array, b: Int16Array): Int16Array {
  const joined = new Int16Array(a.length + b.length);
  joined.set(a, 0);
  joined.set(b, a.length);
  return joined;
}

/** Collects samples into fixed-size chunks (Scribe wants 0.1–1 s per message). */
export class PcmChunker {
  private parts: Int16Array[] = [];
  private length = 0;
  private readonly chunkSamples: number;

  constructor(chunkSamples: number) {
    this.chunkSamples = chunkSamples;
  }

  /** Adds samples; returns a chunk once enough have accumulated. */
  push(samples: Int16Array): Int16Array | null {
    if (samples.length) {
      this.parts.push(samples.slice());
      this.length += samples.length;
    }
    return this.length >= this.chunkSamples ? this.flush() : null;
  }

  /** Returns whatever is buffered (or null when empty). */
  flush(): Int16Array | null {
    if (!this.length) return null;
    const out = new Int16Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    this.parts = [];
    this.length = 0;
    return out;
  }
}

/** Maps a dBFS value to 0–1 for UI meters (-55 dB and below → 0, -10 dB → 1). */
export function dbToLevel(db: number | null | undefined): number {
  if (db === null || db === undefined || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db + 55) / 45));
}

/** Loudness (0–1) of a block of samples, for the microphone animation. */
export function levelFromSamples(samples: Int16Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length) / 32768;
  return dbToLevel(20 * Math.log10(Math.max(rms, 1e-8)));
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const len = bytes.length;
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63] + BASE64[(n >> 6) & 63] + BASE64[n & 63]);
  }
  const rest = len - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    parts.push(BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63] + '==');
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    parts.push(BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63] + BASE64[(n >> 6) & 63] + '=');
  }
  return parts.join('');
}

export function int16ToBase64(samples: Int16Array): string {
  return bytesToBase64(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
}
