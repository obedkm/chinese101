# Mandarin Journey 汉语之旅

A beginner Chinese learning app (HSK 1 + 2) built as a small daily habit:
30 themed units × 6 bite-size lessons — vocabulary, hanzi stroke practice,
grammar, listening, and speaking — with spaced repetition, streaks, and a
progress dashboard. Fully offline; all progress stays on the device.

## Structure

- Web app (vanilla HTML/CSS/JS, no build step) at the repo root:
  - `js/content-hsk1.js`, `js/content-hsk2.js` — course data (285 words, 120 hanzi, 30 grammar points)
  - `js/srs.js` — localStorage state + spaced-repetition engine
  - `js/speech.js` — TTS/speech-recognition layer (Web Speech API in browsers, native bridge in the APK)
  - `js/app.js` — screens, lesson player, exercise engines
  - `vendor/hanzi-writer.min.js` + `js/hanzi-data.js` — stroke-order animation with offline data
- `android/` — thin Kotlin WebView wrapper exposing native Android TTS and
  SpeechRecognizer to the web app (`window.MJBridge`)
- `.github/workflows/build-apk.yml` — CI that builds and signs the APK

## Get the APK

Every push to `main` rebuilds the app. Grab `mandarin-journey.apk` from the
[latest release](../../releases/latest), open it on your Android phone, and
allow installation from unknown sources.

## Develop in a browser

Serve the repo root with any static server (e.g. `python3 -m http.server`)
and open `index.html`. Chrome is recommended — speaking practice uses the
Web Speech API there.

Note: `android/keystore.p12` (password `mandarin-journey`) only guarantees
update continuity for sideloading — it protects nothing and is intentionally
committed.
