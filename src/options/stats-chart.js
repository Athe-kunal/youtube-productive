// Dependency-free inline-SVG grouped bar chart: one bar per configured
// series per day (by default videos filtered vs. videos unhidden). Bar
// colors come from the CSS classes in `bars`, so the stylesheet owns the
// palette.
const SVG_NS = "http://www.w3.org/2000/svg";

const WIDTH = 520;
const HEIGHT = 200;
const MARGIN = { top: 10, right: 8, bottom: 24, left: 30 };

function svg(name, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const child of children) el.append(child);
  return el;
}

// Chooses the axis top as 4 equal, whole-number gridline steps (never 12.5
// or 37.5). Small ranges use the next whole step; larger ones round the step
// up to a 1/1.2/1.5/2/2.5/3/4/5/6/8 x 10^n value so labels stay tidy without
// inflating the axis far past the data.
export function niceMax(value) {
  const raw = Math.max(4, value) / 4;
  if (raw <= 10) return Math.ceil(raw) * 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (raw <= m * pow) return m * pow * 4;
  }
  return 10 * pow * 4;
}

function shortDate(key) {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

const DEFAULT_OPTIONS = {
  bars: [
    { key: "filtered", cls: "chart-bar-filtered" },
    { key: "unhides", cls: "chart-bar-unhidden" },
  ],
  ariaLabel: "Videos filtered and unhidden per day",
  tooltip: (day) => `${day.date}: ${day.filtered} filtered, ${day.unhides} unhidden`,
};

export function renderStatsChart(container, series, options = {}) {
  const { bars, ariaLabel, tooltip } = { ...DEFAULT_OPTIONS, ...options };
  container.replaceChildren();

  const max = niceMax(Math.max(0, ...series.flatMap((d) => bars.map((b) => d[b.key]))));
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = plotW / series.length;
  // A lone series gets a wider bar so a single-measure chart doesn't look sparse.
  const barW = Math.max(2, Math.min(bars.length === 1 ? 22 : 14, slot * (bars.length === 1 ? 0.6 : 0.36)));
  const gap = 2;
  const groupW = bars.length * barW + (bars.length - 1) * gap;
  const y = (v) => MARGIN.top + plotH - (v / max) * plotH;

  const root = svg("svg", {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: "img",
    "aria-label": ariaLabel,
    class: "stats-svg",
  });

  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    root.append(
      svg("line", { x1: MARGIN.left, x2: WIDTH - MARGIN.right, y1: y(v), y2: y(v), class: "chart-grid" }),
      Object.assign(svg("text", { x: MARGIN.left - 6, y: y(v) + 3.5, class: "chart-tick", "text-anchor": "end" }), {
        textContent: v,
      })
    );
  }

  const labelEvery = series.length > 14 ? 5 : series.length > 7 ? 2 : 1;
  series.forEach((day, i) => {
    const cx = MARGIN.left + slot * i + slot / 2;
    const group = svg("g", { class: "chart-day" });
    group.append(Object.assign(svg("title"), { textContent: tooltip(day) }));
    // Full-slot transparent hit area so the tooltip works on empty days too.
    group.append(svg("rect", { x: cx - slot / 2, y: MARGIN.top, width: slot, height: plotH, fill: "transparent" }));
    bars.forEach(({ key, cls }, b) => {
      const h = (day[key] / max) * plotH;
      if (h <= 0) return;
      const x = cx - groupW / 2 + b * (barW + gap);
      group.append(svg("rect", { x, y: y(day[key]), width: barW, height: h, rx: 2, class: cls }));
    });
    root.append(group);
    if (i % labelEvery === 0 || i === series.length - 1) {
      root.append(
        Object.assign(svg("text", { x: cx, y: HEIGHT - 6, class: "chart-tick", "text-anchor": "middle" }), {
          textContent: shortDate(day.date),
        })
      );
    }
  });

  container.append(root);
}
