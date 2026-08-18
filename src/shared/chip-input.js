function normalize(s) {
  return s.trim().toLowerCase();
}

/**
 * Renders a tag/chip editor into `containerEl`: existing keywords as
 * removable pills, plus a text field that turns Enter/comma/blur into a
 * new chip. Keywords are lowercased on add so storage/matching never has
 * to reconcile casing later.
 */
export function createChipInput(containerEl, { initial = [], placeholder = "", onChange } = {}) {
  let chips = [...new Set(initial.map(normalize).filter(Boolean))];

  const inputEl = document.createElement("input");
  inputEl.type = "text";
  inputEl.className = "chip-input-field";
  inputEl.placeholder = placeholder;

  function render() {
    containerEl.innerHTML = "";
    for (const chip of chips) {
      const pill = document.createElement("span");
      pill.className = "chip";

      const label = document.createElement("span");
      label.className = "chip-label";
      label.textContent = chip;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "chip-remove";
      removeBtn.setAttribute("aria-label", `Remove ${chip}`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        chips = chips.filter((c) => c !== chip);
        render();
        onChange && onChange(chips);
      });

      pill.append(label, removeBtn);
      containerEl.appendChild(pill);
    }
    containerEl.appendChild(inputEl);
  }

  function commitInput() {
    const parts = inputEl.value.split(",").map(normalize).filter(Boolean);
    inputEl.value = "";
    if (parts.length === 0) return;
    let added = false;
    for (const part of parts) {
      if (!chips.includes(part)) {
        chips.push(part);
        added = true;
      }
    }
    if (added) {
      render();
      onChange && onChange(chips);
    } else {
      render(); // still clears the now-stale input rendering
    }
  }

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitInput();
    } else if (e.key === "Backspace" && inputEl.value === "" && chips.length > 0) {
      chips = chips.slice(0, -1);
      render();
      onChange && onChange(chips);
    }
  });
  inputEl.addEventListener("blur", commitInput);

  render();

  return {
    getChips: () => [...chips],
    setChips: (newChips) => {
      chips = [...new Set(newChips.map(normalize).filter(Boolean))];
      render();
    },
  };
}
