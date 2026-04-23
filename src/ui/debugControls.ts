const FULL_CROP_COUNT = 72;
const DEBUG_MODE_KEY = 'wizard_debug_mode';
const DEBUG_LIMIT_KEY = 'wizard_debug_limit';

type UrlOverrides = { forceDebug?: boolean; limit?: number };

function parseWizardUrlOverrides(): UrlOverrides {
  try {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('wizard_debug');
    const forceDebug = d === '1' || d?.toLowerCase() === 'true';
    const limRaw = params.get('wizard_limit');
    let limit: number | undefined;
    if (limRaw != null && limRaw !== '') {
      const n = Number(limRaw);
      if (Number.isFinite(n) && n >= 1) limit = Math.floor(n);
    }
    return { forceDebug: forceDebug || undefined, limit };
  } catch {
    return {};
  }
}

function formatRunModeLine(debugOn: boolean, limit: number | null): string {
  if (!debugOn) {
    return `RUN MODE: FULL (${FULL_CROP_COUNT} CROPS)`;
  }
  const n = limit ?? 6;
  return `RUN MODE: DEBUG (UP TO ${n} CROPS)`;
}

export type UploadDebugControls = {
  root: HTMLElement;
  isDebugEnabled: () => boolean;
  getDebugLimit: () => number | null;
  getRunModeSubtitle: () => string;
};

export function createUploadDebugControls(): UploadDebugControls {
  const root = document.createElement('div');
  root.className = 'mt-4 p-[12px] border border-border bg-bg1 flex flex-col gap-3';

  const runModeEl = document.createElement('div');
  runModeEl.className =
    'font-mono text-[10px] uppercase tracking-[0.12em] text-text border-b border-border pb-2 mb-1';

  const toggleRow = document.createElement('label');
  toggleRow.className = 'flex items-center justify-between gap-4 cursor-pointer';
  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  toggleLabel.textContent = 'DEBUG MODE';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'accent-accent';
  toggleRow.appendChild(toggleLabel);
  toggleRow.appendChild(toggle);

  const limitWrap = document.createElement('label');
  limitWrap.className = 'flex items-center justify-between gap-4';
  const limitLabel = document.createElement('span');
  limitLabel.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  limitLabel.textContent = 'DEBUG CROP LIMIT';
  const limitInput = document.createElement('input');
  limitInput.type = 'number';
  limitInput.min = '1';
  limitInput.step = '1';
  limitInput.className = 'w-[84px] bg-transparent border border-border px-[8px] py-[4px] text-[10px] font-mono text-text';
  limitWrap.appendChild(limitLabel);
  limitWrap.appendChild(limitInput);

  const readLimitFromInput = (): number | null => {
    const value = Number(limitInput.value);
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
  };

  const refreshRunMode = (): void => {
    runModeEl.textContent = formatRunModeLine(toggle.checked, readLimitFromInput());
  };

  toggle.checked = localStorage.getItem(DEBUG_MODE_KEY) === '1';
  limitInput.value = localStorage.getItem(DEBUG_LIMIT_KEY) ?? '6';

  const url = parseWizardUrlOverrides();
  if (url.forceDebug) {
    toggle.checked = true;
    localStorage.setItem(DEBUG_MODE_KEY, '1');
  }
  if (url.limit != null) {
    limitInput.value = String(url.limit);
    localStorage.setItem(DEBUG_LIMIT_KEY, limitInput.value);
  }

  root.appendChild(runModeEl);
  root.appendChild(toggleRow);
  root.appendChild(limitWrap);

  const syncLimitVisibility = (): void => {
    limitWrap.style.display = toggle.checked ? 'flex' : 'none';
  };
  syncLimitVisibility();
  refreshRunMode();

  toggle.addEventListener('change', () => {
    localStorage.setItem(DEBUG_MODE_KEY, toggle.checked ? '1' : '0');
    syncLimitVisibility();
    refreshRunMode();
  });
  limitInput.addEventListener('change', () => {
    localStorage.setItem(DEBUG_LIMIT_KEY, limitInput.value.trim() || '6');
    refreshRunMode();
  });
  limitInput.addEventListener('input', () => {
    refreshRunMode();
  });

  return {
    root,
    isDebugEnabled: () => toggle.checked,
    getDebugLimit: () => readLimitFromInput(),
    getRunModeSubtitle: () => formatRunModeLine(toggle.checked, readLimitFromInput()),
  };
}
