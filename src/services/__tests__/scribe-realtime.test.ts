/// <reference types="node" />
import { buildRealtimeUrl, ScribeRealtime, type WebSocketLike } from '../scribe-realtime';

class FakeSocket implements WebSocketLike {
  onopen: WebSocketLike['onopen'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  onerror: WebSocketLike['onerror'] = null;
  onclose: WebSocketLike['onclose'] = null;
  sent: Record<string, unknown>[] = [];
  closed = false;

  constructor(readonly url: string) {}

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
  }

  // helpers
  open() {
    this.onopen?.({});
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function setup(languageCode = 'de') {
  let socket!: FakeSocket;
  const events = { partial: jest.fn(), committed: jest.fn(), error: jest.fn() };
  const client = new ScribeRealtime({
    token: 'sutkn_abc',
    languageCode,
    vadSilenceSecs: 1.2,
    onPartial: events.partial,
    onCommitted: events.committed,
    onError: events.error,
    createSocket: (url) => (socket = new FakeSocket(url)),
  });
  client.connect();
  return { client, socket, events };
}

describe('buildRealtimeUrl', () => {
  it('encodes model, format, VAD and token', () => {
    const url = new URL(buildRealtimeUrl({ token: 'a b', languageCode: 'ja', vadSilenceSecs: 9 }));
    expect(url.origin + url.pathname).toBe('wss://api.elevenlabs.io/v1/speech-to-text/realtime');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model_id: 'scribe_v2_realtime',
      audio_format: 'pcm_16000',
      commit_strategy: 'vad',
      vad_silence_threshold_secs: '3.0',
      token: 'a b',
      language_code: 'ja',
    });
  });
});

describe('ScribeRealtime', () => {
  it('queues audio until the socket opens and sends 250 ms chunks', () => {
    const { client, socket } = setup();
    client.sendAudio(new Int16Array(4000).fill(7));
    expect(socket.sent).toHaveLength(0);
    socket.open();
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toMatchObject({ message_type: 'input_audio_chunk', commit: false, sample_rate: 16000 });
    expect(Buffer.from(socket.sent[0].audio_base_64 as string, 'base64')).toHaveLength(8000);
  });

  it('flushes the remainder and commits on demand', () => {
    const { client, socket } = setup();
    socket.open();
    client.sendAudio(new Int16Array(1000));
    expect(socket.sent).toHaveLength(0);
    client.commit();
    expect(socket.sent).toHaveLength(2);
    expect(Buffer.from(socket.sent[0].audio_base_64 as string, 'base64')).toHaveLength(2000);
    expect(socket.sent[1]).toEqual({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: 16000 });
  });

  it('forwards partial and committed transcripts', () => {
    const { socket, events } = setup();
    socket.open();
    socket.receive({ message_type: 'session_started', session_id: 'x' });
    socket.receive({ message_type: 'partial_transcript', text: 'Wo ist' });
    socket.receive({ message_type: 'committed_transcript', text: 'Wo ist der Bahnhof?' });
    socket.receive({ message_type: 'commit_throttled', error: 'slow down' });
    expect(events.partial).toHaveBeenCalledWith('Wo ist');
    expect(events.committed).toHaveBeenCalledWith('Wo ist der Bahnhof?');
    expect(events.error).not.toHaveBeenCalled();
  });

  it('reports server errors once and stops', () => {
    const { socket, events } = setup();
    socket.open();
    socket.receive({ message_type: 'quota_exceeded', error: 'quota' });
    socket.onclose?.({ code: 1000 });
    socket.receive({ message_type: 'partial_transcript', text: 'late' });
    expect(events.error).toHaveBeenCalledTimes(1);
    expect(events.error.mock.calls[0][0]).toMatchObject({ type: 'quota_exceeded', message: 'Your ElevenLabs quota is used up.' });
    expect(events.partial).not.toHaveBeenCalled();
    expect(socket.closed).toBe(true);
  });

  it('treats an unexpected close as an error, but not a deliberate one', () => {
    const first = setup();
    first.socket.onclose?.({ code: 1008, reason: 'Invalid token' });
    expect(first.events.error.mock.calls[0][0]).toMatchObject({ type: 'auth_error', message: 'Invalid token' });

    const second = setup();
    second.client.close();
    second.socket.onclose?.({ code: 1000 });
    expect(second.events.error).not.toHaveBeenCalled();
  });
});
