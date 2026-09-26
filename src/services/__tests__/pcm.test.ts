/// <reference types="node" />
import {
  bytesToBase64,
  dbToLevel,
  int16ToBase64,
  levelFromSamples,
  PcmChunker,
  Resampler,
  toMonoInt16,
} from '../pcm';

describe('bytesToBase64', () => {
  it('matches Node for every padding case', () => {
    for (let length = 0; length <= 12; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 0xff);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });

  it('matches Node for random data', () => {
    const bytes = Uint8Array.from({ length: 4001 }, () => Math.floor(Math.random() * 256));
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('encodes Int16 views without leaking neighbouring bytes', () => {
    const backing = new Int16Array([1, -2, 3, -4]);
    const view = backing.subarray(1, 3);
    expect(int16ToBase64(view)).toBe(Buffer.from(new Uint8Array(backing.buffer, 2, 4)).toString('base64'));
  });
});

describe('toMonoInt16', () => {
  it('passes mono int16 through', () => {
    const input = new Int16Array([1, 2, 3]);
    expect(Array.from(toMonoInt16(input.buffer, 'int16', 1))).toEqual([1, 2, 3]);
  });

  it('averages interleaved stereo', () => {
    const input = new Int16Array([100, 300, -100, -300]);
    expect(Array.from(toMonoInt16(input.buffer, 'int16', 2))).toEqual([200, -200]);
  });

  it('scales and clamps float32', () => {
    const input = new Float32Array([0, 1, -1, 2, -2, 0.5]);
    expect(Array.from(toMonoInt16(input.buffer, 'float32', 1))).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });
});

describe('Resampler', () => {
  const sine = (rate: number, seconds: number, freq: number) =>
    Int16Array.from({ length: rate * seconds }, (_, i) => Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000));

  const run = (resampler: Resampler, input: Int16Array, chunk: number) => {
    const parts: number[] = [];
    for (let i = 0; i < input.length; i += chunk) parts.push(...resampler.process(input.subarray(i, i + chunk)));
    return Int16Array.from(parts);
  };

  const zeroCrossings = (samples: Int16Array) => {
    let count = 0;
    for (let i = 1; i < samples.length; i++) if ((samples[i - 1] < 0) !== (samples[i] < 0)) count++;
    return count;
  };

  it.each([
    [48000, 480],
    [44100, 441],
    [22050, 256],
    [8000, 160],
  ])('converts %i Hz to 16 kHz across chunk boundaries', (rate, chunk) => {
    const input = sine(rate, 1, 440);
    const output = run(new Resampler(rate, 16000), input, chunk);
    expect(Math.abs(output.length - 16000)).toBeLessThanOrEqual(3);
    // Same pitch: a 440 Hz tone crosses zero ~880 times per second.
    expect(Math.abs(zeroCrossings(output) - 880)).toBeLessThanOrEqual(4);
  });

  it('keeps a constant signal constant', () => {
    const output = run(new Resampler(48000, 16000), new Int16Array(4800).fill(1234), 333);
    expect(new Set(output)).toEqual(new Set([1234]));
  });

  it('returns the input untouched at the target rate', () => {
    const input = new Int16Array([1, 2, 3]);
    expect(new Resampler(16000, 16000).process(input)).toBe(input);
  });
});

describe('PcmChunker', () => {
  it('emits once enough samples have accumulated and flushes the rest', () => {
    const chunker = new PcmChunker(4);
    expect(chunker.push(new Int16Array([1, 2]))).toBeNull();
    expect(Array.from(chunker.push(new Int16Array([3, 4, 5]))!)).toEqual([1, 2, 3, 4, 5]);
    expect(chunker.flush()).toBeNull();
    chunker.push(new Int16Array([6]));
    expect(Array.from(chunker.flush()!)).toEqual([6]);
  });
});

describe('levels', () => {
  it('maps dBFS to 0–1', () => {
    expect(dbToLevel(-160)).toBe(0);
    expect(dbToLevel(undefined)).toBe(0);
    expect(dbToLevel(-10)).toBe(1);
    expect(dbToLevel(-32.5)).toBeCloseTo(0.5);
  });

  it('measures loudness of samples', () => {
    expect(levelFromSamples(new Int16Array(100))).toBe(0);
    expect(levelFromSamples(new Int16Array(100).fill(32000))).toBe(1);
  });
});
