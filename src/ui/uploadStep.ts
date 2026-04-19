import { runPipeline } from '../pipelineOrchestrator.js';
import { getApiKey } from '../settingsPanel.js';

const PHASE_LABELS = ['UPLOADING', 'PARSING ROWS', 'VALIDATING', 'FINALISING'];

function saveApiKey(key: string): void {
  localStorage.setItem('rhter_gemini_key', key);
}

function buildApiKeyCard(onSaved: () => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'mb-6 p-[20px] bg-bg1 border border-border flex flex-col gap-3';

  const label = document.createElement('span');
  label.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  label.textContent = 'API KEY REQUIRED';
  card.appendChild(label);

  const row = document.createElement('div');
  row.className = 'flex items-end gap-4';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'GEMINI API KEY';
  input.className = 'flex-1 bg-transparent border-b border-border font-mono text-[12px] text-text py-[4px] outline-none placeholder:text-muted';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'SAVE';
  saveBtn.className = 'border border-accent text-accent font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:bg-accent hover:text-white transition-colors duration-100';

  saveBtn.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key) return;
    saveApiKey(key);
    onSaved();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });

  row.appendChild(input);
  row.appendChild(saveBtn);
  card.appendChild(row);
  return card;
}

function buildDropZone(onFile: (file: File) => void): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'min-h-[360px] border border-dashed border-border bg-bg1 flex items-center justify-center cursor-pointer transition-colors duration-150';

  const inner = document.createElement('div');
  inner.className = 'flex flex-col items-center gap-3';

  const icon = document.createElement('div');
  icon.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 4v16M8 12l8-8 8 8M6 24h20" stroke="#444" stroke-width="1.5"/></svg>`;

  const heading = document.createElement('span');
  heading.className = 'font-mono text-[11px] uppercase tracking-[0.18em] text-text';
  heading.textContent = 'DROP SCREENSHOT HERE';

  const sub = document.createElement('span');
  sub.className = 'font-mono text-[9px] text-dim';
  sub.textContent = 'or click to browse';

  inner.appendChild(icon);
  inner.appendChild(heading);
  inner.appendChild(sub);
  zone.appendChild(inner);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'hidden';
  zone.appendChild(fileInput);

  zone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) onFile(file);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.remove('border-border');
    zone.classList.add('border-white', 'bg-bg2');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('border-white', 'bg-bg2');
    zone.classList.add('border-border');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('border-white', 'bg-bg2');
    zone.classList.add('border-border');
    const file = e.dataTransfer?.files[0];
    if (file) onFile(file);
  });

  return zone;
}

function buildProgressSection(phaseIndex: number, percent: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'min-h-[360px] bg-bg1 border border-border flex flex-col justify-center px-[40px] gap-4';

  const phaseLabel = document.createElement('span');
  phaseLabel.className = 'font-mono text-[9px] uppercase tracking-[0.18em] text-dim';
  phaseLabel.textContent = PHASE_LABELS[phaseIndex] ?? 'PROCESSING';
  wrap.appendChild(phaseLabel);

  const track = document.createElement('div');
  track.className = 'w-full h-[2px] bg-bg2';
  const fill = document.createElement('div');
  fill.className = percent >= 100 ? 'h-[2px] bg-white transition-[width] duration-[250ms] ease-linear' : 'h-[2px] bg-accent transition-[width] duration-[250ms] ease-linear';
  fill.style.width = `${percent}%`;
  track.appendChild(fill);
  wrap.appendChild(track);

  return wrap;
}

function buildInfoGrid(): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-8 mt-6';

  const lastSession = localStorage.getItem('wizardState');
  let lastSessionText = 'NO PREVIOUS SESSION';
  if (lastSession) {
    try {
      const s = JSON.parse(lastSession);
      if (s.step > 0) lastSessionText = `STEP ${s.step + 1} IN PROGRESS`;
    } catch { /* ignore */ }
  }

  const cols: Array<{ label: string; lines: string[] }> = [
    {
      label: 'WHAT HAPPENS NEXT',
      lines: ['1. CROP IMAGE (72 VIOLINS)', '2. EXTRACT NUMBERS (GEMINI)', '3. IDENTIFY TEAM COLORS', '4. VALIDATE + FLAG']
    },
    {
      label: 'EXTRACTION TIME',
      lines: ['~90 SECONDS', 'FOR 72 CROPS']
    },
    {
      label: 'LAST SESSION',
      lines: [lastSessionText]
    },
  ];

  for (const col of cols) {
    const div = document.createElement('div');
    div.className = 'flex flex-col gap-2';

    const lbl = document.createElement('span');
    lbl.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
    lbl.textContent = col.label;
    div.appendChild(lbl);

    for (const line of col.lines) {
      const p = document.createElement('span');
      p.className = 'text-[11px] font-mono text-dim';
      p.textContent = line;
      div.appendChild(p);
    }

    grid.appendChild(div);
  }

  return grid;
}

