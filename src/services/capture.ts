/**
 * One microphone session, from tap to finished utterance(s).
 *
 * - LiveCapture streams PCM to Scribe v2 Realtime: words appear while the person speaks and
 *   Scribe's VAD decides when they are done.
 * - RecordedCapture records AAC, detects the end of speech from the level meter, then uploads
 *   the file to Scribe v2. Used where the live stream is unavailable (web, older runtimes).
 *
 * In continuous mode (Listen) both keep going and emit one segment per sentence/pause.
 */

import type { AudioRecorder, AudioStream, AudioStreamBuffer } from 'expo-audio';

import type { Language } from '@/lib/languages';

import { api, errorMessage } from './api-client';
import { enterRecordingMode } from './audio-session';
import { dbToLevel, levelFromSamples, Resampler, STT_SAMPLE_RATE, toMonoInt16 } from './pcm';
import { readRecording, type RecordingData } from './recording-file';
import { ScribeRealtime, type ScribeRealtimeError } from './scribe-realtime';
import { SilenceDetector } from './silence-detector';
import { takeSttToken } from './stt-token';

export type CaptureEnd =
  | { reason: 'done' }
  | { reason: 'no-speech' }
  | { reason: 'cancelled' }
  | { reason: 'error'; message: string };

export interface CaptureCallbacks {
  /** The microphone is live. */
  onListening: () => void;
  /** Live transcript of the current utterance ('' clears it). */
  onPartial: (text: string) => void;
  /** Input loudness 0–1, for the animation. */
  onLevel: (level: number) => void;
  /** A finished utterance. */
  onSegment: (text: string) => void;
  /** Recording finished; the audio is being transcribed. */
  onTranscribing: () => void;
  /** A problem that did not end the session (continuous mode). */
  onNotice: (message: string) => void;
  /** Called exactly once. */
  onEnd: (result: CaptureEnd) => void;
}

export interface CaptureOptions {
  language: Language;
  /** Silence that ends an utterance. */
  silenceSecs: number;
  continuous: boolean;
  callbacks: CaptureCallbacks;
}

export interface Capture {
  start(): Promise<void>;
  /** Finish now, keeping what was said. */
  stop(): void;
  /** Abort and discard. */
  cancel(): void;
  handleBuffer?(buffer: AudioStreamBuffer): void;
}

const NO_SPEECH_TIMEOUT_MS = 12_000;
const MAX_UTTERANCE_MS = 60_000;
const MAX_CONTINUOUS_MS = 30 * 60_000;
/** How long to wait for Scribe's final transcript after a manual stop. */
const COMMIT_GRACE_MS = 2_500;
const LEVEL_INTERVAL_MS = 70;

export class LiveCapture implements Capture {
  private readonly stream: AudioStream;
  private readonly options: CaptureOptions;
  private scribe: ScribeRealtime | null = null;
  private resampler: Resampler | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private lastPartial = '';
  private heardSpeech = false;
  private streaming = false;
  private stopping = false;
  private ended = false;
  private lastLevelAt = 0;

  constructor(stream: AudioStream, options: CaptureOptions) {
    this.stream = stream;
    this.options = options;
  }

  async start(): Promise<void> {
    try {
      await enterRecordingMode();
      const token = await takeSttToken();
      if (this.ended) return;
      this.scribe = new ScribeRealtime({
        token,
        languageCode: this.options.language.stt,
        vadSilenceSecs: this.options.silenceSecs,
        onPartial: (text) => this.handlePartial(text),
        onCommitted: (text) => this.handleCommitted(text),
        onError: (error) => this.handleError(error),
      });
      this.scribe.connect();
      await this.stream.start();
      this.streaming = true;
    } catch (error) {
      this.release();
      throw error;
    }
    if (this.ended) {
      this.release();
      return;
    }
    this.options.callbacks.onListening();
    if (!this.options.continuous) {
      this.timers.push(
        setTimeout(() => {
          if (!this.heardSpeech) this.end({ reason: 'no-speech' });
        }, NO_SPEECH_TIMEOUT_MS)
      );
    }
    this.timers.push(
      setTimeout(() => this.stop(), this.options.continuous ? MAX_CONTINUOUS_MS : MAX_UTTERANCE_MS)
    );
  }

