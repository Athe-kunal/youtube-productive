const DIM_CLASS = "yif-dimmed";

export function applyDecision(cardEl, decision) {
  if (decision === "dim") {
    cardEl.classList.add(DIM_CLASS);
  } else {
    cardEl.classList.remove(DIM_CLASS);
  }
}
