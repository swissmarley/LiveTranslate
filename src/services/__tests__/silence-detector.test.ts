import { SilenceDetector, type SilenceDecision } from '../silence-detector';

/** Feeds one metering value per 100 ms and returns the first non-"continue" decision. */
function feed(detector: SilenceDetector, levels: number[]): { decision: SilenceDecision; atMs: number } {
  for (let i = 0; i < levels.length; i++) {
    const decision = detector.push(levels[i], i * 100);
    if (decision !== 'continue') return { decision, atMs: i * 100 };
  }
  return { decision: 'continue', atMs: levels.length * 100 };
}

const quiet = (ms: number) => Array<number>(ms / 100).fill(-58);
const loud = (ms: number) => Array<number>(ms / 100).fill(-22);

describe('SilenceDetector', () => {
  it('ends the utterance after the configured silence', () => {
    const detector = new SilenceDetector({ silenceMs: 1000 });
    const result = feed(detector, [...quiet(300), ...loud(1500), ...quiet(2000)]);
    expect(result.decision).toBe('speech-ended');
    // Speech stops at 1800 ms; the end is declared ~1 s later.
    expect(result.atMs).toBeGreaterThanOrEqual(2700);
    expect(result.atMs).toBeLessThanOrEqual(2900);
    expect(detector.heardSpeech).toBe(true);
  });

  it('gives up when nobody speaks', () => {
    const result = feed(new SilenceDetector({ silenceMs: 1000, noSpeechTimeoutMs: 3000 }), quiet(5000));
    expect(result).toEqual({ decision: 'no-speech', atMs: 3000 });
  });

  it('ignores a short noise before speech', () => {
    const detector = new SilenceDetector({ silenceMs: 800, noSpeechTimeoutMs: 3000 });
    const result = feed(detector, [...quiet(300), ...loud(100), ...quiet(4000)]);
    expect(result.decision).toBe('no-speech');
    expect(detector.heardSpeech).toBe(false);
  });

  it('caps the utterance length', () => {
    const result = feed(new SilenceDetector({ silenceMs: 1000, maxDurationMs: 2000 }), loud(5000));
    expect(result).toEqual({ decision: 'max-duration', atMs: 2000 });
  });

  it('copes with speech that starts during calibration', () => {
    const detector = new SilenceDetector({ silenceMs: 1000 });
    const result = feed(detector, [...loud(1500), ...quiet(2000)]);
    expect(result.decision).toBe('speech-ended');
    expect(detector.speechThreshold).toBeLessThanOrEqual(-30);
  });
});
