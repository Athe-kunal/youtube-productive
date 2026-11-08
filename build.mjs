import * as esbuild from "esbuild";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { MODELS, resolveModelKey } from "./src/shared/models.js";

const watch = process.argv.includes("--watch");
const outdir = "dist";
// Which embedding model to bake in: MODEL=bge-small | e5-small (default bge-small).
const modelKey = resolveModelKey(process.env.MODEL);

async function clean() {
  await fs.rm(outdir, { recursive: true, force: true });
  await fs.mkdir(outdir, { recursive: true });
}

async function copyStatic() {
  const copies = [
    ["manifest.json", "manifest.json"],
    ["icons", "icons"],
    ["src/offscreen/offscreen.html", "offscreen/offscreen.html"],
    ["src/options/options.html", "options/options.html"],
    ["src/options/options.css", "options/options.css"],
    ["src/content/content.css", "content/content.css"],
    ["src/popup/popup.html", "popup/popup.html"],
    ["src/popup/popup.css", "popup/popup.css"],
  ];
  for (const [from, to] of copies) {
    const dest = path.join(outdir, to);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(from, dest, { recursive: true });
  }

  if (existsSync("models")) {
    // Threaded WASM builds are never loaded (single-threaded only); skip any
    // left over in models/ from an older fetch so they don't bloat the package.
    // Only the active model (MODEL_TIERS) + the WASM runtime ship; any other
    // model left over in models/ from an earlier fetch is skipped.
    const modelDirs = [path.join("models", MODELS[modelKey].id)];
    if (!existsSync(modelDirs[0])) {
      throw new Error(`Model "${modelKey}" is not in models/. Run: make fetch-model MODEL=${modelKey}`);
    }
    const keep = (src) => {
      if (src === "models") return true;
      if (src === path.join("models", "wasm") || src.startsWith(path.join("models", "wasm") + path.sep)) {
        return !src.includes("-threaded");
      }
      return modelDirs.some((d) => src === d || src.startsWith(d + path.sep) || d.startsWith(src + path.sep));
    };
    await fs.cp("models", path.join(outdir, "models"), { recursive: true, filter: keep });
  }
}

// transformers.js hard-codes its default Hub host ("https://huggingface.co/")
// and a Hub-URL allowlist into the bundle. Remote loading is permanently off
// here (models ship inside the package — see src/lib/model-loader.js), so
// those strings are dead code — but browsers such as Brave flag extensions
// whose bundles contain them. Rewriting them to an unroutable placeholder
// keeps the shipped JS free of any Hugging Face URL.
const HUB_RE = /huggingface|\bhf\.co\b/i;
const stripHubHosts = {
  name: "strip-hub-hosts",
  setup(build) {
    build.onLoad({ filter: /node_modules[\\/]@xenova[\\/]transformers[\\/].*\.js$/ }, async (args) => {
      const source = await fs.readFile(args.path, "utf8");
      const contents = source.replace(/https:\/\/huggingface\.co\/?/g, "https://hub.invalid/").replace(/\b(?:huggingface|hf)\.co\b/g, "hub.invalid");
      return { contents, loader: "js" };
    });

    // What's left after the rewrite above is comment-only (upstream doc
    // links and esbuild's own "// node_modules/@huggingface/..." path
    // banner). Drop those comment lines from the output, then fail the
    // build if any reference survives anywhere in the bundle.
    build.onEnd(async () => {
      const outfile = build.initialOptions.outfile;
      const built = await fs.readFile(outfile, "utf8");
      const cleaned = built
        .split("\n")
        .filter((line) => !(/^\s*(\/\/|\*|\/\*)/.test(line) && HUB_RE.test(line)))
        .join("\n");
      if (HUB_RE.test(cleaned)) {
        throw new Error(`${outfile} still references Hugging Face — see build.mjs#stripHubHosts`);
      }
      if (cleaned !== built) await fs.writeFile(outfile, cleaned);
    });
  },
};

const entryPoints = [
  { in: "src/content/content-script.js", out: "content/content-script", format: "iife" },
  { in: "src/background/service-worker.js", out: "background/service-worker", format: "esm" },
  { in: "src/offscreen/offscreen.js", out: "offscreen/offscreen", format: "esm" },
  { in: "src/options/options.js", out: "options/options", format: "esm" },
  { in: "src/popup/popup.js", out: "popup/popup", format: "esm" },
];

async function build() {
  await clean();
  await copyStatic();

  const contexts = await Promise.all(
    entryPoints.map((entry) =>
      esbuild.context({
        entryPoints: [entry.in],
        outfile: path.join(outdir, `${entry.out}.js`),
        bundle: true,
        plugins: [stripHubHosts],
        define: { __MODEL_KEY__: JSON.stringify(modelKey) },
        format: entry.format,
        target: "chrome109",
        logLevel: "info",
      })
    )
  );

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("Watching for changes...");
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    console.log(`Build complete (model: ${modelKey}).`);
  }
}

build();
