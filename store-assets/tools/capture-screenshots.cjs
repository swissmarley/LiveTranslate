// Captures the Play Store screenshots from the Expo web build (Chromium, Android-sized viewport), with
// demo conversations seeded into local storage and the /api/* routes mocked (no API keys needed).
//   npx expo start --web --port 8081        # in another terminal
//   node store-assets/tools/capture-screenshots.cjs            # phone, 1080x1920
//   DEVICE=tablet7 node store-assets/tools/capture-screenshots.cjs
//   DEVICE=tablet10 node store-assets/tools/capture-screenshots.cjs
// Extras (names starting with "extra-") land next to the numbered shots; move them to phone-screenshots/extras/.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:8081';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'android', {phone: 'phone-screenshots', tablet7: 'tablet-7in', tablet10: 'tablet-10in'}[process.env.DEVICE || 'phone']);
const ONLY = process.argv[2];
const INSETS = { top: 28, bottom: 20 };
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = {
  phone: { width: 432, height: 768, dpr: 2.5, ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },     // 1080x1920
  tablet7: { width: 600, height: 960, dpr: 2, ua: 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },      // 1200x1920
  tablet10: { width: 800, height: 1280, dpr: 2, ua: 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },  // 1600x2560
};
const DEVICE = DEVICES[process.env.DEVICE || 'phone'];
const VIEWPORT = { width: DEVICE.width, height: DEVICE.height };
const DPR = DEVICE.dpr;

const now = Date.now();
const min = 60_000;
const hour = 60 * min;
const day = 24 * hour;
let n = 0;
const msg = (speaker, source, target, original, translation, ago, input = 'voice') => ({
  id: `m${++n}`, speaker, source, target, original, translation, status: 'done', input, createdAt: now - ago,
  speechKeys: [],
});

const conversation = {
  id: 's-main', kind: 'conversation', createdAt: now - 12 * min, updatedAt: now - 2 * min,
  languages: { mine: 'en-US', theirs: 'es' },
  messages: [
    msg('me', 'en-US', 'es', 'Where is the station?', '¿Dónde está la estación?', 6 * min),
    msg('them', 'es', 'en-US', 'Todo recto y luego a la izquierda.', 'Straight ahead, then left.', 4 * min),
    msg('me', 'en-US', 'es', 'Thank you so much!', '¡Muchas gracias!', 2 * min),
  ],
};

const restaurant = {
  id: 's-ja', kind: 'conversation', createdAt: now - 3 * hour, updatedAt: now - 3 * hour + 8 * min,
  languages: { mine: 'en-US', theirs: 'ja' },
  messages: [
    msg('me', 'en-US', 'ja', 'A table for two, please. Do you have a vegetarian menu?', '二名です。ベジタリアン向けのメニューはありますか？', 3 * hour),
    msg('them', 'ja', 'en-US', 'はい、こちらです。本日のおすすめは野菜の天ぷらです。', 'Yes, here it is. Today\'s special is vegetable tempura.', 3 * hour - 2 * min),
  ],
};
const hotel = {
  id: 's-de', kind: 'conversation', createdAt: now - day - 2 * hour, updatedAt: now - day - 2 * hour,
  languages: { mine: 'en-US', theirs: 'de-CH' },
  messages: [
    msg('me', 'en-US', 'de-CH', 'I have a reservation under the name Miller.', 'Ich habe eine Reservation auf den Namen Miller.', day + 2 * hour),
    msg('them', 'de-CH', 'en-US', 'Willkommen! Ihr Zimmer ist im dritten Stock, das Frühstück gibt es ab sieben Uhr.', 'Welcome! Your room is on the third floor, and breakfast is served from seven o\'clock.', day + 2 * hour - min),
  ],
};
const market = {
  id: 's-fr', kind: 'conversation', createdAt: now - 3 * day, updatedAt: now - 3 * day,
  languages: { mine: 'en-US', theirs: 'fr-FR' },
  messages: [
    msg('me', 'en-US', 'fr-FR', 'How much are the strawberries?', 'Combien coûtent les fraises ?', 3 * day),
    msg('them', 'fr-FR', 'en-US', 'Quatre euros le kilo, elles sont de la région.', 'Four euros a kilo, they are local.', 3 * day - min),
  ],
};
const tour = {
  id: 's-listen', kind: 'listen', createdAt: now - 25 * min, updatedAt: now - 20 * 1000,
  languages: { mine: 'en-US', theirs: 'it-IT' },
  messages: [
    msg('them', 'it-IT', 'en-US', 'Benvenuti al Colosseo, costruito quasi duemila anni fa.', 'Welcome to the Colosseum, built almost two thousand years ago.', 3 * min),
    msg('them', 'it-IT', 'en-US', 'Poteva ospitare più di cinquantamila spettatori.', 'It could hold more than fifty thousand spectators.', 2 * min),
    msg('them', 'it-IT', 'en-US', 'Seguitemi: ora entriamo nella parte più antica.', 'Follow me: now we are entering the oldest part.', 20 * 1000),
  ],
};
const sessions = [conversation, restaurant, tour, hotel, market];

