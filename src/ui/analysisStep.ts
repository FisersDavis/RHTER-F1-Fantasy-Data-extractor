import { getReviewedDataset } from '../dataStore.js';
import type { WizardState } from './wizardShell.js';
import type { ViolinCrop, Percentiles } from '../types.js';

const TEAM_COLORS: Record<string, string> = {
  MER: '#06d3bf', FER: '#dd1818', RBR: '#1e41ff',
  MCL: '#ff6700', AMR: '#006b3c', WIL: '#005aff',
  ALP: '#ff87bc', HAA: '#b6babd', KIC: '#52e252', SAU: '#9b0000',
  RED: '#1e41ff',
};

const SORT_LABELS: Record<string, string> = {
  kelly: 'KELLY SCORE',
  p50: 'P50 XPTS',
  p95: 'P95 CEILING',
  budget: 'BUDGET',
};

interface RankedEntry {
  violin: ViolinCrop;
  kelly: number;
  teamId: number;
  overBudget: boolean;
}

function estimateWinProb(percentiles: Percentiles, threshold: number): number {
  const pts: [number, number][] = [
    [percentiles.p05, 0.05], [percentiles.p25, 0.25], [percentiles.p50, 0.50],
    [percentiles.p75, 0.75], [percentiles.p95, 0.95],
  ];
  if (threshold <= pts[0][0]) return 1 - pts[0][1];
  if (threshold >= pts[4][0]) return 1 - pts[4][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, c0] = pts[i];
    const [s1, c1] = pts[i + 1];
    if (threshold >= s0 && threshold <= s1) {
      const t = (threshold - s0) / (s1 - s0);
      return 1 - (c0 + t * (c1 - c0));
    }
  }
  return 0;
}

function calcKelly(violin: ViolinCrop, threshold: number): number {
  const p = estimateWinProb(violin.percentiles, threshold);
  const b = (violin.percentiles.p95 - threshold) / Math.max(threshold, 1);
  const f = (b * p - (1 - p)) / Math.max(b, 0.0001);
  return Math.max(0, Math.min(1, f));
}

function computeRanked(violins: ViolinCrop[], budget: number, sortKey: string): RankedEntry[] {
  const p50s = violins.map(v => v.percentiles.p50).sort((a, b) => a - b);
  const threshold = p50s[Math.floor(p50s.length / 2)];

  const entries: RankedEntry[] = violins.map((v, i) => ({
    violin: v,
    kelly: calcKelly(v, threshold),
    teamId: i,
    overBudget: v.header.budget_required > budget,
  }));

  const sortFns: Record<string, (a: RankedEntry, b: RankedEntry) => number> = {
    kelly:  (a, b) => b.kelly - a.kelly,
    p50:    (a, b) => b.violin.percentiles.p50 - a.violin.percentiles.p50,
    p95:    (a, b) => b.violin.percentiles.p95 - a.violin.percentiles.p95,
    budget: (a, b) => a.violin.header.budget_required - b.violin.header.budget_required,
  };

  const fn = sortFns[sortKey] ?? sortFns['kelly'];
  return [...entries.filter(e => !e.overBudget).sort(fn), ...entries.filter(e => e.overBudget).sort(fn)];
}

function buildDistBar(pct: Percentiles, max: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'relative h-[10px] w-full my-2';

  const whisker = document.createElement('div');
  whisker.className = 'absolute h-[1px] bg-muted/40 top-[50%]';
  whisker.style.left = `${(pct.p05 / max) * 100}%`;
  whisker.style.width = `${((pct.p95 - pct.p05) / max) * 100}%`;

  const box = document.createElement('div');
  box.className = 'absolute h-[6px] bg-text top-[50%] -translate-y-1/2';
  box.style.left = `${(pct.p25 / max) * 100}%`;
  box.style.width = `${((pct.p75 - pct.p25) / max) * 100}%`;

  const tick = document.createElement('div');
  tick.className = 'absolute w-[2px] h-[10px] bg-white top-[50%] -translate-y-1/2';
  tick.style.left = `${(pct.p50 / max) * 100}%`;

  wrap.appendChild(whisker);
  wrap.appendChild(box);
  wrap.appendChild(tick);
  return wrap;
}

function buildLineup(violin: ViolinCrop): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-2 font-mono text-[11px] text-text flex-wrap';
  for (const d of violin.drivers) {
    const span = document.createElement('span');
    span.textContent = d.multiplier ? `${d.name}(${d.multiplier})` : d.name;
    wrap.appendChild(span);
  }
  const sep = document.createElement('span');
  sep.className = 'text-muted';
  sep.textContent = '//';
  wrap.appendChild(sep);
  for (const cn of [violin.constructors.cn1, violin.constructors.cn2]) {
    const dot = document.createElement('span');
    dot.className = 'w-[8px] h-[8px] rounded-full inline-block';
    dot.style.background = TEAM_COLORS[cn.team] ?? '#888';
    dot.title = cn.team;
    wrap.appendChild(dot);
    const lbl = document.createElement('span');
    lbl.textContent = cn.team;
    wrap.appendChild(lbl);
  }
  return wrap;
}

