/**
 * Sequential spotlight tour: dims the page, draws a highlight box around
 * each step's target element in turn, and shows a one-line tooltip with
 * Back/Next/Skip; Escape skips it. Steps whose selector doesn't resolve (layout variance,
 * a hidden section) are skipped rather than breaking the tour.
 */
export function startTour(steps, { onFinish, fixed = false } = {}) {
  let index = 0;

  const backdrop = document.createElement("div");
  backdrop.className = "tour-backdrop";

  const highlight = document.createElement("div");
  highlight.className = "tour-highlight";

  const tooltip = document.createElement("div");
  tooltip.className = "tour-tooltip";

  const stepEl = document.createElement("span");
  stepEl.className = "tour-step-count";

  const textEl = document.createElement("p");
  textEl.className = "tour-text";

  const controls = document.createElement("div");
  controls.className = "tour-controls";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "tour-skip";
  skipBtn.textContent = "Skip tour";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "tour-back";
  backBtn.textContent = "Back";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "tour-next";

  controls.append(skipBtn, backBtn, nextBtn);
  tooltip.append(stepEl, textEl, controls);

  function cleanup() {
    backdrop.remove();
    highlight.remove();
    tooltip.remove();
    window.removeEventListener("resize", render);
    document.removeEventListener("keydown", onKeydown, true);
  }

  function onKeydown(event) {
    if (event.key !== "Escape") return;
    // Skip the tour only — don't let Escape also close the host popup/page.
    event.preventDefault();
    event.stopPropagation();
    finish();
  }

  function finish() {
    cleanup();
    onFinish && onFinish();
  }

  function position(target) {
    const rect = target.getBoundingClientRect();
    const pad = 6;
    // `fixed` mode (popup, whose content scrolls inside a container rather
    // than the window) uses viewport coordinates, with no scroll offset.
    const sx = fixed ? 0 : window.scrollX;
    const sy = fixed ? 0 : window.scrollY;
    highlight.style.top = `${rect.top - pad + sy}px`;
    highlight.style.left = `${rect.left - pad + sx}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;

    let top = rect.bottom + 10;
    // Flip above the target when there is no room below it.
    if (fixed && top + tooltip.offsetHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - tooltip.offsetHeight - 10);
    }
    tooltip.style.top = `${top + sy}px`;
    // Keep the tooltip inside the viewport — targets near the right edge
    // (e.g. the master switch) would otherwise push it off-screen.
    const maxLeft = document.documentElement.clientWidth - tooltip.offsetWidth - 12;
    tooltip.style.left = `${Math.max(12, Math.min(rect.left, maxLeft)) + sx}px`;
  }

  function render() {
    if (index >= steps.length) {
      finish();
      return;
    }
    const step = steps[index];
    const target = document.querySelector(step.selector);
    if (!target) {
      index++;
      render();
      return;
    }

    // Instant in fixed mode so the highlight measures the final position.
    target.scrollIntoView({ block: "center", behavior: fixed ? "auto" : "smooth" });
    requestAnimationFrame(() => position(target));

    stepEl.textContent = `${index + 1} / ${steps.length}`;
    textEl.textContent = step.text;
    backBtn.style.visibility = index === 0 ? "hidden" : "visible";
    nextBtn.textContent = index === steps.length - 1 ? "Done" : "Next";
  }

  skipBtn.addEventListener("click", finish);
  backBtn.addEventListener("click", () => {
    if (index > 0) {
      index--;
      render();
    }
  });
  nextBtn.addEventListener("click", () => {
    index++;
    render();
  });
  window.addEventListener("resize", render);
  document.addEventListener("keydown", onKeydown, true);

  document.body.append(backdrop, highlight, tooltip);
  render();
}
