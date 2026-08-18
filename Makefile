.PHONY: regenerate-dist test fetch-model release

# Rebuilds dist/ from current source. After running this, reload the
# extension at chrome://extensions AND hard-refresh any open YouTube tabs —
# reloading the extension alone does not update JS/CSS already injected
# into tabs that were open before the reload.
regenerate-dist:
	npm run build

test:
	npm test

fetch-model:
	npm run fetch-model

# Builds a fresh dist/ and zips its *contents* (not the folder itself) into
# release.zip at the repo root — this is the file to upload to the Chrome
# Web Store dashboard. Includes the bundled model + WASM runtime, so it's
# tens of MB; that's expected for an offline-first extension.
release: regenerate-dist
	rm -f release.zip
	cd dist && zip -r -X ../release.zip . -x ".*"
	@echo "release.zip ready: $$(du -h release.zip | cut -f1)"