function buildGuideRails(max: number): { rails: HTMLElement; header: HTMLElement } {
  const pctPoints = [0.05, 0.25, 0.50, 0.75, 0.95];
  const labels = ['P5', 'P25', 'P50', 'P75', 'P95'];

  const rails = document.createElement('div');
  rails.className = 'absolute inset-0 pointer-events-none z-0';
  pctPoints.forEach((pct, i) => {
    const line = document.createElement('div');
    line.className = `absolute top-0 bottom-0 border-l ${i === 2 ? 'border-white/20' : i === 1 || i === 3 ? 'border-white/10' : 'border-white/5'}`;
    line.style.left = `${pct * 100}%`;
    rails.appendChild(line);
  });

  const header = document.createElement('div');
  header.className = 'relative h-[20px] mb-1';
  pctPoints.forEach((pct, i) => {
    const lbl = document.createElement('span');
    lbl.className = 'absolute text-[8px] text-muted font-mono uppercase -translate-x-1/2';
    lbl.style.left = `${pct * 100}%`;
    lbl.textContent = labels[i];
    header.appendChild(lbl);
  });

  // suppress unused variable warning — max is accepted for API symmetry
  void max;

  return { rails, header };
}

export function renderAnalysisStep(
  container: HTMLElement,
  state: WizardState,
  onPick: (teamId: number | null) => void,
  onBack: () => void
): void {
  const violins = getReviewedDataset();
  if (!violins || !violins.length) {
    const msg = document.createElement('p');
    msg.className = 'font-mono text-[11px] text-dim';
    msg.textContent = 'NO DATA. GO BACK AND APPROVE DATA IN THE REVIEW STEP.';
    container.appendChild(msg);
    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.className = 'mt-4 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px]';
    backBtn.addEventListener('click', onBack);
    container.appendChild(backBtn);
    return;
  }

  let currentSortKey = state.sortKey;
  let pickedTeamId = state.pickedTeamId;

  const section = document.createElement('div');
  section.className = 'flex flex-col gap-4';
  container.appendChild(section);

  // Controls bar
  const controlsBar = document.createElement('div');
  controlsBar.className = 'bg-bg1 border border-border p-[16px] flex items-center justify-between';

  const modelGroup = document.createElement('div');
  modelGroup.className = 'flex gap-2 items-center';
  const modelLbl = document.createElement('span');
  modelLbl.className = 'text-[8px] uppercase tracking-[0.18em] text-muted font-mono mr-2';
  modelLbl.textContent = 'MODEL';
  const kellyBtn = document.createElement('button');
  kellyBtn.textContent = 'KELLY';
  kellyBtn.className = 'bg-accent text-white font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px]';
  modelGroup.appendChild(modelLbl);
  modelGroup.appendChild(kellyBtn);
  controlsBar.appendChild(modelGroup);

  const sortGroup = document.createElement('div');
  sortGroup.className = 'flex gap-4';

  const sortKeys = ['kelly', 'p50', 'p95', 'budget'];
  const sortBtns: Record<string, HTMLButtonElement> = {};
  sortKeys.forEach(key => {
    const btn = document.createElement('button');
    btn.textContent = (key === currentSortKey ? '▶ ' : '') + SORT_LABELS[key];
    btn.className = `font-mono text-[9px] uppercase tracking-[0.18em] ${key === currentSortKey ? 'text-text border-b border-accent pb-[2px]' : 'text-muted'}`;
    btn.addEventListener('click', () => {
      currentSortKey = key as WizardState['sortKey'];
      state.sortKey = currentSortKey;
      render();
    });
    sortBtns[key] = btn;
    sortGroup.appendChild(btn);
  });
  controlsBar.appendChild(sortGroup);
  section.appendChild(controlsBar);

  // List container (relative for guide rails)
  const listWrap = document.createElement('div');
  listWrap.className = 'relative';
  section.appendChild(listWrap);

  function render(): void {
    listWrap.innerHTML = '';
    const ranked = computeRanked(violins!, state.budget, currentSortKey);
    if (!ranked.length) return;

    const max = ranked[0].violin.percentiles.p95;
    const { rails, header: railHeader } = buildGuideRails(max);

    listWrap.appendChild(railHeader);

    const innerWrap = document.createElement('div');
    innerWrap.className = 'relative';
    innerWrap.appendChild(rails);

    const top = ranked[0];
    innerWrap.appendChild(buildTopPickCard(top, max, pickedTeamId, (id) => {
      pickedTeamId = pickedTeamId === id ? null : id;
      onPick(pickedTeamId);
    }));

    ranked.slice(1).forEach((entry, i) => {
      innerWrap.appendChild(buildRankedRow(entry, i + 2, max, pickedTeamId, (id) => {
        pickedTeamId = pickedTeamId === id ? null : id;
        onPick(pickedTeamId);
      }));
    });

    listWrap.appendChild(innerWrap);

    // Back button
    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.className = 'mt-6 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:border-text hover:text-text transition-colors duration-100';
    backBtn.addEventListener('click', onBack);
    listWrap.appendChild(backBtn);
  }

  render();
}

