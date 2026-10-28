// Arrow keys move between the buttons of a group (radio buttons and tabs work like this).
// Use it on the group's element together with a "roving" tabIndex: only the chosen button has tabIndex 0,
// the others -1, so one Tab press enters the group and one more leaves it.
export function arrowKeys(options, value, onChange) {
  return (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = options[(options.indexOf(value) + step + options.length) % options.length];
    onChange(next);
    e.currentTarget.querySelectorAll('button')[options.indexOf(next)]?.focus();
  };
}

// tabIndex for the button `option` of a group: the chosen one (or the first, when none is chosen) can be reached with Tab
export const rovingTab = (options, value, option) => (value === option || (!options.includes(value) && options[0] === option) ? 0 : -1);
