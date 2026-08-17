import { TITLE_SELECTORS, CHANNEL_SELECTORS, LINK_SELECTORS, SKIP_TAGS } from "./selectors.js";

function queryFirst(root, selectors) {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function extractVideoId(cardEl) {
  const link = queryFirst(cardEl, LINK_SELECTORS);
  const href = link && link.getAttribute("href");
  if (!href) return null;
  const match = href.match(/[?&]v=([\w-]{6,})/);
  return match ? match[1] : null;
}

/**
 * Returns { videoId, title, channel, isShort } or null if required fields
 * are missing. Must never throw — YouTube's markup changes without notice,
 * and one bad card should not break the whole observer loop.
 */
export function extractCard(cardEl) {
  try {
    if (SKIP_TAGS.has(cardEl.tagName)) return null;
    if ([...SKIP_TAGS].some((tag) => cardEl.querySelector(tag.toLowerCase()))) return null;

    const titleEl = queryFirst(cardEl, TITLE_SELECTORS);
    const title = titleEl && (titleEl.getAttribute("title") || titleEl.textContent || "").trim();
    if (!title) return null;

    const videoId = extractVideoId(cardEl);
    if (!videoId) return null;

    const channelEl = queryFirst(cardEl, CHANNEL_SELECTORS);
    const channel = channelEl ? channelEl.textContent.trim() : "";

    return { videoId, title, channel, isShort: false };
  } catch {
    return null;
  }
}
