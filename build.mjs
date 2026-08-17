import * as esbuild from "esbuild";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");
const outdir = "dist";

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
    await fs.cp("models", path.join(outdir, "models"), { recursive: true });
  }
}

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
    console.log("Build complete.");
  }
}

build();
