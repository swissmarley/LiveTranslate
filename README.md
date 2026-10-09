# LiveTranslate

Face-to-face voice translation for travelers, in the spirit of Samsung's Live Translate /
Interpreter. Put the phone between you and the person you're talking to: each of you taps your
own microphone and speaks. Your words appear in their language on their half of the screen,
turned towards them, and are read aloud in a natural voice. Their answer comes back to you the
same way.

- **Translation:** [Supertext](https://www.supertext.com/en/api) AI translation
- **Speech:** [ElevenLabs](https://elevenlabs.io) — Scribe v2 Realtime (speech → text, live),
  Scribe v2 (fallback), Flash v2.5 / v3 (text → speech)
- **App:** Expo SDK 57 / React Native 0.86, Expo Router, TypeScript, iOS + Android (+ web)

## Features

| | |
|---|---|
| **Face-to-face mode** | Split screen: the top half is rotated 180° for the other person and is entirely in their language (prompts included). Each half has its own mic. |
| **Live transcription** | Words appear while you speak; translation starts the moment you pause. Pause length is adjustable. |
| **Spoken translations** | Every translation is read aloud through the loudspeaker (even in silent mode). Each side gets its own voice. Tap any bubble to replay it. |
| **Listen mode** | One-way, continuous: point the phone at a tour guide or an announcement and read along in your language. |
| **Type instead** | For noisy places, names, addresses. |
| **Show full screen** | Long-press a message to show it in huge type, optionally flipped for the person opposite. |
| **History** | Conversations are saved on the phone; replay or copy any line later. |
| **Formality** | Formal / informal address (Sie/du, vous/tu, usted/tú) where Supertext supports it. |

**34 languages / variants:** English (US, UK), German (DE, CH, AT), French (FR, CH), Italian
(IT, CH), Spanish, Portuguese (PT, BR), Dutch, Danish, Swedish, Norwegian, Finnish, Polish, Czech,
Slovak, Hungarian, Croatian, Slovenian, Serbian (Latin, Cyrillic), Albanian, Bulgarian, Greek,
Russian, Turkish, Japanese, Korean, Chinese (Simplified, Traditional). These are the languages
both Supertext and ElevenLabs support. Slovenian, Serbian and Albanian are voiced by ElevenLabs
v3, because Flash v2.5 doesn't speak them.

## How it works

```
 Phone (Expo app)                        Your server (Expo API routes)       Providers
 ──────────────────                      ───────────────────────────────     ─────────────────────────
 tap mic ─► POST /api/stt-token ───────► mints a single-use token ─────────► ElevenLabs
 mic PCM 16 kHz ──── WebSocket (token) ─────────────────────────────────────► Scribe v2 Realtime
   ◄── partial transcripts … committed transcript (VAD detected the pause)
 text ────► POST /api/translate ───────► Supertext-Auth-Key ──────────────► Supertext /translate/ai/text
 translation ► POST /api/speak ────────► xi-api-key ───────────────────────► ElevenLabs text-to-speech
   ◄── MP3, cached on the phone, played through the loudspeaker
 (fallback) m4a ► POST /api/transcribe ─► xi-api-key ───────────────────────► Scribe v2 (batch)
```

The server's API keys live only on the server (the Expo Router API routes in `src/app/api`). The
phone never sees them. Live audio goes straight from the phone to ElevenLabs over a WebSocket,
using a single-use token that expires after 15 minutes. That keeps latency low and your key
private.

**No server? Use your own keys.** Paste your Supertext and ElevenLabs keys into
*Settings → API keys* and the phone calls both services itself, with the same client code the
server uses (`src/providers`). The keys are stored encrypted on the phone (Android Keystore / iOS
Keychain via `expo-secure-store`) and only sent to Supertext and ElevenLabs. You can mix the two:
a service without a key of its own in the app goes through the server.

Microphone PCM comes from `useAudioStream` in `expo-audio` (added in SDK 56), which is included
in Expo Go. Where that stream isn't available (the web build, or if it fails to start), the app
records the phrase, detects the end of speech from the level meter, and uploads the recording
instead. You can also choose this **Standard** mode in Settings.

## Setup

**1. Get API keys**

- **Supertext:** needs an API subscription. Create a key in the cockpit under
  <https://www.supertext.com/en/cockpit/api>.
- **ElevenLabs:** create a key at <https://elevenlabs.io/app/settings/api-keys> with access to
  *Text to Speech*, *Speech to Text* and *Voices (read)*. Setting a credit quota on the key is a
  good idea. Your account needs at least one voice. Accounts created after March 2026 don't get
  the old default voices, so add one or two from the Voice Library under *My Voices*.

**2. Configure and check**

```bash
cp .env.example .env        # then paste the two keys into .env
npm install
npm run check:apis          # verifies both keys and runs the whole pipeline once
```

`check:apis` translates a sentence with Supertext, speaks it with ElevenLabs, transcribes the
audio with Scribe v2, and streams it through Scribe v2 Realtime the same way the app streams your
microphone. It also compares the app's language codes with the ones your Supertext account
offers.

**3. Run it on your phone**

1. Install **Expo Go** from the App Store / Play Store.
2. `npx expo login`. On iPhone, sign in to Expo Go with the **same** Expo account; SDK 57 requires
   this.
3. `npm start` and scan the QR code. The phone must be on the same Wi-Fi as your Mac. If it isn't,
   use `npm run start:tunnel`.

In development the app talks to the dev server that serves it, so no extra configuration is
needed. A red banner on the main screen tells you if the server can't be reached or is missing a
key. You can also run the app in a browser with `npm run web`; it uses Standard recognition there.

## Using it

- **Your side is the bottom (blue).** Tap the mic, speak, and pause. The translation appears on
  the top half and is spoken aloud. Tap the mic again to finish early.
- **The other person's side is the top (orange)**, facing them. They tap their mic to answer.
- Tap a **language pill** to change a language. ⇅ swaps the two languages. ⊕ starts a new
  conversation; the old one is kept in History.
- Tap a bubble to replay it. Long-press it to show it full screen, copy it, or retry a failed
  translation.
- ⌨ lets you type instead. 🔊 replays the last translation.
- 👂 opens **Listen mode**.
- ⚙ **Settings** holds your own API keys, voices, speaking speed, auto read-aloud, formality,
  recognition mode (Live / Standard), pause length, face-to-face rotation, the server URL, how
  long conversations are kept (always, 30/7/1 days, or not at all), and clearing cache/history.
- If a translation fails, your bubble says why (e.g. no connection, key rejected, text too long).
  Tap it to retry when retrying can help.

## Taking it on a trip

The dev server runs on your Mac, so for real travel either install the app and give it your own
keys (quickest), or deploy the server.

**Quickest: the APK and your own keys.** Install the APK from the
[latest GitHub release](https://github.com/swissmarley/LiveTranslate/releases/latest), open
*Settings → API keys* and paste both keys (see [Setup](#setup) for how to get them). The app
tries each key right away and says whether it works. Nothing else is needed.

**With a server.** Keep the keys off the phone, or share one set of keys between several phones:

**1. Deploy the API routes to EAS Hosting** (free tier: 100k requests per month):

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest env:create --environment production --name SUPERTEXT_API_KEY --value "…" --visibility sensitive
npx eas-cli@latest env:create --environment production --name ELEVENLABS_API_KEY --value "…" --visibility sensitive
npx eas-cli@latest env:create --environment production --name APP_ACCESS_TOKEN --value "a-long-random-string" --visibility sensitive
npm run deploy:server
```

Use *sensitive* visibility, not *secret*: EAS Hosting can't receive secret-visibility variables.
Check the deployment with `npm run check:apis -- --server https://<your-app>.expo.app`.

**Protecting the server's credit.** Every request to the server is paid for with your Supertext
and ElevenLabs credit, so a deployed server:

- **requires `APP_ACCESS_TOKEN`.** Without it every route answers 503. (To run an open server on
  purpose, set `APP_ALLOW_OPEN_ACCESS=true`.) The token keeps out people who only know the URL,
  but it is not a real secret: it is built into the app, and anyone with the APK can read it.
- **rate-limits each client**: `APP_RATE_LIMIT_PER_MINUTE` requests per minute and route
  (default 30; live-recognition tokens get a third of that). The limit is kept per server
  instance, so on EAS Hosting it slows a single abuser down but is no spend cap.
- **only believes a client's IP address from a proxy you trust** (`APP_TRUSTED_PROXY`), because
  clients can send `X-Forwarded-For` themselves:

  | `APP_TRUSTED_PROXY` | Client address taken from |
  |---|---|
  | `cloudflare` (default on EAS Hosting) | `CF-Connecting-IP`, which Cloudflare always sets |
  | `x-forwarded-for:<hops>` | `X-Forwarded-For`, the entry `<hops>` from the right (`<hops>` = number of your proxies) |
  | `none` (default elsewhere) | nothing: all clients share one rate limit, and the server logs a warning |

- **only answers its own web app** in a browser, so other websites can't use it from their
  visitors' browsers (`APP_ALLOWED_ORIGINS` lists exceptions). The phone app is not affected.
- **keeps provider errors to itself.** The app gets a fixed message ("Translation failed. Please
  try again."); what Supertext or ElevenLabs actually answered is only written to the server log.
- **sends security headers** with every page and API response (Content-Security-Policy,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  Permissions-Policy, HSTS), configured as `headers` of the `expo-router` plugin in `app.json`.
  Expo's generated `/_sitemap` page is turned off (`sitemap: false`). The CSP allows the server's
  own origin and other `https:` servers; a custom server URL in the web build must use https. If
  an Expo update changes its inline hydration script, update the script's hash in the CSP.

The real spend cap is on the provider side: set a credit quota on the ElevenLabs key and a usage
limit in the Supertext cockpit. Share the server URL and an APK built with its token only with
people you trust.

**2. Point the app at it.** Set `EXPO_PUBLIC_API_URL=https://<your-app>.expo.app` and
`EXPO_PUBLIC_APP_TOKEN=<same token>` for builds, or type the URL into
*Settings → Server*.

**3. Install the app.**

- **Android:** download the APK from the
  [latest GitHub release](https://github.com/swissmarley/LiveTranslate/releases/latest) on your
  phone and open it (see [Android releases](#android-releases)). Or build your own with
  `npx eas-cli@latest build -p android --profile preview`.
- **iOS:** device builds through EAS need a paid Apple Developer account (ad hoc or TestFlight).
  The alternative is to install Xcode and run `npx expo run:ios --device` with a free Apple ID.

## Android releases

`.github/workflows/android-release.yml` builds a release APK on GitHub Actions and attaches it to
a GitHub release. Start it by pushing a version tag, or with *Run workflow* in the Actions tab,
which tags the commit for you:

```bash
git tag v1.1.0 && git push origin v1.1.0
```

The tag sets the app version (`1.1.0`) and the Android versionCode (`10100`), so every release
installs as an update over the previous one. The APK contains ARM code only (arm64-v8a and
armeabi-v7a), which covers phones but not x86 emulators.

**Signing.** Android only installs an update if it is signed with the same key as the installed
app. Create a key once, keep it safe, and add it as repository secrets (*Settings → Secrets and
variables → Actions*):

```bash
keytool -genkeypair -v -keystore livetranslate.jks -alias livetranslate \
  -keyalg RSA -keysize 2048 -validity 10000
base64 < livetranslate.jks | tr -d '\n'   # → ANDROID_KEYSTORE_BASE64
```

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the base64 output above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `livetranslate` |
| `ANDROID_KEY_PASSWORD` | the same password (keytool uses one for both) |

Without these secrets the workflow signs with the Android debug key and says so in the release
notes. Moving from that key to your own means uninstalling the app once, which deletes its
history.

**Server.** Released APKs ask for your own API keys in *Settings → API keys*. To also build a
server into the app, set the repository *variable* `EXPO_PUBLIC_API_URL` and, if your server uses
`APP_ACCESS_TOKEN`, the *secret* `EXPO_PUBLIC_APP_TOKEN`. Both end up inside the APK, and the
releases of a public repository are public. Never put the Supertext or ElevenLabs keys
themselves into the build.

## Privacy

- What both people say is sent to **ElevenLabs** (speech recognition), the recognized text to
  **Supertext** (translation), and the translation back to **ElevenLabs** (speech). With a server,
  these calls go through it; with your own keys, straight from the phone. Nothing else from the
  conversation is sent anywhere. Settings → Privacy says the same in the app.
- **Conversations stay on the device** (AsyncStorage on phones, localStorage in a browser), in plain
  text. They are kept for 30 days by default (installs from before this setting keep everything);
  choose always, 30, 7 or 1 day, or not at all in *Settings → History*. Spoken translations are
  cached on the device (up to 50 MB; deleted with their conversation).
- The first time the app opens, a short notice says what is sent where, how long conversations
  are kept, and to tell the other person.
- **Android backups are off** (`allowBackup: false`), so history doesn't end up in Google backups.
  Your own API keys are kept encrypted in the Android Keystore / iOS Keychain.
- Tell the person you're talking to that the app records and translates what they say. They
  haven't agreed to it just by being in the conversation.

## Costs (rough — check current pricing)

- **Supertext:** a small monthly base fee plus about CHF/EUR 20 per million characters.
- **ElevenLabs:**
  - Flash text-to-speech costs about $0.05 per 1,000 characters.
  - Scribe v2 Realtime costs about $0.39 per hour of open microphone; batch Scribe v2 about
    $0.22 per hour.
  - The free plan has 10,000 credits per month.

Reading translations aloud costs the most. A 10-minute conversation with about 60 turns of 60
characters costs roughly **$0.30**: about $0.18 for speech, €0.07 for translation and $0.04 for
recognition. Turning off *Read translations aloud* removes most of that. Replays are free because
spoken translations are cached on the phone. Listen mode pays for every phrase, so it stops by
itself after 5 minutes without speech, or after an hour.

## Development

```bash
npm test             # unit tests: PCM/resampling, silence detection, Scribe protocol, languages, speech chunks, provider/server logic
npm run typecheck
npm run lint         # src and scripts
npm run check:apis   # live check against Supertext + ElevenLabs (needs .env)
```

```
src/
  app/                  screens (Expo Router) — index = conversation, listen, history, settings…
  app/api/              server routes: translate, transcribe, speak, voices, stt-token, health
  server/               server-only: env keys, access token, route helpers
  providers/            Supertext + ElevenLabs clients, key passed in (used by the server and,
                        with the user's own keys, by the app)
  services/             phone side: capture (live + recorded), Scribe Realtime client, PCM,
                        silence detection, playback, TTS cache, translate→speak pipeline
  store/                settings, history, the user's own API keys (secure storage)
  hooks/ components/ lib/
scripts/check-apis.mjs  end-to-end key check
```

`.github/workflows/checks.yml` runs the typecheck, lint and tests on every push and pull request.

## Limitations

- **Needs an internet connection.** All recognition, translation and speech runs in the cloud.
  There is no offline mode.
- **No phone-call translation.** Samsung's call translation needs access to call audio, which
  iOS and Android don't give third-party apps. This app covers the face-to-face Interpreter
  experience.
- **Limited to languages both services support.** Supertext has no Thai, Vietnamese, Arabic or
  Hindi, for example.
- **The web build** has no live recognition (it records each phrase, then transcribes it) and
  can't use your own API keys. It always needs the server.
- **Not yet tested on a physical phone.** The live microphone stream (`useAudioStream`) is checked
  against the SDK 57 sources, and the WebSocket protocol is checked by `check:apis`. If live mode
  misbehaves on your device, switch to *Standard* in Settings.
