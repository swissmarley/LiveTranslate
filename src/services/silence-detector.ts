/**
 * End-of-utterance detection from recorder metering (dBFS), used by the "standard"
 * record-then-transcribe mode. Live mode relies on Scribe's server-side VAD instead.
 */

export interface SilenceDetectorOptions {
  /** Quiet time after speech that ends the utterance. */
  silenceMs: number;
  /** Loud time needed before we believe someone started speaking. */
  minSpeechMs?: number;
  /** Give up when nobody speaks for this long. */
  noSpeechTimeoutMs?: number;
  /** Hard cap for one utterance. */
  maxDurationMs?: number;
  /** dB above the measured noise floor that counts as speech. */
  marginDb?: number;
  /** Time at the start used to measure the noise floor. */
  calibrationMs?: number;
}

export type SilenceDecision = 'continue' | 'speech-ended' | 'no-speech' | 'max-duration';

const SILENT_DB = -160;

export class SilenceDetector {
  private readonly options: Required<SilenceDetectorOptions>;
  private readonly calibration: number[] = [];
  private threshold: number | null = null;
  private lastElapsed: number | null = null;
  private loudMs = 0;
  private quietMs = 0;
  private speaking = false;

  constructor(options: SilenceDetectorOptions) {
    this.options = {
      minSpeechMs: 250,
      noSpeechTimeoutMs: 8_000,
      maxDurationMs: 60_000,
      marginDb: 10,
      calibrationMs: 250,
      ...options,
    };
  }

  /** True once speech has been detected in this utterance. */
  get heardSpeech(): boolean {
    return this.speaking;
  }

  /** The dBFS level currently treated as speech (null while calibrating). */
  get speechThreshold(): number | null {
    return this.threshold;
  }

  push(meteringDb: number | null | undefined, elapsedMs: number): SilenceDecision {
    const db =
      meteringDb === null || meteringDb === undefined || !Number.isFinite(meteringDb)
        ? SILENT_DB
        : meteringDb;
    const dt = this.lastElapsed === null ? 0 : Math.max(0, elapsedMs - this.lastElapsed);
    this.lastElapsed = elapsedMs;

    if (elapsedMs >= this.options.maxDurationMs) return 'max-duration';

    if (this.threshold === null) {
      if (elapsedMs < this.options.calibrationMs) {
        this.calibration.push(db);
        return 'continue';
      }
      this.threshold = computeThreshold(this.calibration, this.options.marginDb);
    }

    if (db >= this.threshold) {
      this.loudMs += dt;
      this.quietMs = 0;
      if (this.loudMs >= this.options.minSpeechMs) this.speaking = true;
    } else {
      this.quietMs += dt;
      // Short noises before speech (a cough, a tap) should not add up to "speech".
      if (!this.speaking) this.loudMs = Math.max(0, this.loudMs - dt);
    }

    if (this.speaking && this.quietMs >= this.options.silenceMs) return 'speech-ended';
    if (!this.speaking && elapsedMs >= this.options.noSpeechTimeoutMs) return 'no-speech';
    return 'continue';
  }
}

function computeThreshold(samples: number[], marginDb: number): number {
  const audible = samples.filter((db) => db > SILENT_DB).sort((a, b) => a - b);
  const median = audible.length ? audible[Math.floor(audible.length / 2)] : -60;
  // If the speaker started talking during calibration the "floor" is really speech, so cap it.
  const floor = Math.min(median, -40);
  // Never demand more than -30 dB (a voice across a table) nor accept less than -50 dB.
  return Math.min(-30, Math.max(-50, floor + marginDb));
}
