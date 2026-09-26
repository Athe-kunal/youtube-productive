# YouTube Intent Filter

**Curate your YouTube feed by what you actually came to watch — entirely on-device.**

Tell it what you're here for ("AI research, systems, distributed training — no football, no
drama") and it embeds that intent locally, scores every video card as it renders, and dims
anything that doesn't match. No API calls, no account, no subscription. The model runs in your
browser via Transformers.js (the `@xenova/transformers` npm package) — your feed, your
intent, and your viewing habits never leave your device.

<!-- Demo GIF goes here — see the Screenshots section below. -->

## Why

Most "productivity" extensions for YouTube either hide entire sections (Shorts, Home) with a
sledgehammer, or ship a keyword blocklist you have to maintain by hand. Neither understands what
a video is actually *about*. This extension embeds each title (and the channel name) with a small
local language model and compares it against a semantic vector of your stated intent — so
"distributed training benchmarks" and "how I scaled a 100-GPU cluster" both match "AI research,
systems," even though they don't share a single keyword.

Everything computes locally:

- No servers, no telemetry, no account.
- The model (~34 MB, quantized) ships inside the extension package — nothing is downloaded at
  runtime, and the extension only requests access to youtube.com.
- Your intent text, its embedding, and your settings live in `chrome.storage.local` and never
  leave your machine.

See [`PRIVACY.md`](PRIVACY.md) for the full policy.

## Features

- **Semantic feed filtering** — describe what you want ("Show me") and, optionally, what to avoid
  ("Avoid") in plain language; the extension scores every card against both.
- **Dim, don't hide** — filtered videos are dimmed rather than removed, so you can always see what
  got filtered and correct course instead of losing the layout.
- **Keyword overrides** — "Always show" / "Always hide" keyword lists for hard rules that should
  bypass the model entirely.
- **Multiple profiles** — up to three intent profiles (e.g. "work focus" vs. "evening
  downtime"), each with its own intent, keywords, and active hours. Whichever profile's schedule
  matches right now is used automatically.
- **Scheduled profiles** — set active hours per weekday/weekend so the right profile kicks in
  without you touching the extension.
- **Hardcore mode** — a per-profile switch in full settings (deliberately not in the popup, like
  the master on/off switch) that hides the "Filtered on this page" list and refuses unhide requests, so filtered
  videos stay filtered.
- **Progress stats** — the full settings page shows how many distracting videos were filtered and
  how many you unhid, per day, as a chart. The popup shows today's counts. Stored locally only.
- **Runs on-device** — powered by Transformers.js and a quantized [ONNX](https://onnx.ai/) sentence embedding model, executed in an offscreen
  document via WASM (WebGPU where available).

## Install

Not yet on the Chrome Web Store. To try it now, build and load it unpacked:

```bash
git clone https://github.com/athe-kunal/youtube-productive.git
cd youtube-productive
npm install
npm run fetch-model   # downloads the bundled embedding model + WASM runtime into models/
npm run build          # bundles everything into dist/
```

Then in Chrome/Edge:

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` folder.
4. Open YouTube, click the extension icon, and describe what you want to see.

After any source change, run `npm run build` (or `npm run watch`) again, reload the extension at
`chrome://extensions`, and hard-refresh any open YouTube tabs — reloading the extension alone
doesn't update scripts already injected into tabs opened before the reload.

## How it works

```
content script
  ├── MutationObserver watches the feed container for new cards
  ├── extracts title + channel per card
  ├── batches titles → embeds via the offscreen document
  └── compares each embedding to the cached intent vector (cosine similarity)
       → dims cards below the calibrated threshold

offscreen document
  └── Transformers.js + a quantized ONNX model (WASM, WebGPU where available)
```

The intent vector is computed once, when you save your settings, and cached — it's never
recomputed on every page load or scroll. A calibration pass scores a fixed set of probe titles
against your saved intent so the show/dim cutoff adapts to *your* wording instead of using a
one-size-fits-all similarity threshold.

## Development

```bash
npm test               # runs the unit test suite (node --test)
npm run watch           # rebuilds dist/ on file change
make release VERSION=x.y.z   # bumps the version and zips dist/ into release.zip for the Web Store
```

Project layout:

```
src/
  background/    service worker
  content/       feed observer, DOM extraction, card dimming
  offscreen/     model inference (offscreen document, MV3-compliant)
  options/       full settings page
  popup/         toolbar popup
  shared/        scoring, storage, profiles, scheduling — shared by all surfaces
```

## Privacy

This extension does not collect, transmit, or upload any data. Everything — your intent text,
its embedding, your keyword lists, and the per-video score cache — stays in local browser storage.
Full policy: [`PRIVACY.md`](PRIVACY.md).

## Screenshots

_Add a demo GIF/video of the feed being filtered here, plus a screenshot of the options page._

## Contributing

Issues and PRs welcome. If you're touching the feed selectors, keep them anchored to YouTube's
custom element tags (`ytd-rich-item-renderer`, `ytd-video-renderer`, etc.) rather than CSS
classes — the latter churn far more often.

## License

No license file is currently included in this repository — all rights reserved by default until
one is added.
