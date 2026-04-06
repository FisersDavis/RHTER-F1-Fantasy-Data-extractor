const STORAGE_KEY = 'rhter_gemini_key';

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function initSettingsPanel(container: HTMLElement): void {
  const section = document.createElement('section');

  const heading = document.createElement('h2');
  heading.textContent = 'Settings';
  section.appendChild(heading);

  const label = document.createElement('label');
  label.className = 'topbar-label';
  label.textContent = 'GEMINI API KEY';
  section.appendChild(label);

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '0.5rem';
  row.style.marginTop = '0.5rem';

  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = 'AIza…';
  input.style.flex = '1';
  input.style.fontFamily = 'monospace';
  const stored = getApiKey();
  if (stored) input.value = stored;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = 'SAVE';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn';
  clearBtn.textContent = 'CLEAR';

  row.appendChild(input);
  row.appendChild(saveBtn);
  row.appendChild(clearBtn);
  section.appendChild(row);

  const statusEl = document.createElement('div');
  statusEl.className = 'status-msg';
  statusEl.style.marginTop = '0.5rem';
  section.appendChild(statusEl);

  saveBtn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) { statusEl.textContent = 'ERROR: key is empty'; return; }
    setApiKey(val);
    statusEl.textContent = 'Key saved to localStorage.';
  });

  clearBtn.addEventListener('click', () => {
    clearApiKey();
    input.value = '';
    statusEl.textContent = 'Key cleared.';
  });

  const note = document.createElement('p');
  note.className = 'status-msg';
  note.style.marginTop = '1rem';
  note.textContent = 'Your key is stored in this browser only. It is never sent to any server run by this project.';
  section.appendChild(note);

  container.appendChild(section);
}
