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

The API keys live only on the server (the Expo Router API routes in `src/app/api`). The phone
never sees them. Live audio goes straight from the phone to ElevenLabs over a WebSocket, using a
single-use token that expires after 15 minutes. That keeps latency low and your key private.

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
- ⚙ **Settings** holds voices, speaking speed, auto read-aloud, formality, recognition mode
  (Live / Standard), pause length, face-to-face rotation, the server URL, and clearing
  cache/history.

## Taking it on a trip

The dev server runs on your Mac, so for real travel you need to deploy the server and install
the app.

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

**Server.** To build a server into the app, set the repository *variable* `EXPO_PUBLIC_API_URL`
and, if your server uses `APP_ACCESS_TOKEN`, the *secret* `EXPO_PUBLIC_APP_TOKEN`. Both end up
inside the APK, and the releases of a public repository are public. Without them, enter the
server URL in *Settings → Server*.

## Costs (rough — check current pricing)

- **Supertext:** a small monthly base fee plus about CHF/EUR 20 per million characters.
- **ElevenLabs:**
  - Flash text-to-speech costs about $0.05 per 1,000 characters.
  - Scribe v2 Realtime costs about $0.39 per hour of open microphone; batch Scribe v2 about
    $0.22 per hour.
  - The free plan has 10,000 credits per month.

A typical 10-minute conversation costs a few cents. Replays are free because spoken translations
are cached on the phone.

## Development

```bash
npm test             # unit tests: PCM/resampling, silence detection, Scribe protocol, languages, server logic
npm run typecheck
npm run lint
npm run check:apis   # live check against Supertext + ElevenLabs (needs .env)
```

```
src/
  app/                  screens (Expo Router) — index = conversation, listen, history, settings…
  app/api/              server routes: translate, transcribe, speak, voices, stt-token, health
  server/               Supertext + ElevenLabs clients (server only — hold the keys)
  services/             phone side: capture (live + recorded), Scribe Realtime client, PCM,
                        silence detection, playback, TTS cache, translate→speak pipeline
  hooks/ components/ store/ lib/
scripts/check-apis.mjs  end-to-end key check
```

## Limitations

- **Needs an internet connection.** All recognition, translation and speech runs in the cloud.
  There is no offline mode.
- **No phone-call translation.** Samsung's call translation needs access to call audio, which
  iOS and Android don't give third-party apps. This app covers the face-to-face Interpreter
  experience.
- **Limited to languages both services support.** Supertext has no Thai, Vietnamese, Arabic or
  Hindi, for example.
- **Not yet tested on a physical phone.** The live microphone stream (`useAudioStream`) is checked
  against the SDK 57 sources, and the WebSocket protocol is checked by `check:apis`. If live mode
  misbehaves on your device, switch to *Standard* in Settings.