const settings = (extra = {}) => ({
  state: {
    myLanguage: 'en-US', theirLanguage: 'es', listenSource: 'it-IT', listenTarget: 'en-US',
    recentLanguages: ['es', 'en-US', 'ja', 'de-CH', 'fr-FR', 'it-IT'],
    voices: { me: 'voice-sarah', them: 'voice-george' }, voicesAutoAssigned: true,
    speed: 1, autoSpeak: true, politeness: 'default', inputMode: 'live', pause: 'normal',
    faceToFace: true, serverUrl: '', keepHistory: '30d', privacyNoticeSeen: true, ...extra,
  },
  version: 1,
});

const voices = [
  ['voice-sarah', 'Sarah', 'female', 'American', 'Soft, warm and clear'],
  ['voice-george', 'George', 'male', 'British', 'Warm, friendly storyteller'],
  ['voice-matilda', 'Matilda', 'female', 'American', 'Knowledgeable and professional'],
  ['voice-liam', 'Liam', 'male', 'American', 'Energetic and upbeat'],
  ['voice-alice', 'Alice', 'female', 'British', 'Confident and engaging'],
  ['voice-daniel', 'Daniel', 'male', 'British', 'Steady broadcaster'],
].map(([id, name, gender, accent, description]) => ({
  id, name, gender, accent, description, category: 'premade', previewUrl: null,
}));

async function launch(scheme, settingsExtra, activeSession = 's-main') {
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, colorScheme: scheme,
    locale: 'en-US', timezoneId: 'Europe/Zurich', permissions: ['microphone'],
    userAgent: DEVICE.ua,
  });
  const seed = {
    settings: JSON.stringify(settings(settingsExtra)),
    sessions: JSON.stringify({ state: { sessions, activeIds: { conversation: activeSession, listen: 's-listen' } }, version: 1 }),
  };
  await context.addInitScript((s) => {
    try {
      localStorage.setItem('live-translate/settings', s.settings);
      localStorage.setItem('live-translate/sessions', s.sessions);
    } catch {}
  }, seed);
  await context.route('**/api/health', (r) =>
    r.fulfill({ json: { ok: true, supertext: true, elevenlabs: true, accessTokenRequired: false, authorized: true } }));
  await context.route('**/api/voices', (r) => r.fulfill({ json: { voices, defaultVoiceId: 'voice-sarah' } }));
  await context.route('**/api/stt-token', (r) => r.fulfill({ status: 503, json: { error: { code: 'x', message: 'x' } } }));
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: INSETS });
  } catch (e) { console.log('no safe-area override:', e.message); }
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  return { browser, context, page };
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}


const go = async (page, url, waitText) => {
  await page.goto(BASE + url, { timeout: 120000 });
  await page.getByText(waitText).first().waitFor({ timeout: 120000 });
  await settle(page);
};

const shots = {
  conversation: (page) => go(page, '/', 'Thank you so much!'),
  listening: async (page) => {
    await go(page, '/', 'Thank you so much!');
    await page.getByRole('button', { name: 'Speak English (US)' }).click();
    await page.waitForTimeout(1500);
  },
  compose: async (page) => {
    await go(page, '/', 'Thank you so much!');
    await page.getByRole('button', { name: 'Type instead' }).click();
    await page.getByLabel(/Text to translate into/).fill('Where can I find a pharmacy nearby?');
    await page.waitForTimeout(800);
  },
  languages: (page) => go(page, '/languages?slot=theirs', 'Deutsch'),
  listen: (page) => go(page, '/listen', 'Welcome to the Colosseum'),
  show: (page) => go(page, '/show?session=s-main&message=m2', 'Straight ahead'),
  history: (page) => go(page, '/history', 'Today'),
  detail: (page) => go(page, '/history/s-ja', 'tempura'),
  settings: (page) => go(page, '/settings', 'Speaking speed'),
  voices: (page) => go(page, '/voices?speaker=me', 'Sarah'),
};

async function run(name, scheme, fn, extra, active) {
  if (ONLY && ONLY !== name) return;
  const { browser, page } = await launch(scheme, extra, active);
  try {
    await fn(page);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log('saved', file);
  } catch (e) {
    console.log('FAILED', name, e.message);
    await page.screenshot({ path: path.join(OUT, `${name}-FAILED.png`) }).catch(() => {});
  } finally {
    await browser.close();
  }
}

(async () => {
  await run('01-face-to-face', 'dark', shots.conversation);
  await run('02-live-listening', 'dark', shots.listening);
  await run('03-34-languages', 'dark', shots.languages);
  await run('04-listen-mode', 'dark', shots.listen);
  await run('05-show-fullscreen', 'dark', shots.show);
  await run('06-type-instead', 'dark', shots.compose);
  await run('07-history', 'dark', shots.history);
  await run('08-settings', 'dark', shots.settings);
  await run('extra-history-detail', 'dark', shots.detail);
  await run('extra-voices', 'dark', shots.voices);
  await run('extra-face-to-face-light', 'light', shots.conversation);
  await run('extra-listen-mode-light', 'light', shots.listen);
})();
