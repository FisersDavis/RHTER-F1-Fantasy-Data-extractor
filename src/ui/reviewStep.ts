import { getImportedViolins, saveReviewedDataset } from '../dataStore.js';
import type { WizardState } from './wizardShell.js';
import type { ViolinCrop } from '../types.js';

type FilterMode = 'all' | 'flagged';

export function renderReviewStep(
  container: HTMLElement,
  state: WizardState,
  onApprove: () => void,
  onBack: () => void
): void {
  let violins: ViolinCrop[] = getImportedViolins() ?? [];
  let filterMode: FilterMode = 'all';

  const section = document.createElement('div');
  section.className = 'flex flex-col gap-4';
  container.appendChild(section);

  // Budget card
  const budgetCard = document.createElement('div');
  budgetCard.className = 'bg-bg1 border border-border p-[28px] grid grid-cols-3 gap-8';

  const col1 = document.createElement('div');
  col1.className = 'flex flex-col gap-1';
  const budgetLbl = document.createElement('span');
  budgetLbl.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  budgetLbl.textContent = 'BUDGET';
  const budgetInput = document.createElement('input');
  budgetInput.type = 'number';
  budgetInput.step = '0.1';
  budgetInput.value = String(state.budget);
  budgetInput.className = 'bg-transparent border-b border-accent text-[32px] font-mono font-bold text-text w-[120px] outline-none';
  col1.appendChild(budgetLbl);
  col1.appendChild(budgetInput);
  budgetCard.appendChild(col1);

  const col2 = document.createElement('div');
  col2.className = 'flex flex-col gap-1';
  const teamsLbl = document.createElement('span');
  teamsLbl.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  teamsLbl.textContent = 'TEAMS IN BUDGET';
  const teamsVal = document.createElement('span');
  teamsVal.className = 'text-[32px] font-mono font-bold text-text';
  col2.appendChild(teamsLbl);
  col2.appendChild(teamsVal);
  budgetCard.appendChild(col2);

  const col3 = document.createElement('div');
  col3.className = 'flex flex-col gap-2';
  const statsLabel = document.createElement('span');
  statsLabel.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  statsLabel.textContent = 'EXTRACTION STATS';
  col3.appendChild(statsLabel);
  const statParsed = makeStatPair('TEAMS PARSED', String(violins.length));
  const statFlagged = makeStatPair('FLAGGED', String(violins.filter(v => v.flagged).length));
  const statConf = makeStatPair('CONFIDENCE', violins.length ? `${Math.round(violins.filter(v => v.confidence === 'high').length / violins.length * 100)}%` : '—');
  col3.appendChild(statParsed);
  col3.appendChild(statFlagged);
  col3.appendChild(statConf);
  budgetCard.appendChild(col3);

  section.appendChild(budgetCard);

  // Table toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center justify-between';
  const flagCountLabel = document.createElement('span');
  flagCountLabel.className = 'font-mono text-[10px] uppercase tracking-[0.18em]';
  const toggleGroup = document.createElement('div');
  toggleGroup.className = 'flex gap-4';
  const toggleAll = document.createElement('button');
  toggleAll.className = 'font-mono text-[10px] uppercase tracking-[0.18em]';
  toggleAll.textContent = 'ALL ROWS';
  const toggleFlagged = document.createElement('button');
  toggleFlagged.className = 'font-mono text-[10px] uppercase tracking-[0.18em]';
  toggleFlagged.textContent = '⚑ FLAGGED ONLY';
  toggleGroup.appendChild(toggleFlagged);
  toggleGroup.appendChild(toggleAll);
  toolbar.appendChild(flagCountLabel);
  toolbar.appendChild(toggleGroup);
  section.appendChild(toolbar);

  // Table
  const tableWrap = document.createElement('div');
  tableWrap.className = 'border border-border';
  section.appendChild(tableWrap);

  // Action bar
  const actionBar = document.createElement('div');
  actionBar.className = 'sticky bottom-0 bg-bg border-t border-border px-[40px] py-[14px] flex items-center justify-between';
  const backBtn = document.createElement('button');
  backBtn.textContent = '← BACK';
  backBtn.className = 'border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:border-text hover:text-text transition-colors duration-100';
  backBtn.addEventListener('click', onBack);
  const rightBar = document.createElement('div');
  rightBar.className = 'flex items-center gap-4';
  const approveBtn = document.createElement('button');
  approveBtn.textContent = 'APPROVE DATA + CONTINUE →';
  approveBtn.className = 'bg-accent text-white font-mono text-[10px] uppercase tracking-[0.18em] px-[20px] py-[8px]';
  rightBar.appendChild(approveBtn);
  actionBar.appendChild(backBtn);
  actionBar.appendChild(rightBar);
  container.appendChild(actionBar);

  function updateBudgetCount(): void {
    const budget = parseFloat(budgetInput.value) || Infinity;
    teamsVal.textContent = String(violins.filter(v => v.header.budget_required <= budget).length);
  }

  function updateFlagState(): void {
    const unresolved = violins.filter(v => v.flagged).length;
    flagCountLabel.textContent = `${unresolved} FLAG${unresolved !== 1 ? 'S' : ''}`;
    flagCountLabel.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${unresolved > 0 ? 'text-accent' : 'text-dim'}`;
    approveBtn.disabled = unresolved > 0;
    approveBtn.classList.toggle('opacity-30', unresolved > 0);
    approveBtn.classList.toggle('cursor-not-allowed', unresolved > 0);
    approveBtn.onclick = unresolved > 0 ? null : () => { saveReviewedDataset(violins); onApprove(); };
  }

  function renderTable(): void {
    tableWrap.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'grid border-b border-border';
    header.style.gridTemplateColumns = '44px 84px 1fr 72px 72px 72px 76px 100px';
    ['ROW', 'BUDGET', 'LINEUP', 'P50', 'P75', 'P95', 'KELLY', 'STATUS'].forEach(col => {
      const th = document.createElement('div');
      th.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono px-[8px] py-[10px]';
      th.textContent = col;
      header.appendChild(th);
    });
    tableWrap.appendChild(header);

    const displayViolins = filterMode === 'flagged' ? violins.filter(v => v.flagged) : violins;

    for (const violin of displayViolins) {
      const kelly = estimateKellyForDisplay(violin);
      const isFlagged = violin.flagged;

      const row = document.createElement('div');
      row.className = `grid border-b border-border font-mono text-[11px] ${isFlagged ? 'border-l-2 border-accent bg-[rgba(232,64,28,0.12)]' : 'bg-bg1 hover:bg-bg2'}`;
      row.style.gridTemplateColumns = '44px 84px 1fr 72px 72px 72px 76px 100px';

      const p = violin.percentiles;
      const cells = [
        String(violin.row * 24 + violin.col + 1),
        `${violin.header.budget_required}M`,
        violin.drivers.map(d => d.multiplier ? `${d.name}(${d.multiplier})` : d.name).join(' ') + ` [${violin.constructors.cn1.team}][${violin.constructors.cn2.team}]`,
        String(p.p50),
        String(p.p75),
        isFlagged ? `${p.p95} ⚑` : String(p.p95),
        (kelly * 100).toFixed(0) + '%',
        '',
      ];

      cells.forEach((text, ci) => {
        const td = document.createElement('div');
        td.className = `px-[8px] py-[10px] ${ci === 6 ? 'text-accent' : ''} ${ci === 5 && isFlagged ? 'text-accent' : ''}`;
        if (ci === 7) {
          if (isFlagged) {
            const editBtn = document.createElement('button');
            editBtn.textContent = 'EDIT';
            editBtn.className = 'border border-accent text-accent font-mono text-[9px] px-[8px] py-[3px] mr-1';
            editBtn.addEventListener('click', () => toggleEditPanel(violin, row));
            const okBtn = document.createElement('button');
            okBtn.textContent = 'OK';
            okBtn.className = 'border border-border text-dim font-mono text-[9px] px-[8px] py-[3px]';
            okBtn.addEventListener('click', () => {
              violin.flagged = false;
              saveReviewedDataset(violins);
              updateFlagState();
              renderTable();
            });
            td.appendChild(editBtn);
            td.appendChild(okBtn);
          }
        } else {
          td.textContent = text;
        }
        row.appendChild(td);
      });

      tableWrap.appendChild(row);
    }
  }

  function toggleEditPanel(violin: ViolinCrop, row: HTMLElement): void {
    const existing = row.nextElementSibling;
    if (existing?.classList.contains('edit-panel')) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.className = 'edit-panel bg-[#120a08] border-l-2 border-accent p-[16px] grid grid-cols-4 gap-4';

    const fields: Array<{ label: string; key: keyof typeof violin.percentiles }> = [
      { label: 'P50', key: 'p50' },
      { label: 'P75', key: 'p75' },
      { label: 'P95', key: 'p95' },
    ];

    for (const field of fields) {
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-col gap-1';
      const lbl = document.createElement('span');
      lbl.className = 'text-[8px] uppercase tracking-[0.18em] text-muted font-mono';
      lbl.textContent = field.label;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = String(violin.percentiles[field.key]);
      inp.className = 'bg-transparent border-b border-border text-text font-mono text-[12px] w-full outline-none py-[4px]';
      inp.addEventListener('change', () => {
        (violin.percentiles[field.key] as number) = parseFloat(inp.value) || violin.percentiles[field.key];
      });
      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      panel.appendChild(wrap);
    }

    const confirmWrap = document.createElement('div');
    confirmWrap.className = 'flex items-end';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'CONFIRM VALUES';
    confirmBtn.className = 'border border-accent text-accent font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[6px] hover:bg-accent hover:text-white transition-colors duration-100';
    confirmBtn.addEventListener('click', () => {
      violin.flagged = false;
      saveReviewedDataset(violins);
      panel.remove();
      updateFlagState();
      renderTable();
    });
    confirmWrap.appendChild(confirmBtn);
    panel.appendChild(confirmWrap);

    row.insertAdjacentElement('afterend', panel);
  }

  function setFilter(mode: FilterMode): void {
    filterMode = mode;
    toggleAll.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${mode === 'all' ? 'text-text' : 'text-muted'}`;
    toggleFlagged.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${mode === 'flagged' ? 'text-text' : 'text-muted'}`;
    renderTable();
  }

  toggleAll.addEventListener('click', () => setFilter('all'));
  toggleFlagged.addEventListener('click', () => setFilter('flagged'));

  budgetInput.addEventListener('blur', () => {
    state.budget = parseFloat(budgetInput.value) || 105;
    localStorage.setItem('userBudget', String(state.budget));
    updateBudgetCount();
  });
  budgetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') budgetInput.blur();
  });

  setFilter('all');
  updateBudgetCount();
  updateFlagState();
}

function makeStatPair(label: string, value: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex justify-between gap-4';
  const lbl = document.createElement('span');
  lbl.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'text-[11px] font-mono text-text';
  val.textContent = value;
  wrap.appendChild(lbl);
  wrap.appendChild(val);
  return wrap;
}

function estimateKellyForDisplay(violin: ViolinCrop): number {
  const pts: [number, number][] = [
    [violin.percentiles.p05, 0.05],
    [violin.percentiles.p25, 0.25],
    [violin.percentiles.p50, 0.50],
    [violin.percentiles.p75, 0.75],
    [violin.percentiles.p95, 0.95],
  ];
  const threshold = violin.percentiles.p50;
  let p = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, c0] = pts[i];
    const [s1, c1] = pts[i + 1];
    if (threshold >= s0 && threshold <= s1) {
      const t = (threshold - s0) / (s1 - s0);
      p = 1 - (c0 + t * (c1 - c0));
      break;
    }
  }
  const b = (violin.percentiles.p95 - threshold) / Math.max(threshold, 1);
  const f = (b * p - (1 - p)) / Math.max(b, 0.0001);
  return Math.max(0, Math.min(1, f));
}