export function renderUploadStep(container: HTMLElement, onComplete: () => void): void {
  const hasKey = !!getApiKey();
  let uploadAreaEl: HTMLElement | null = null;

  function showUploadArea(): void {
    if (uploadAreaEl) uploadAreaEl.remove();

    const wrap = document.createElement('div');
    wrap.id = 'upload-area';

    const zone = buildDropZone(startPipeline);
    wrap.appendChild(zone);

    const demoBtn = document.createElement('button');
    demoBtn.textContent = 'SIMULATE WITH DEMO DATA';
    demoBtn.className = 'mt-4 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[20px] py-[8px] hover:border-text hover:text-text transition-colors duration-100';
    demoBtn.addEventListener('click', () => {
      injectDemoData();
      onComplete();
    });
    wrap.appendChild(demoBtn);
    wrap.appendChild(buildInfoGrid());

    container.appendChild(wrap);
    uploadAreaEl = wrap;
  }

  function startPipeline(file: File): void {
    if (!uploadAreaEl) return;
    uploadAreaEl.innerHTML = '';

    let phaseIndex = 0;
    let percent = 0;
    const progress = buildProgressSection(phaseIndex, percent);
    uploadAreaEl.appendChild(progress);

    runPipeline(file, (p) => {
      percent = Math.round((p.completed / p.total) * 100);
      phaseIndex = Math.min(3, Math.floor((p.completed / p.total) * 4));

      uploadAreaEl!.innerHTML = '';
      const updated = buildProgressSection(phaseIndex, percent);
      uploadAreaEl!.appendChild(updated);

      if (percent >= 100) {
        setTimeout(onComplete, 400);
      }
    }).catch((err: Error) => {
      uploadAreaEl!.innerHTML = '';
      const errMsg = document.createElement('p');
      errMsg.className = 'font-mono text-[11px] text-accent p-[20px]';
      errMsg.textContent = `PIPELINE ERROR: ${err.message}`;
      uploadAreaEl!.appendChild(errMsg);
      uploadAreaEl!.appendChild(buildDropZone(startPipeline));
    });
  }

  function injectDemoData(): void {
    const demo = generateDemoViolins();
    localStorage.setItem('importedViolins', JSON.stringify(demo));
    localStorage.setItem('reviewedViolins', JSON.stringify(demo));
  }

  if (!hasKey) {
    container.appendChild(buildApiKeyCard(() => {
      container.innerHTML = '';
      renderUploadStep(container, onComplete);
    }));
  }

  showUploadArea();
}

function generateDemoViolins(): unknown[] {
  const DRIVER_SETS = [
    ['VER', 'NOR', 'PIA'],
    ['HAM', 'RUS', 'LEC'],
    ['SAI', 'ALO', 'STR'],
    ['TSU', 'GAS', 'OCO'],
    ['HUL', 'MAG', 'BOT'],
    ['ZHO', 'LAW', 'COL'],
  ];
  const CN_PAIRS = [
    ['MCL', 'RED'], ['MER', 'FER'], ['AMR', 'WIL'],
    ['ALP', 'HAA'], ['MCL', 'MER'], ['RED', 'FER'],
  ];
  const TEAM_COLORS: Record<string, [number, number, number]> = {
    MCL: [255, 103, 0], RED: [30, 65, 255], MER: [6, 211, 191],
    FER: [221, 24, 24], AMR: [0, 107, 60], WIL: [0, 90, 255],
    ALP: [255, 135, 188], HAA: [182, 186, 189],
  };

  const violins = [];
  for (let i = 0; i < 6; i++) {
    const p50 = 80 + Math.round(Math.random() * 40);
    const spread = 10 + Math.round(Math.random() * 20);
    const [cn1, cn2] = CN_PAIRS[i];
    violins.push({
      row: Math.floor(i / 3),
      col: i % 3,
      header: {
        budget_required: 95 + Math.round(Math.random() * 20),
        avg_xpts: p50,
        avg_xpts_dollar_impact: 0.8,
        avg_budget_uplift: null,
      },
      percentiles: {
        p05: p50 - spread * 2,
        p25: p50 - spread,
        p50,
        p75: p50 + spread,
        p95: p50 + spread * 2,
      },
      drivers: DRIVER_SETS[i].map((name, j) => ({ name, multiplier: j === 0 ? '2X' : null })),
      constructors: {
        cn1: { color_rgb: TEAM_COLORS[cn1] ?? null, team: cn1 },
        cn2: { color_rgb: TEAM_COLORS[cn2] ?? null, team: cn2 },
      },
      confidence: 'high' as const,
      flagged: i === 2,
      flag_reasons: i === 2 ? ['P95 OUTLIER'] : [],
      raw_response: '',
    });
  }
  return violins;
}
