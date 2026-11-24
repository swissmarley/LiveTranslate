# Play Store assets

Everything the Google Play Console asks for in the store listing, in `android/`:

| Asset | File | Play requirement |
|---|---|---|
| App icon | `android/icon-512.png` | 512×512 PNG, ≤ 1 MB (made from `assets/images/icon.png`) |
| Feature graphic | `android/feature-graphic-1024x500.png` | 1024×500 PNG/JPG, no transparency |
| Phone screenshots | `android/phone-screenshots/01…08` | 2–8 images, 1080×1920 (9:16), PNG |
| 7-inch tablet (optional) | `android/tablet-7in/` | 1200×1920 |
| 10-inch tablet (optional) | `android/tablet-10in/` | 1600×2560 |
| Spare phone shots | `android/phone-screenshots/extras/` | light mode, history detail, voice picker |

Screenshot order: face-to-face conversation, live listening, 34 languages, Listen mode,
show-full-screen, type instead, history, settings.

## How they were made

The screenshots are the app's real screens, rendered from the Expo web build in headless Chromium at
an Android phone viewport (432×768 CSS px at 2.5×). They are not captures from an Android emulator
or a device. The demo conversations are seeded into local storage and the `/api/*` routes are
mocked, so no API keys are needed and no real provider is called. The tablet sets reuse the phone
layout (the app has no tablet layout), so they look sparse; skip them if you don't want them.

To regenerate (from the repo root):

```bash
npx expo start --web --port 8081                      # in a second terminal
node store-assets/tools/capture-screenshots.cjs       # DEVICE=tablet7 / tablet10 for tablets
node store-assets/tools/render-feature-graphic.cjs    # then downscale feature@2x.png to 1024x500
```

`capture-screenshots.cjs` and `render-feature-graphic.cjs` need Playwright (`require('playwright')`).