  handleBuffer(buffer: AudioStreamBuffer): void {
    if (this.ended || this.stopping || !this.scribe) return;
    const mono = toMonoInt16(buffer.data, 'int16', buffer.channels);
    const rate = buffer.sampleRate > 0 ? buffer.sampleRate : STT_SAMPLE_RATE;
    if (!this.resampler || this.resampler.fromRate !== rate) {
      this.resampler = new Resampler(rate, STT_SAMPLE_RATE);
    }
    this.scribe.sendAudio(this.resampler.process(mono));
    const now = Date.now();
    if (now - this.lastLevelAt >= LEVEL_INTERVAL_MS) {
      this.lastLevelAt = now;
      this.options.callbacks.onLevel(levelFromSamples(mono));
    }
  }

  stop(): void {
    if (this.ended || this.stopping) return;
    this.stopping = true;
    this.stopStream();
    if (!this.scribe) {
      this.end({ reason: 'cancelled' });
      return;
    }
    this.scribe.commit();
    this.timers.push(
      setTimeout(() => {
        if (this.ended) return;
        // Scribe did not answer in time — use the last partial transcript.
        const text = this.lastPartial.trim();
        if (text) this.options.callbacks.onSegment(text);
        this.end(text || this.heardSpeech ? { reason: 'done' } : { reason: 'no-speech' });
      }, COMMIT_GRACE_MS)
    );
  }

  cancel(): void {
    this.end({ reason: 'cancelled' });
  }

  private handlePartial(text: string): void {
    if (this.ended) return;
    if (text.trim()) this.heardSpeech = true;
    this.lastPartial = text;
    this.options.callbacks.onPartial(text);
  }

  private handleCommitted(text: string): void {
    if (this.ended) return;
    const finalText = text.trim() || (this.stopping ? this.lastPartial.trim() : '');
    this.lastPartial = '';
    this.options.callbacks.onPartial('');
    if (finalText) {
      this.heardSpeech = true;
      this.options.callbacks.onSegment(finalText);
    }
    if (this.stopping) {
      this.end(this.heardSpeech ? { reason: 'done' } : { reason: 'no-speech' });
    } else if (!this.options.continuous && finalText) {
      // One utterance per tap in conversation mode.
      this.end({ reason: 'done' });
    }
  }

  private handleError(error: ScribeRealtimeError): void {
    if (this.ended) return;
    const text = this.lastPartial.trim();
    if (text) {
      // Keep what was already recognized rather than losing it.
      this.options.callbacks.onSegment(text);
      this.end({ reason: 'done' });
    } else if (this.stopping) {
      this.end(this.heardSpeech ? { reason: 'done' } : { reason: 'no-speech' });
    } else if (error.type === 'insufficient_audio_activity') {
      this.end({ reason: 'no-speech' });
    } else {
      this.end({ reason: 'error', message: error.message });
    }
  }

  private stopStream(): void {
    if (!this.streaming) return;
    this.streaming = false;
    try {
      this.stream.stop();
    } catch {
      // already stopped
    }
  }

  private release(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.stopStream();
    this.scribe?.close();
    this.scribe = null;
  }

  private end(result: CaptureEnd): void {
    if (this.ended) return;
    this.ended = true;
    this.release();
    this.options.callbacks.onLevel(0);
    this.options.callbacks.onEnd(result);
  }
}

export class RecordedCapture implements Capture {
  private readonly recorder: AudioRecorder;
  private readonly options: CaptureOptions;
  private detector: SilenceDetector | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private segmentStartedAt = 0;
  private busy = false;
  private stopping = false;
  private ended = false;
  private cancelled = false;
  private delivered = false;

  constructor(recorder: AudioRecorder, options: CaptureOptions) {
    this.recorder = recorder;
    this.options = options;
  }

