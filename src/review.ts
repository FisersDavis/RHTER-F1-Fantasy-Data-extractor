import { createAreaChart } from './areaChart.js';
import { importJSON, saveReviewedDataset, getImportedViolins } from './dataStore.js';
import { CONSTRUCTOR_COLORS, TEAMS } from './config.js';
import type { ViolinCrop } from './types.js';

let violins: ViolinCrop[] = [];

document.addEventListener('click', () => {
  document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
});

function computeGlobalBounds(data: ViolinCrop[]): { globalMin: number; globalMax: number } {
  let min = Infinity, max = -Infinity;
  for (const v of data) {
    if (v.percentiles.p05 < min) min = v.percentiles.p05;
    if (v.percentiles.p95 > max) max = v.percentiles.p95;
  }
  return { globalMin: min, globalMax: max };
}

function makeConstructorBadge(violin: ViolinCrop, which: 'cn1' | 'cn2'): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'constructor-badge';

  const dot = document.createElement('span');
  dot.className = 'color-dot';
  const team = violin.constructors[which].team;
  dot.style.background = CONSTRUCTOR_COLORS[team] ?? '#888';

  const label = document.createElement('span');
  label.textContent = team;

  const dropdown = document.createElement('div');
  dropdown.className = 'constructor-dropdown';

  for (const t of TEAMS) {
    const opt = document.createElement('button');
    const optDot = document.createElement('span');
    optDot.className = 'color-dot';
    optDot.style.background = CONSTRUCTOR_COLORS[t] ?? '#888';
    opt.appendChild(optDot);
    opt.appendChild(document.createTextNode(t));
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      violin.constructors[which].team = t;
      dot.style.background = CONSTRUCTOR_COLORS[t] ?? '#888';
      label.textContent = t;
      dropdown.classList.remove('open');
      saveReviewedDataset(violins);
    });
    dropdown.appendChild(opt);
  }

  wrapper.appendChild(dot);
  wrapper.appendChild(label);
  wrapper.appendChild(dropdown);

  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) dropdown.classList.add('open');
  });

  return wrapper;
}

function makeCard(violin: ViolinCrop, globalMin: number, globalMax: number, overBudget: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'violin-card';
  if (violin.flagged || violin.confidence !== 'high') card.classList.add('flagged');
  if (overBudget) card.classList.add('over-budget');

  const ptsPerM = violin.header.budget_required > 0
    ? (violin.header.avg_xpts / violin.header.budget_required).toFixed(1)
    : '—';
  const statRow = document.createElement('div');
  statRow.className = 'card-stat-row';
  const uplift = violin.header.avg_budget_uplift != null
    ? `+${violin.header.avg_budget_uplift}M`
    : '';
  statRow.textContent = `${violin.header.budget_required}M  ${violin.header.avg_xpts}PTS  ${uplift}  ${ptsPerM}$/PT`;
  card.appendChild(statRow);

  const pctRow = document.createElement('div');
  pctRow.className = 'card-percentile-row';
  const p = violin.percentiles;
  pctRow.textContent = `P05:${p.p05}  P25:${p.p25}  P50:${p.p50}  P75:${p.p75}  P95:${p.p95}`;
  card.appendChild(pctRow);

  const driverRow = document.createElement('div');
  driverRow.className = 'card-drivers';
  for (const driver of violin.drivers) {
    const span = document.createElement('span');
    span.className = 'driver-name' + (driver.multiplier ? ' multiplier' : '');
    span.textContent = driver.multiplier ? `${driver.name}(${driver.multiplier})` : driver.name;
    span.title = 'Click to edit';
    span.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = driver.name;
      input.maxLength = 3;
      input.style.cssText = 'width:3ch;background:#0a0a0a;color:#e0e0e0;border:1px solid #62eeb7;font-family:monospace;font-size:10px;padding:0;text-align:center;';
      span.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const val = input.value.trim().toUpperCase().slice(0, 3) || driver.name;
        driver.name = val;
        span.textContent = driver.multiplier ? `${val}(${driver.multiplier})` : val;
        input.replaceWith(span);
        saveReviewedDataset(violins);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') input.replaceWith(span);
      });
    });
    driverRow.appendChild(span);
  }
  card.appendChild(driverRow);

  const cnRow = document.createElement('div');
  cnRow.className = 'card-constructors';
  cnRow.appendChild(makeConstructorBadge(violin, 'cn1'));
  cnRow.appendChild(makeConstructorBadge(violin, 'cn2'));
  card.appendChild(cnRow);

  const chartWrap = document.createElement('div');
  chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 100, 30));
  card.appendChild(chartWrap);

  return card;
}

