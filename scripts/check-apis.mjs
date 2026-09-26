#!/usr/bin/env node
/**
 * Checks the API keys in .env against the real services and runs the app's pipeline once:
 *
 *   Supertext translate → ElevenLabs text-to-speech → ElevenLabs speech-to-text (batch)
 *                                                    → Scribe v2 Realtime WebSocket (live)
 *
 * It also compares the app's Supertext language codes with the ones your account supports.
 *
 *   npm run check:apis
 *   npm run check:apis -- --server http://localhost:8081       # also test the app's API routes
 *   npm run check:apis -- --server https://your-app.expo.app
 */

import { LANGUAGES } from '../src/lib/languages.ts';

const SAMPLE_EN = 'Excuse me, where is the train station?';
const { SUPERTEXT_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, APP_ACCESS_TOKEN } = process.env;
const serverArg = process.argv.indexOf('--server');
const SERVER = serverArg > 0 ? process.argv[serverArg + 1]?.replace(/\/+$/, '') : null;

let failures = 0;
const heading = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);
const pass = (message) => console.log(`  \x1b[32m✓\x1b[0m ${message}`);
const warn = (message) => console.log(`  \x1b[33m!\x1b[0m ${message}`);
const fail = (message) => {
  failures++;
  console.log(`  \x1b[31m✗\x1b[0m ${message}`);
};
const timed = async (fn) => {
  const start = Date.now();
  const result = await fn();
  return [result, Date.now() - start];
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const snippet = async (response) => (await response.text()).slice(0, 240).replace(/\s+/g, ' ');

// ─── Supertext ──────────────────────────────────────────────────────────────────

async function checkSupertext() {
  heading('Supertext');
  if (!SUPERTEXT_API_KEY) {
    fail('SUPERTEXT_API_KEY is not set in .env');
    return null;
  }
  const headers = {
    Authorization: `Supertext-Auth-Key ${SUPERTEXT_API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const [response, ms] = await timed(() =>
    fetch('https://api.supertext.com/v1/translate/ai/text', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: [SAMPLE_EN], source_lang: 'en', target_lang: 'de-CH' }),
    })
  );
  if (!response.ok) {
    fail(`translate → HTTP ${response.status}: ${await snippet(response)}`);
    return null;
  }
  const translated = (await response.json()).translated_text?.[0];
  pass(`translate en → de-CH in ${ms} ms: "${translated}"`);

  // GET /features is free: which source/target codes does this account support?
  const features = await fetch('https://api.supertext.com/v1/features', { headers });
  if (!features.ok) {
    warn(`GET /features → HTTP ${features.status}; skipped the language-code check`);
    return translated;
  }
  const pairs = (await features.json()).supported_features ?? [];
  const sources = new Set(pairs.map((p) => p.source_lang));
  const targets = new Set(pairs.map((p) => p.target_lang));
  if (pairs.length === 0) {
    warn('GET /features returned no language pairs; skipped the language-code check');
    return translated;
  }
  const badSources = [...new Set(LANGUAGES.map((l) => l.supertext.source))].filter((s) => !sources.has(s));
  const badTargets = LANGUAGES.filter((l) => !targets.has(l.supertext.target));
  if (!badSources.length && !badTargets.length) {
    pass(`all ${LANGUAGES.length} app languages match Supertext's codes (${pairs.length} pairs)`);
  }
  for (const source of badSources) {
    warn(`source "${source}" is not offered — the server will let Supertext auto-detect instead`);
  }
  for (const language of badTargets) {
    const base = language.supertext.target.split('-')[0];
    const offered = [...targets].filter((t) => t.split('-')[0] === base);
    warn(
      `${language.name}: target "${language.supertext.target}" is not offered` +
        (offered.length ? ` (offered: ${offered.join(', ')}; the server resolves this automatically)` : '')
    );
  }
  return translated;
}

// ─── ElevenLabs ─────────────────────────────────────────────────────────────────

async function streamToRealtime(token, pcm) {
  const params = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    audio_format: 'pcm_16000',
    commit_strategy: 'vad',
    vad_silence_threshold_secs: '1.0',
    language_code: 'de',
    token,
  });
  const socket = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`);
  return new Promise((resolve) => {
    let partials = 0;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve({ ...result, partials });
    };
    const timer = setTimeout(() => finish({ error: 'no committed transcript within 25 s' }), 25_000);
    const send = (bytes) =>
      socket.send(
        JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: Buffer.from(bytes).toString('base64'),
          commit: false,
          sample_rate: 16000,
        })
      );
    socket.onopen = async () => {
      const chunk = 8000; // 250 ms of 16 kHz s16le mono, like the app
      for (let i = 0; i < pcm.length && !settled; i += chunk) {
        send(pcm.subarray(i, i + chunk));
        await sleep(200);
      }
      // Trailing silence so Scribe's VAD commits the utterance.
      for (let i = 0; i < 10 && !settled; i++) {
        send(new Uint8Array(chunk));
        await sleep(200);
      }
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.message_type === 'partial_transcript') partials++;
      else if (message.message_type === 'committed_transcript' && message.text?.trim()) finish({ text: message.text });
      else if (message.error) finish({ error: `${message.message_type}: ${message.error}` });
    };
    socket.onerror = () => finish({ error: 'WebSocket error' });
    socket.onclose = (event) => finish({ error: `closed (${event.code}) ${event.reason ?? ''}` });
  });
}

async function checkElevenLabs(germanText) {
  heading('ElevenLabs');
  if (!ELEVENLABS_API_KEY) {
    fail('ELEVENLABS_API_KEY is not set in .env');
    return;
  }
  const auth = { 'xi-api-key': ELEVENLABS_API_KEY };
  const text = germanText ?? 'Entschuldigung, wo ist der Bahnhof?';

  const voicesResponse = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: auth });
  let voices = [];
  if (voicesResponse.ok) {
    voices = (await voicesResponse.json()).voices ?? [];
    pass(`${voices.length} voices: ${voices.slice(0, 4).map((v) => v.name).join(', ')}${voices.length > 4 ? ', …' : ''}`);
  } else {
    fail(`list voices → HTTP ${voicesResponse.status}: ${await snippet(voicesResponse)}`);
  }
  const voiceId =
    ELEVENLABS_VOICE_ID || voices.find((v) => v.category === 'premade')?.voice_id || voices[0]?.voice_id;
  if (!voiceId) {
    fail('no voice available — add one under "My Voices" in ElevenLabs or set ELEVENLABS_VOICE_ID');
    return;
  }

  const speak = (format) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${format}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', language_code: 'de' }),
    });

  const [mp3Response, ttsMs] = await timed(() => speak('mp3_44100_64'));
  if (!mp3Response.ok) {
    fail(`text-to-speech → HTTP ${mp3Response.status}: ${await snippet(mp3Response)}`);
    return;
  }
  const mp3 = new Uint8Array(await mp3Response.arrayBuffer());
  pass(`text-to-speech (Flash v2.5, voice ${voiceId}) in ${ttsMs} ms: ${mp3.length} bytes of MP3`);

  const form = new FormData();
  form.append('model_id', 'scribe_v2');
  form.append('language_code', 'de');
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([mp3], { type: 'audio/mpeg' }), 'sample.mp3');
  const [sttResponse, sttMs] = await timed(() =>
    fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: auth, body: form })
  );
  if (sttResponse.ok) pass(`speech-to-text (Scribe v2) in ${sttMs} ms: "${(await sttResponse.json()).text}"`);
  else fail(`speech-to-text → HTTP ${sttResponse.status}: ${await snippet(sttResponse)}`);

  const tokenResponse = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
    method: 'POST',
    headers: auth,
  });
  if (!tokenResponse.ok) {
    fail(`single-use token → HTTP ${tokenResponse.status}: ${await snippet(tokenResponse)}`);
    return;
  }
  const { token } = await tokenResponse.json();
  pass('single-use token for Scribe Realtime');

  // Stream the same sentence as 16 kHz PCM, exactly like the app streams the microphone.
  const pcmResponse = await speak('pcm_16000');
  if (!pcmResponse.ok) {
    fail(`text-to-speech (PCM) → HTTP ${pcmResponse.status}: ${await snippet(pcmResponse)}`);
    return;
  }
  const pcm = new Uint8Array(await pcmResponse.arrayBuffer());
  const [live, liveMs] = await timed(() => streamToRealtime(token, pcm));
  if (live.text) {
    pass(`live transcription (Scribe v2 Realtime), ${live.partials} partial update(s), ${liveMs} ms: "${live.text}"`);
  } else {
    fail(`live transcription: ${live.error}`);
  }
}

// ─── The app's own API routes ─────────────────────────────────────────────────────

async function checkServer() {
  heading(`App server ${SERVER}`);
  const headers = APP_ACCESS_TOKEN ? { 'x-app-token': APP_ACCESS_TOKEN } : {};
  const call = (path, init = {}) =>
    fetch(`${SERVER}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });

  let health;
  try {
    const response = await call('/api/health');
    health = await response.json();
  } catch (error) {
    fail(`cannot reach ${SERVER}/api/health (${error.message})`);
    return;
  }
  const problems = [
    !health.supertext && 'SUPERTEXT_API_KEY missing',
    !health.elevenlabs && 'ELEVENLABS_API_KEY missing',
    !health.authorized && 'APP_ACCESS_TOKEN mismatch',
  ].filter(Boolean);
  if (problems.length) fail(`health: ${problems.join(', ')}`);
  else pass('health: keys configured');

  const [translateResponse, translateMs] = await timed(() =>
    call('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: SAMPLE_EN, source: 'en-US', target: 'ja', politeness: 'more' }),
    })
  );
  const translation = translateResponse.ok ? (await translateResponse.json()).translation : null;
  if (translation) pass(`/api/translate en-US → ja in ${translateMs} ms: "${translation}"`);
  else fail(`/api/translate → HTTP ${translateResponse.status}: ${await snippet(translateResponse)}`);

  const [speakResponse, speakMs] = await timed(() =>
    call('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: translation ?? 'すみません、駅はどこですか？', language: 'ja' }),
    })
  );
  if (!speakResponse.ok) {
    fail(`/api/speak → HTTP ${speakResponse.status}: ${await snippet(speakResponse)}`);
  } else {
    const mp3 = new Uint8Array(await speakResponse.arrayBuffer());
    pass(`/api/speak in ${speakMs} ms: ${mp3.length} bytes (${speakResponse.headers.get('content-type')})`);
    const [transcribeResponse, transcribeMs] = await timed(() =>
      call('/api/transcribe?language=ja', { method: 'POST', headers: { 'Content-Type': 'audio/mpeg' }, body: mp3 })
    );
    if (transcribeResponse.ok) {
      pass(`/api/transcribe in ${transcribeMs} ms: "${(await transcribeResponse.json()).text}"`);
    } else {
      fail(`/api/transcribe → HTTP ${transcribeResponse.status}: ${await snippet(transcribeResponse)}`);
    }
  }

  const voicesResponse = await call('/api/voices');
  if (voicesResponse.ok) pass(`/api/voices: ${(await voicesResponse.json()).voices.length} voices`);
  else fail(`/api/voices → HTTP ${voicesResponse.status}: ${await snippet(voicesResponse)}`);

  const tokenResponse = await call('/api/stt-token', { method: 'POST' });
  if (tokenResponse.ok) pass('/api/stt-token: realtime token minted');
  else fail(`/api/stt-token → HTTP ${tokenResponse.status}: ${await snippet(tokenResponse)}`);
}

// ─── main ──────────────────────────────────────────────────────────────────────

const german = await checkSupertext().catch((error) => fail(`Supertext: ${error.message}`));
await checkElevenLabs(typeof german === 'string' ? german : null).catch((error) =>
  fail(`ElevenLabs: ${error.message}`)
);
if (SERVER) await checkServer().catch((error) => fail(`server: ${error.message}`));

console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
