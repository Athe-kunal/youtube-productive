import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { extractCard } from "../src/content/card-extractor.js";

const FIXTURE_HTML = `
<ytd-rich-item-renderer>
  <div id="content">
    <a id="thumbnail" href="/watch?v=abc123XYZ89"></a>
    <div id="meta">
      <a id="video-title-link" href="/watch?v=abc123XYZ89">
        <yt-formatted-string id="video-title" title="Distributed training at scale">
          Distributed training at scale
        </yt-formatted-string>
      </a>
      <ytd-channel-name>
        <a><yt-formatted-string id="text">Some AI Channel</yt-formatted-string></a>
      </ytd-channel-name>
    </div>
  </div>
</ytd-rich-item-renderer>
`;

const MISSING_TITLE_HTML = `
<ytd-rich-item-renderer>
  <a id="thumbnail" href="/watch?v=abc123XYZ89"></a>
</ytd-rich-item-renderer>
`;

const AD_SLOT_HTML = `<ytd-ad-slot-renderer></ytd-ad-slot-renderer>`;

const NESTED_AD_SLOT_HTML = `
<ytd-rich-item-renderer>
  <div id="content">
    <ytd-ad-slot-renderer></ytd-ad-slot-renderer>
  </div>
</ytd-rich-item-renderer>
`;

const SHORTS_FIXTURE_HTML = `
<ytd-rich-item-renderer>
  <div id="content">
    <a id="thumbnail" href="/shorts/shortsId123"></a>
    <div id="meta">
      <a id="video-title-link" href="/shorts/shortsId123">
        <yt-formatted-string id="video-title" title="Quick recipe hack">
          Quick recipe hack
        </yt-formatted-string>
      </a>
      <ytd-channel-name>
        <a><yt-formatted-string id="text">Some Cooking Channel</yt-formatted-string></a>
      </ytd-channel-name>
    </div>
  </div>
</ytd-rich-item-renderer>
`;

// Current "Lockup View Model" markup — no #video-title id, classes instead.
const LOCKUP_FIXTURE_HTML = `
<ytd-rich-item-renderer>
  <div id="content">
    <a class="ytLockupViewModelContentImage" href="/watch?v=lockup12345"></a>
    <a class="ytLockupMetadataViewModelTitle" href="/watch?v=lockup12345">
      <span>Distributed training at scale</span>
    </a>
    <a class="ytAttributedStringLink ytAttributedStringLinkCallToActionCol" href="/@SomeAIChannel">Some AI Channel</a>
  </div>
</ytd-rich-item-renderer>
`;

// Watch-page sidebar markup — h3.ytLockupMetadataViewModelHeadingReset for
// the title (not the anchor itself, unlike the home-feed lockup card), and
// channel is just the first plain metadata-text span.
const SIDEBAR_FIXTURE_HTML = `
<yt-lockup-view-model>
  <a class="ytLockupViewModelContentImage" href="/watch?v=sidebar98765"></a>
  <h3 class="ytLockupMetadataViewModelHeadingReset">GPT-5 explained: what changed under the hood</h3>
  <span class="ytContentMetadataViewModelMetadataText">Some AI Channel</span>
  <span class="ytContentMetadataViewModelMetadataText">1.2M views</span>
</yt-lockup-view-model>
`;

const SIDEBAR_AD_FIXTURE_HTML = `
<yt-lockup-view-model>
  <a class="ytLockupViewModelContentImage" href="/watch?v=sponsored123"></a>
  <h3 class="ytLockupMetadataViewModelHeadingReset">Meet your match in 26 different styles</h3>
  <span class="ytBadgeShapeAd">Ad</span>
</yt-lockup-view-model>
`;

function parse(html) {
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document.body.firstElementChild;
}

test("extractCard: extracts videoId, title, channel from a well-formed card", () => {
  const card = parse(FIXTURE_HTML);
  const result = extractCard(card);
  assert.deepEqual(result, {
    videoId: "abc123XYZ89",
    title: "Distributed training at scale",
    channel: "Some AI Channel",
    isShort: false,
  });
});

test("extractCard: returns null when title is missing", () => {
  const card = parse(MISSING_TITLE_HTML);
  assert.equal(extractCard(card), null);
});

test("extractCard: skips ad slots", () => {
  const card = parse(AD_SLOT_HTML);
  assert.equal(extractCard(card), null);
});

test("extractCard: skips cards with a nested ad slot renderer", () => {
  const card = parse(NESTED_AD_SLOT_HTML);
  assert.equal(extractCard(card), null);
});

test("extractCard: extracts a Shorts card from a /shorts/ href, marked isShort", () => {
  const card = parse(SHORTS_FIXTURE_HTML);
  const result = extractCard(card);
  assert.deepEqual(result, {
    videoId: "shortsId123",
    title: "Quick recipe hack",
    channel: "Some Cooking Channel",
    isShort: true,
  });
});

test("extractCard: extracts from the current Lockup View Model markup", () => {
  const card = parse(LOCKUP_FIXTURE_HTML);
  const result = extractCard(card);
  assert.deepEqual(result, {
    videoId: "lockup12345",
    title: "Distributed training at scale",
    channel: "Some AI Channel",
    isShort: false,
  });
});

test("extractCard: extracts from the watch-page sidebar markup", () => {
  const card = parse(SIDEBAR_FIXTURE_HTML);
  const result = extractCard(card);
  assert.deepEqual(result, {
    videoId: "sidebar98765",
    title: "GPT-5 explained: what changed under the hood",
    channel: "Some AI Channel",
    isShort: false,
  });
});

test("extractCard: skips a promoted sidebar card via the ad badge class", () => {
  const card = parse(SIDEBAR_AD_FIXTURE_HTML);
  assert.equal(extractCard(card), null);
});

test("extractCard: never throws on an empty element", () => {
  const window = new Window();
  const empty = window.document.createElement("ytd-rich-item-renderer");
  assert.doesNotThrow(() => extractCard(empty));
  assert.equal(extractCard(empty), null);
});
