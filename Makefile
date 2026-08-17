.PHONY: regenerate-dist test fetch-model

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
