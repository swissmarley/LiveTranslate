/**
 * Client for the ElevenLabs Scribe v2 Realtime WebSocket.
 * https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
 *
 * Audio goes up as base64 PCM chunks; Scribe answers with partial transcripts while the
 * person speaks and a committed transcript when its VAD detects the end of the utterance.
 */

import { int16ToBase64, PcmChunker, STT_SAMPLE_RATE } from './pcm';

const REALTIME_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const MODEL_ID = 'scribe_v2_realtime';
/** 250 ms of audio per message. */
const CHUNK_SAMPLES = STT_SAMPLE_RATE / 4;
/** Audio queued while the socket connects (~30 s). */
const MAX_QUEUED_MESSAGES = 120;

export interface WebSocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export class ScribeRealtimeError extends Error {
  readonly type: string;

  constructor(message: string, type: string) {
    super(message);
    this.name = 'ScribeRealtimeError';
    this.type = type;
  }
}

export interface ScribeRealtimeOptions {
  /** Single-use token minted by the server (/api/stt-token). */
  token: string;
  /** ISO 639-1 hint for the language being spoken. */
  languageCode?: string;
  /** Seconds of silence after which Scribe commits the transcript (0.3–3). */
  vadSilenceSecs: number;
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onError: (error: ScribeRealtimeError) => void;
  /** Injectable for tests. */
  createSocket?: (url: string) => WebSocketLike;
}

const ERROR_MESSAGES: Record<string, string> = {
  auth_error: 'Live speech recognition was not authorized. Check the ElevenLabs API key.',
  quota_exceeded: 'Your ElevenLabs quota is used up.',
  rate_limited: 'Too many live sessions at once. Please try again.',
  session_time_limit_exceeded: 'The live session reached its time limit.',
  insufficient_audio_activity: 'No speech was detected.',
  chunk_size_exceeded: 'Audio chunk too large.',
  transcriber_error: 'Speech recognition failed. Please try again.',
};

/** Message types that are informational and never end the session. */
const IGNORED_TYPES = new Set([
  'session_started',
  'committed_transcript_with_timestamps',
  'committed_transcript_entities',
  'commit_throttled',
  'warning',
]);

interface ServerMessage {
  message_type?: string;
  text?: string;
  error?: string;
  message?: string;
}

export function buildRealtimeUrl(options: Pick<ScribeRealtimeOptions, 'token' | 'languageCode' | 'vadSilenceSecs'>): string {
  const params: Record<string, string> = {
    model_id: MODEL_ID,
    audio_format: `pcm_${STT_SAMPLE_RATE}`,
    commit_strategy: 'vad',
    vad_silence_threshold_secs: Math.min(3, Math.max(0.3, options.vadSilenceSecs)).toFixed(1),
    token: options.token,
  };
  if (options.languageCode) params.language_code = options.languageCode;
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${REALTIME_URL}?${query}`;
}

export class ScribeRealtime {
  private readonly options: ScribeRealtimeOptions;
  private readonly chunker = new PcmChunker(CHUNK_SAMPLES);
  private socket: WebSocketLike | null = null;
  private queue: string[] = [];
  private isOpen = false;
  private isClosed = false;

  constructor(options: ScribeRealtimeOptions) {
    this.options = options;
  }

  connect(): void {
    const url = buildRealtimeUrl(this.options);
    const create = this.options.createSocket ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike);
    const socket = create(url);
    socket.onopen = () => {
      if (this.isClosed) return;
      this.isOpen = true;
      for (const message of this.queue) socket.send(message);
      this.queue = [];
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () =>
      this.fail(new ScribeRealtimeError('Lost connection to live speech recognition.', 'connection'));
    socket.onclose = (event) =>
      this.fail(
        new ScribeRealtimeError(
          event.reason || 'Live speech recognition disconnected.',
          event.code === 1008 ? 'auth_error' : 'closed'
        )
      );
    this.socket = socket;
  }

  /** Queues 16 kHz mono samples; they are sent in 250 ms chunks. */
  sendAudio(samples: Int16Array): void {
    const chunk = this.chunker.push(samples);
    if (chunk) this.sendChunk(chunk, false);
  }

  /** Flushes buffered audio and asks Scribe to finalize the current transcript now. */
  commit(): void {
    const rest = this.chunker.flush();
    if (rest) this.sendChunk(rest, false);
    this.send({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: STT_SAMPLE_RATE });
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.queue = [];
    try {
      this.socket?.close(1000);
    } catch {
      // already closed
    }
    this.socket = null;
  }

  private sendChunk(samples: Int16Array, commit: boolean): void {
    this.send({
      message_type: 'input_audio_chunk',
      audio_base_64: int16ToBase64(samples),
      commit,
      sample_rate: STT_SAMPLE_RATE,
    });
  }

  private send(message: object): void {
    if (this.isClosed || !this.socket) return;
    const data = JSON.stringify(message);
    if (this.isOpen) {
      this.socket.send(data);
    } else {
      this.queue.push(data);
      if (this.queue.length > MAX_QUEUED_MESSAGES) this.queue.shift();
    }
  }

  private handleMessage(data: unknown): void {
    if (this.isClosed || typeof data !== 'string') return;
    let message: ServerMessage;
    try {
      message = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    const type = message.message_type ?? '';
    if (type === 'partial_transcript') {
      this.options.onPartial(message.text ?? '');
    } else if (type === 'committed_transcript') {
      this.options.onCommitted(message.text ?? '');
    } else if (!IGNORED_TYPES.has(type) && (message.error || type in ERROR_MESSAGES || /error|exceeded|limit/.test(type))) {
      this.fail(new ScribeRealtimeError(ERROR_MESSAGES[type] ?? message.error ?? message.message ?? 'Speech recognition error.', type || 'error'));
    }
  }

  private fail(error: ScribeRealtimeError): void {
    if (this.isClosed) return;
    this.close();
    this.options.onError(error);
  }
}
