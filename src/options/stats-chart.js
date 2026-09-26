// Dependency-free inline-SVG grouped bar chart: two bars per day (videos
// filtered vs. videos unhidden). Colors come from CSS custom properties on
// the container (--chart-filtered / --chart-unhidden) so the stylesheet owns
// the palette.
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

export function renderStatsChart(container, series) {
  container.replaceChildren();

  const max = niceMax(Math.max(0, ...series.flatMap((d) => [d.filtered, d.unhides])));
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = plotW / series.length;
  const barW = Math.max(2, Math.min(14, slot * 0.36));
  const y = (v) => MARGIN.top + plotH - (v / max) * plotH;

  const root = svg("svg", {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: "img",
    "aria-label": "Videos filtered and unhidden per day",
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
    const label = `${day.date}: ${day.filtered} filtered, ${day.unhides} unhidden`;
    group.append(Object.assign(svg("title"), { textContent: label }));
    // Full-slot transparent hit area so the tooltip works on empty days too.
    group.append(svg("rect", { x: cx - slot / 2, y: MARGIN.top, width: slot, height: plotH, fill: "transparent" }));
    for (const [key, cls, offset] of [
      ["filtered", "chart-bar-filtered", -barW - 1],
      ["unhides", "chart-bar-unhidden", 1],
    ]) {
      const h = (day[key] / max) * plotH;
      if (h <= 0) continue;
      group.append(
        svg("rect", { x: cx + offset, y: y(day[key]), width: barW, height: h, rx: 2, class: cls })
      );
    }
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
