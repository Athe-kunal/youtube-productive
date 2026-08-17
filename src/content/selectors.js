// Centralized YouTube DOM selectors. If the feed layout breaks, this is the
// only file that should need touching — anchor on custom element tags,
// which are far more stable than YouTube's generated CSS classes.
//
// YouTube runs multiple markup variants concurrently (classic Polymer
// ytd-* ids vs. the newer "Lockup View Model" classes), seemingly per A/B
// cohort — so each field tries a list of candidate selectors in order
// rather than assuming a single shape.

// Per-page-type card boundary + observer target. Home feed cards
// (ytd-rich-item-renderer) and watch-page sidebar cards (yt-lockup-view-
// model) nest differently — yt-lockup-view-model appears *inside*
// ytd-rich-item-renderer on the home feed too, so the two configs must
// stay page-scoped rather than merged into one selector, or home-feed
// cards would get extracted twice (once as the outer wrapper, once as
// the inner lockup element).
export const PAGE_CONFIGS = {
  home: {
    matchesPath: (path) => path === "/",
    feedContainer: "ytd-rich-grid-renderer #contents",
    cardSelector: "ytd-rich-item-renderer",
  },
  watchSidebar: {
    matchesPath: (path) => path === "/watch",
    feedContainer: "ytd-watch-next-secondary-results-renderer",
    cardSelector: "yt-lockup-view-model",
  },
};

export function getPageConfig(path) {
  for (const config of Object.values(PAGE_CONFIGS)) {
    if (config.matchesPath(path)) return config;
  }
  return null;
}

// Video link doubles as the videoId source for both markup variants —
// any anchor pointing at /watch works regardless of which title markup
// is used.
export const LINK_SELECTORS = [
  "a#video-title-link",
  "a#thumbnail",
  "a.ytLockupMetadataViewModelTitle",
  'a[href*="/watch"]',
  'a[href*="/shorts/"]',
];

export const TITLE_SELECTORS = [
  "#video-title",
  ".ytLockupMetadataViewModelTitle",
  ".ytLockupMetadataViewModelHeadingReset",
];

export const CHANNEL_SELECTORS = [
  "ytd-channel-name #text",
  "ytd-channel-name yt-formatted-string",
  ".ytAttributedStringLink",
  // Sidebar cards don't wrap the channel name in a distinct link class —
  // it's just the first of several plain metadata-text spans (channel,
  // view count, upload age, in that DOM order), so "first match" doubles
  // as "channel name" here.
  ".ytContentMetadataViewModelMetadataText",
];

// v1 skips ads and algorithmic shelves entirely — they are never scored.
export const SKIP_TAGS = new Set([
  "YTD-AD-SLOT-RENDERER",
  "YTD-RICH-SHELF-RENDERER",
  "YTD-DISPLAY-AD-RENDERER",
  "YTD-PROMOTED-SPARKLES-WEB-RENDERER",
]);

// Class-based ad marker for Lockup-style cards (home feed's inline ads and
// the watch sidebar's promoted cards both carry this badge) — stable
// across locales, unlike matching on "Sponsored" text.
export const SKIP_SELECTORS = [".ytBadgeShapeAd"];
