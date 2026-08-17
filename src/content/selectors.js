// Centralized YouTube DOM selectors. If the feed layout breaks, this is the
// only file that should need touching — anchor on custom element tags,
// which are far more stable than YouTube's generated CSS classes.
//
// YouTube runs multiple markup variants concurrently (classic Polymer
// ytd-* ids vs. the newer "Lockup View Model" classes), seemingly per A/B
// cohort — so each field tries a list of candidate selectors in order
// rather than assuming a single shape.

export const FEED_CONTAINER = "ytd-rich-grid-renderer #contents";
export const CARD_SELECTOR = "ytd-rich-item-renderer";

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

export const TITLE_SELECTORS = ["#video-title", ".ytLockupMetadataViewModelTitle"];

export const CHANNEL_SELECTORS = [
  "ytd-channel-name #text",
  "ytd-channel-name yt-formatted-string",
  ".ytAttributedStringLink",
];

// v1 skips ads and algorithmic shelves entirely — they are never scored.
export const SKIP_TAGS = new Set([
  "YTD-AD-SLOT-RENDERER",
  "YTD-RICH-SHELF-RENDERER",
  "YTD-DISPLAY-AD-RENDERER",
  "YTD-PROMOTED-SPARKLES-WEB-RENDERER",
]);
