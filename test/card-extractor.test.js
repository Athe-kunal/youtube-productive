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

test("extractCard: never throws on an empty element", () => {
  const window = new Window();
  const empty = window.document.createElement("ytd-rich-item-renderer");
  assert.doesNotThrow(() => extractCard(empty));
  assert.equal(extractCard(empty), null);
});
