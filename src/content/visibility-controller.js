const DIM_CLASS = "yif-dimmed";

export function applyDecision(cardEl, decision) {
  if (decision === "dim") {
    cardEl.classList.add(DIM_CLASS);
  } else {
    cardEl.classList.remove(DIM_CLASS);
  }
}

// Lets a pass that's skipping re-extraction/re-scoring for an already-
// decided card (see content-script.js's yifVersion fast path) recover its
// decision straight from the DOM, since that's the only place it's recorded
// once cardState has been cleared (e.g. by SPA back-navigation restoring a
// cached, already-stamped card into a fresh page-scoped cardState map).
export function isDimmed(cardEl) {
  return cardEl.classList.contains(DIM_CLASS);
}
