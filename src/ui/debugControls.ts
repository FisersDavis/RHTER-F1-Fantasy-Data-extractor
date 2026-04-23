const DEBUG_MODE_KEY = 'wizard_debug_mode';
const DEBUG_LIMIT_KEY = 'wizard_debug_limit';

export type UploadDebugControls = {
  root: HTMLElement;
  isDebugEnabled: () => boolean;
  getDebugLimit: () => number | null;
};

export function createUploadDebugControls(): UploadDebugControls {
  const root = document.createElement('div');
  root.className = 'mt-4 p-[12px] border border-border bg-bg1 flex flex-col gap-3';

  const toggleRow = document.createElement('label');
  toggleRow.className = 'flex items-center justify-between gap-4 cursor-pointer';
  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  toggleLabel.textContent = 'DEBUG MODE';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = localStorage.getItem(DEBUG_MODE_KEY) === '1';
  toggle.className = 'accent-accent';
  toggleRow.appendChild(toggleLabel);
  toggleRow.appendChild(toggle);
  root.appendChild(toggleRow);

  const limitWrap = document.createElement('label');
  limitWrap.className = 'flex items-center justify-between gap-4';
  const limitLabel = document.createElement('span');
  limitLabel.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  limitLabel.textContent = 'DEBUG CROP LIMIT';
  const limitInput = document.createElement('input');
  limitInput.type = 'number';
  limitInput.min = '1';
  limitInput.step = '1';
  limitInput.value = localStorage.getItem(DEBUG_LIMIT_KEY) ?? '6';
  limitInput.className = 'w-[84px] bg-transparent border border-border px-[8px] py-[4px] text-[10px] font-mono text-text';
  limitWrap.appendChild(limitLabel);
  limitWrap.appendChild(limitInput);
  root.appendChild(limitWrap);

  const syncLimitVisibility = () => {
    limitWrap.style.display = toggle.checked ? 'flex' : 'none';
  };
  syncLimitVisibility();

  toggle.addEventListener('change', () => {
    localStorage.setItem(DEBUG_MODE_KEY, toggle.checked ? '1' : '0');
    syncLimitVisibility();
  });
  limitInput.addEventListener('change', () => {
    localStorage.setItem(DEBUG_LIMIT_KEY, limitInput.value.trim() || '6');
  });

  return {
    root,
    isDebugEnabled: () => toggle.checked,
    getDebugLimit: () => {
      const value = Number(limitInput.value);
      return Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
    },
  };
}