function renderGrid(container: HTMLElement, data: ViolinCrop[], budget: number): void {
  container.innerHTML = '';
  const { globalMin, globalMax } = computeGlobalBounds(data);

  const sorted = [...data].sort((a, b) => a.row - b.row || a.col - b.col);
  const affordable = sorted.filter(v => v.header.budget_required <= budget);
  const overBudget = sorted.filter(v => v.header.budget_required > budget);

  const grid = document.createElement('div');
  grid.className = 'violin-grid';

  for (const v of affordable) grid.appendChild(makeCard(v, globalMin, globalMax, false));
  for (const v of overBudget) grid.appendChild(makeCard(v, globalMin, globalMax, true));

  container.appendChild(grid);
}

export function initReview(container: HTMLElement): void {
  violins = [];
  const section = document.createElement('section');

  const topbar = document.createElement('div');
  topbar.className = 'review-topbar';

  const budgetField = document.createElement('div');
  budgetField.className = 'topbar-field';
  const budgetLabel = document.createElement('span');
  budgetLabel.className = 'topbar-label';
  budgetLabel.textContent = 'BUDGET (M)';
  const budgetInput = document.createElement('input');
  budgetInput.type = 'number';
  budgetInput.step = '0.1';
  budgetInput.min = '0';
  budgetInput.style.width = '80px';
  budgetInput.value = localStorage.getItem('userBudget') ?? '105';
  budgetField.appendChild(budgetLabel);
  budgetField.appendChild(budgetInput);
  topbar.appendChild(budgetField);

  const importField = document.createElement('div');
  importField.className = 'topbar-import';
  const importFieldLabel = document.createElement('span');
  importFieldLabel.className = 'topbar-label';
  importFieldLabel.textContent = 'LOAD JSON';
  const importRow = document.createElement('div');
  importRow.className = 'topbar-import-row';
  const pasteArea = document.createElement('textarea');
  pasteArea.placeholder = 'Paste or drop pipeline JSON…';
  const importBtn = document.createElement('button');
  importBtn.className = 'btn';
  importBtn.textContent = 'LOAD JSON';
  importRow.appendChild(pasteArea);
  importRow.appendChild(importBtn);
  importField.appendChild(importFieldLabel);
  importField.appendChild(importRow);
  topbar.appendChild(importField);
  section.appendChild(topbar);

  const summaryEl = document.createElement('div');
  summaryEl.className = 'review-summary';
  section.appendChild(summaryEl);

  const errorEl = document.createElement('div');
  section.appendChild(errorEl);

  const gridContainer = document.createElement('div');
  section.appendChild(gridContainer);

  pasteArea.addEventListener('dragover', (e) => e.preventDefault());
  pasteArea.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { pasteArea.value = reader.result as string; };
    reader.readAsText(file);
  });

  function getBudget(): number { return parseFloat(budgetInput.value) || Infinity; }

  function updateSummary(): void {
    if (!violins.length) { summaryEl.textContent = ''; return; }
    const budget = getBudget();
    const affordable = violins.filter(v => v.header.budget_required <= budget).length;
    const over = violins.length - affordable;
    summaryEl.textContent = `${violins.length} VIOLINS — ${affordable} AFFORDABLE — ${over} OVER BUDGET`;
  }

  function loadData(data: ViolinCrop[]): void {
    violins = data;
    errorEl.textContent = '';
    errorEl.className = '';
    updateSummary();
    renderGrid(gridContainer, violins, getBudget());
    saveReviewedDataset(violins);
  }

  budgetInput.addEventListener('input', () => {
    localStorage.setItem('userBudget', budgetInput.value);
    updateSummary();
    if (violins.length) renderGrid(gridContainer, violins, getBudget());
  });

  importBtn.addEventListener('click', () => {
    errorEl.textContent = '';
    errorEl.className = '';
    try {
      const parsed = JSON.parse(pasteArea.value.trim()) as unknown;
      importJSON(parsed);
      loadData(parsed as ViolinCrop[]);
    } catch (err) {
      errorEl.className = 'import-error';
      errorEl.textContent = `ERROR: ${(err as Error).message}`;
    }
  });

  const persisted = getImportedViolins();
  if (persisted) loadData(persisted);

  container.appendChild(section);
}