  async start(): Promise<void> {
    await enterRecordingMode();
    await this.beginSegment();
    if (!this.ended) this.options.callbacks.onListening();
  }

  stop(): void {
    if (this.ended || this.stopping) return;
    this.stopping = true;
    if (!this.busy) void this.finishSegment(true, true);
  }

  cancel(): void {
    this.cancelled = true;
    this.end({ reason: 'cancelled' });
  }

  private async beginSegment(): Promise<void> {
    await this.recorder.prepareToRecordAsync();
    if (this.ended) return;
    this.recorder.record();
    this.segmentStartedAt = Date.now();
    const { continuous, silenceSecs } = this.options;
    this.detector = new SilenceDetector({
      silenceMs: silenceSecs * 1000,
      noSpeechTimeoutMs: continuous ? 20_000 : 8_000,
      maxDurationMs: continuous ? 30_000 : MAX_UTTERANCE_MS,
    });
    this.ticker = setInterval(() => this.tick(), 100);
  }

  private tick(): void {
    if (this.ended || this.busy || !this.detector) return;
    const status = this.recorder.getStatus();
    const elapsed = Date.now() - this.segmentStartedAt;
    if (status.metering === undefined) {
      // No level meter on this device: rely on the stop button and the length cap.
      if (elapsed >= MAX_UTTERANCE_MS) void this.finishSegment(true, true);
      return;
    }
    this.options.callbacks.onLevel(dbToLevel(status.metering));
    const decision = this.detector.push(status.metering, elapsed);
    if (decision !== 'continue') void this.finishSegment(decision !== 'no-speech');
  }

  /** Ends the current recording and transcribes it when it contains speech. */
  private async finishSegment(keep: boolean, manual = false): Promise<void> {
    if (this.busy || this.ended) return;
    this.busy = true;
    this.clearTicker();
    const elapsed = Date.now() - this.segmentStartedAt;
    const heard = this.detector?.heardSpeech ?? false;
    try {
      await this.recorder.stop();
    } catch {
      // not recording
    }
    const uri = this.recorder.uri;
    let recording: RecordingData | null = null;
    if (uri && keep && (heard || (manual && elapsed > 600))) {
      recording = await readRecording(uri).catch(() => null);
    }
    if (this.ended) return;

    if (this.options.continuous && !this.stopping) {
      // Keep listening while the previous stretch is transcribed.
      if (recording) void this.transcribe(recording);
      try {
        await this.beginSegment();
      } catch (error) {
        this.end({ reason: 'error', message: errorMessage(error) });
        return;
      }
      this.busy = false;
      return;
    }

    if (!recording) {
      this.end(this.delivered ? { reason: 'done' } : { reason: 'no-speech' });
      return;
    }
    this.options.callbacks.onLevel(0);
    this.options.callbacks.onTranscribing();
    try {
      const delivered = await this.transcribe(recording, true);
      this.end(delivered || this.delivered ? { reason: 'done' } : { reason: 'no-speech' });
    } catch (error) {
      this.end({ reason: 'error', message: errorMessage(error) });
    }
  }

  /** Returns whether text was delivered. Errors are thrown when `rethrow` is set. */
  private async transcribe(recording: RecordingData, rethrow = false): Promise<boolean> {
    try {
      const { text } = await api.transcribe(
        recording.bytes,
        recording.contentType,
        this.options.language.id
      );
      if (!text || this.cancelled) return false;
      this.delivered = true;
      this.options.callbacks.onSegment(text);
      return true;
    } catch (error) {
      if (rethrow) throw error;
      if (!this.cancelled) this.options.callbacks.onNotice(errorMessage(error));
      return false;
    }
  }

  private clearTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private end(result: CaptureEnd): void {
    if (this.ended) return;
    this.ended = true;
    this.clearTicker();
    if (this.recorder.isRecording) this.recorder.stop().catch(() => {});
    this.options.callbacks.onLevel(0);
    this.options.callbacks.onEnd(result);
  }
}
