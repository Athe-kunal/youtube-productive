/**
 * Sequential spotlight tour: dims the page, draws a highlight box around
 * each step's target element in turn, and shows a one-line tooltip with
 * Back/Next/Skip. Steps whose selector doesn't resolve (layout variance,
 * a hidden section) are skipped rather than breaking the tour.
 */
export function startTour(steps, { onFinish } = {}) {
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
  }

  function finish() {
    cleanup();
    onFinish && onFinish();
  }

  function position(target) {
    const rect = target.getBoundingClientRect();
    const pad = 6;
    highlight.style.top = `${rect.top - pad + window.scrollY}px`;
    highlight.style.left = `${rect.left - pad + window.scrollX}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;

    tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
    tooltip.style.left = `${Math.max(12, rect.left + window.scrollX)}px`;
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

    target.scrollIntoView({ block: "center", behavior: "smooth" });
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

  document.body.append(backdrop, highlight, tooltip);
  render();
}