function buildTopPickCard(
  entry: RankedEntry,
  max: number,
  pickedTeamId: number | null,
  onPick: (id: number) => void
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'relative z-10 bg-[rgba(232,64,28,0.12)] border-l-[3px] border-accent p-[28px] grid grid-cols-4 gap-6';

  const col1 = document.createElement('div');
  col1.className = 'flex flex-col gap-2';
  col1.appendChild(buildLineup(entry.violin));
  col1.appendChild(buildDistBar(entry.violin.percentiles, max));
  const pctLbls = document.createElement('div');
  pctLbls.className = 'flex justify-between font-mono text-[8px] text-dim';
  ['P5', 'P25', 'P50', 'P75', 'P95'].forEach((l, i) => {
    const s = document.createElement('span');
    s.textContent = l;
    if (i === 2) s.className = 'text-text';
    pctLbls.appendChild(s);
  });
  col1.appendChild(pctLbls);
  card.appendChild(col1);

  const col2 = document.createElement('div');
  col2.className = 'flex flex-col gap-1';
  const avgLbl = document.createElement('span');
  avgLbl.className = 'text-[8px] uppercase tracking-[0.18em] text-muted font-mono';
  avgLbl.textContent = 'AVG EXPECTED PTS';
  const avgVal = document.createElement('span');
  avgVal.className = 'text-[12px] text-dim font-mono';
  avgVal.textContent = String(entry.violin.header.avg_xpts);
  col2.appendChild(avgLbl);
  col2.appendChild(avgVal);
  card.appendChild(col2);

  const col3 = document.createElement('div');
  col3.className = 'flex flex-col gap-1';
  const kellyLbl = document.createElement('span');
  kellyLbl.className = 'text-[8px] uppercase tracking-[0.18em] text-muted font-mono';
  kellyLbl.textContent = 'KELLY SCORE';
  const kellyVal = document.createElement('span');
  kellyVal.className = 'text-[36px] font-bold text-accent font-mono';
  kellyVal.textContent = (entry.kelly * 100).toFixed(0) + '%';
  col3.appendChild(kellyLbl);
  col3.appendChild(kellyVal);
  card.appendChild(col3);

  const col4 = document.createElement('div');
  col4.className = 'flex items-stretch';
  const pickBtn = document.createElement('button');
  const isPicked = pickedTeamId === entry.teamId;
  pickBtn.textContent = isPicked ? '✓ PICKED' : 'PICK THIS TEAM';
  pickBtn.className = isPicked
    ? 'w-full bg-bg3 text-text border border-accent font-mono text-[10px] uppercase tracking-[0.18em] px-[20px]'
    : 'w-full bg-accent text-white font-mono text-[10px] uppercase tracking-[0.18em] px-[20px]';
  pickBtn.addEventListener('click', () => onPick(entry.teamId));
  col4.appendChild(pickBtn);
  card.appendChild(col4);

  return card;
}

function buildRankedRow(
  entry: RankedEntry,
  rank: number,
  max: number,
  pickedTeamId: number | null,
  onPick: (id: number) => void
): HTMLElement {
  const isPicked = pickedTeamId === entry.teamId;
  const row = document.createElement('div');
  row.className = `relative z-10 grid border-b border-border transition-colors duration-100 ${isPicked ? 'border-l-2 border-accent bg-bg3' : 'bg-bg1 hover:bg-white/[0.02]'}`;
  row.style.gridTemplateColumns = 'auto 1fr auto auto auto';

  const rankEl = document.createElement('div');
  rankEl.className = 'px-[12px] py-[16px] font-mono text-[11px] text-dim w-[44px]';
  rankEl.textContent = `#${rank}`;
  row.appendChild(rankEl);

  const lineupCol = document.createElement('div');
  lineupCol.className = 'px-[8px] py-[12px] flex flex-col gap-1';
  lineupCol.appendChild(buildLineup(entry.violin));
  lineupCol.appendChild(buildDistBar(entry.violin.percentiles, max));
  row.appendChild(lineupCol);

  const avgEl = document.createElement('div');
  avgEl.className = 'px-[12px] py-[16px] font-mono text-[12px] text-dim self-center';
  avgEl.textContent = String(entry.violin.header.avg_xpts);
  row.appendChild(avgEl);

  const kellyEl = document.createElement('div');
  kellyEl.className = 'px-[12px] py-[16px] font-mono text-[18px] font-bold text-accent self-center';
  kellyEl.textContent = (entry.kelly * 100).toFixed(0) + '%';
  row.appendChild(kellyEl);

  const pickEl = document.createElement('div');
  pickEl.className = 'px-[12px] py-[16px] self-center';
  const pickBtn = document.createElement('button');
  pickBtn.textContent = isPicked ? '✓ PICKED' : 'PICK';
  pickBtn.className = isPicked
    ? 'border border-accent text-accent font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px]'
    : 'border border-border text-dim font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px] hover:border-text hover:text-text transition-colors duration-100';
  pickBtn.addEventListener('click', () => onPick(entry.teamId));
  pickEl.appendChild(pickBtn);
  row.appendChild(pickEl);

  return row;
}
