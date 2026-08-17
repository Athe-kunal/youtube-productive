# YouTube Intent Filter — design notes

Open-source browser extension that curates the YouTube feed by *intent*, not keywords. Fully on-device, no API, no subscription.

## Goal

User writes something like "AI research, systems, distributed training — no football, no drama." Extension embeds that once, scores every video card in the feed against it, hides anything below threshold.

Differentiator vs. what exists (Flowstate, NeuroFilterAI, Unhook, keyword tuners): those are either paid, API-backed, or blunt section-hiders. This is local, free, open source.

## Architecture

```
content script
  ├── MutationObserver on feed container
  ├── extract metadata from each video card
  ├── embed titles (batched) → cosine sim vs cached intent vector
  └── hide/dim cards below threshold

background/offscreen
  └── Transformers.js + ONNX model (WASM, WebGPU if available)
```

- **Model**: `Xenova/all-MiniLM-L6-v2`, int8 quantized (~23 MB). 384-dim output.
- **Runtime**: Transformers.js. WASM is the safe default; WebGPU is available in Chrome/Edge/Safari but is an optimization, not a requirement — a few dozen short titles is milliseconds either way.
- **Intent vector**: computed once on settings save, persisted in `chrome.storage.local`. Never recomputed per page load.
- **Cache**: `Map<videoId, score>` so scrolling back up doesn't re-embed. Persist across navigations within a session.

## Metadata available in the DOM

Per card, beyond the title:

| Field | Notes |
|---|---|
| Title | `#video-title` — primary signal |
| Channel name | Strong signal; consider a separate channel-level allow/block |
| Duration | Badge overlay; use it to detect Shorts (<60s) |
| View count + upload age | Metadata line; useful for a "no clickbait/recency" rule |
| Video ID | From the `/watch?v=` href — your cache key |
| Thumbnail URL | Available if you ever want a CLIP-style pass. Skip for v1. |

Description snippets appear on **search results**, not the home grid. Don't build the scoring around them.

## Things to be careful of

**1. Markup churn.** YouTube ships DOM changes regularly. Anchor selectors on custom element tags (`ytd-rich-item-renderer`, `ytd-compact-video-renderer`, `ytd-video-renderer`) rather than CSS classes, which are generated and unstable. Keep every selector in one `selectors.js` so a break is a five-minute fix, not an archaeology dig.

**2. Lazy loading + infinite scroll.** Cards stream in continuously. MutationObserver on the grid container, `{ childList: true, subtree: true }`. Debounce ~100ms and batch — do not embed one title per callback.

**3. SPA navigation.** YouTube doesn't do full page loads. Listen for `yt-navigate-finish` and re-init; otherwise your observer detaches silently after the first click.

**4. Layout collapse.** `display: none` on grid items can leave gaps or trigger YouTube's own layout logic. Consider dimming/collapsing with a wrapper class first, and offer "hide" vs "dim" as a user setting — dim is much safer and lets people see what got filtered.

**5. Title-only signal is thin.** Titles are short and adversarially optimized. Expect false positives on clickbait and false negatives on vague-but-relevant titles. Mitigations: include channel name in the embedded string; let the user set threshold; log filtered items to a review panel so they can correct.

**6. Cold start cost.** First model download is ~23 MB. Do it on install/settings-save with a progress indicator, not on first feed render.

**7. Manifest V3.** Content scripts can't easily run heavy WASM. Use an offscreen document (Chrome) or a module worker for inference, message-pass scores back to the content script.

**8. Don't touch the network layer.** No API interception, no rate-limited endpoints. Purely reading already-rendered DOM in the user's own browser — this is what keeps you out of ToS trouble and out of a blocking category.

## Suggested v1 scope

Ship the dumbest thing that works:

1. Options page: intent textarea + threshold slider
2. Home feed only (skip watch-page sidebar, search, subscriptions)
3. Dim, don't hide
4. WASM only — add WebGPU after

Then iterate on selectors, add the sidebar, add the review panel.