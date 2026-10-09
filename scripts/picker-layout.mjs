/* global document, getComputedStyle */

// Runs inside the browser so both language reviews use the same geometry checks.
export function pickerLayoutProblems() {
  const problems = [];
  const grids = new Set(
    [...document.querySelectorAll('[data-picker]')].map((field) => field.parentElement)
  );
  for (const grid of grids) {
    if (getComputedStyle(grid).display !== 'grid') continue;
    const rows = [];
    for (const field of grid.querySelectorAll(':scope > [data-picker]')) {
      if (!field.getClientRects().length || field.closest('[inert]')) continue;
      const top = field.getBoundingClientRect().top;
      let row = rows.find((row) => Math.abs(row.top - top) < 1);
      if (!row) rows.push((row = { top, fields: [] }));
      row.fields.push(field);
    }
    for (const { fields } of rows) {
      if (fields.length < 2) continue;
      const label = fields.map((field) => field.getAttribute('data-picker')).join(' / ');
      const aligned = (selector, edges, part) => {
        const elements = fields.map((field) => field.querySelector(selector));
        if (elements.some((element) => !element)) return;
        const bounds = elements.map((element) => element.getBoundingClientRect());
        for (const edge of edges) {
          if (
            Math.max(...bounds.map((box) => box[edge])) -
              Math.min(...bounds.map((box) => box[edge])) >
            1
          )
            problems.push(`${part} ${edge} misaligned: ${label}`);
        }
      };
      aligned(':scope > span', ['top'], 'Labels');
      aligned(':scope > button', ['top', 'bottom'], 'Cards');
      aligned('button > span > [data-rule-preview]', ['top', 'bottom'], 'Previews');
      aligned('button > span[id]', ['top'], 'Choice names');
      aligned('button > svg', ['top'], 'Chevrons');
      aligned(':scope > small', ['top'], 'Captions');
    }
  }
  for (const option of document.querySelectorAll('[role="option"]')) {
    if (!option.querySelector('[data-rule-preview]')) continue;
    const title = option.querySelector('strong');
    const mark = option.lastElementChild;
    if (
      title &&
      mark &&
      Math.abs(title.getBoundingClientRect().top - mark.getBoundingClientRect().top) > 1
    )
      problems.push(`Selection mark misaligned: ${title.textContent}`);
  }
  for (const preview of document.querySelectorAll('[data-rule-preview="contract"]')) {
    if (!preview.getClientRects().length || preview.closest('[inert]')) continue;
    const court = preview.querySelector(':scope > svg > rect').getBoundingClientRect();
    for (const annotation of preview.querySelectorAll(':scope > g')) {
      if (annotation.getBoundingClientRect().top < court.bottom + 1)
        problems.push('Contract annotation overlaps court hazards');
    }
  }
  return problems;
}

export function couchPresetLayoutProblems() {
  const problems = [];
  for (const presets of document.querySelectorAll('[data-couch-presets][open]')) {
    const bounds = presets.getBoundingClientRect();
    let previousBottom = presets.querySelector('summary').getBoundingClientRect().bottom;
    for (const row of presets.querySelectorAll(':scope > div')) {
      const buttons = [...row.querySelectorAll('button')];
      const boxes = buttons.map((button) => button.getBoundingClientRect());
      if (boxes.length !== 2) {
        problems.push('Couch slot needs Save and Load');
        continue;
      }
      const [left, right] = [...boxes].sort((a, b) => a.left - b.left);
      if (right.left - left.right < 8) problems.push('Couch buttons touch');
      if (Math.min(...boxes.map((box) => box.top)) - previousBottom < 8)
        problems.push('Couch rows touch');
      if (
        Math.abs(left.width - right.width) > 1 ||
        Math.abs(left.top - right.top) > 1 ||
        Math.abs(left.height - right.height) > 1
      )
        problems.push('Couch actions are misaligned');
      for (const [index, box] of boxes.entries()) {
        if (box.height < 44) problems.push('Small couch action target');
        if (
          box.left < bounds.left - 1 ||
          box.right > bounds.right + 1 ||
          buttons[index].scrollWidth > buttons[index].clientWidth + 1
        )
          problems.push('Couch action clips');
      }
      previousBottom = Math.max(...boxes.map((box) => box.bottom));
    }
  }
  return problems;
}
