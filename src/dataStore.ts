import type { ViolinCrop, DatasetMeta } from './types.js';

const PIPELINE_INCREMENTAL_KEY = 'pipeline_incremental';

export function resetPipelineIncremental(): void {
  localStorage.setItem(PIPELINE_INCREMENTAL_KEY, JSON.stringify([]));
}

export function writePipelineIncremental(crops: ViolinCrop[]): void {
  localStorage.setItem(PIPELINE_INCREMENTAL_KEY, JSON.stringify(crops));
}

export function clearPipelineIncremental(): void {
  localStorage.removeItem(PIPELINE_INCREMENTAL_KEY);
}

export function readPipelineIncremental(): ViolinCrop[] | null {
  const raw = localStorage.getItem(PIPELINE_INCREMENTAL_KEY);
  return raw ? (JSON.parse(raw) as ViolinCrop[]) : null;
}

export function getDatasets(): DatasetMeta[] {
  return JSON.parse(localStorage.getItem('datasetIndex') || '[]') as DatasetMeta[];
}

export function getDataset(key: string): { results: Array<{ row: number; col: number; parsed: Partial<ViolinCrop> }> } | null {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

export function deleteDataset(key: string): void {
  localStorage.removeItem(key);
  const index = getDatasets().filter(d => d.key !== key);
  localStorage.setItem('datasetIndex', JSON.stringify(index));
}

export function getUnifiedTable(key: string): Array<Record<string, unknown>> {
  const dataset = getDataset(key);
  if (!dataset) return [];
  return dataset.results.map(r => ({
    row: r.row,
    col: r.col,
    ...r.parsed,
  }));
}

export function importJSON(array: unknown): { count: number; flagged: number } {
  if (!Array.isArray(array)) throw new Error('Expected an array');
  for (const item of array as ViolinCrop[]) {
    if (item.row == null || item.col == null || !item.header || !item.percentiles || !item.drivers || !item.constructors) {
      throw new Error(`Invalid violin object at row=${item.row} col=${item.col}`);
    }
  }
  localStorage.setItem('importedViolins', JSON.stringify(array));
  const flagged = (array as ViolinCrop[]).filter(v => v.flagged || v.confidence !== 'high').length;
  return { count: (array as ViolinCrop[]).length, flagged };
}

export function saveReviewedDataset(array: ViolinCrop[]): void {
  localStorage.setItem('reviewedViolins', JSON.stringify(array));
}

export function getReviewedDataset(): ViolinCrop[] | null {
  const raw = localStorage.getItem('reviewedViolins');
  return raw ? JSON.parse(raw) as ViolinCrop[] : null;
}

export function getImportedViolins(): ViolinCrop[] | null {
  const raw = localStorage.getItem('importedViolins');
  return raw ? JSON.parse(raw) as ViolinCrop[] : null;
}

export function initDataStore(container: HTMLElement): void {
  const section = document.createElement('section');

  const heading = document.createElement('h2');
  heading.textContent = 'Extracted Datasets';
  section.appendChild(heading);

  const datasets = getDatasets();

  if (!datasets.length) {
    const msg = document.createElement('p');
    msg.className = 'status-msg';
    msg.textContent = 'No datasets yet. Extract data from the Extractor tab.';
    section.appendChild(msg);
    container.appendChild(section);
    return;
  }

  for (const ds of datasets) {
    const card = document.createElement('div');
    card.className = 'data-card';

    const title = document.createElement('strong');
    title.textContent = new Date(ds.date).toLocaleString();
    card.appendChild(title);

    const info = document.createElement('p');
    info.className = 'status-msg';
    info.textContent = `${ds.count} results, ${ds.errors} errors`;
    card.appendChild(info);

    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn';
    viewBtn.textContent = 'View Table';
    viewBtn.addEventListener('click', () => { showTable(section, ds.key); });
    card.appendChild(viewBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.textContent = 'Delete';
    delBtn.style.marginLeft = '0.5rem';
    delBtn.addEventListener('click', () => {
      deleteDataset(ds.key);
      container.innerHTML = '';
      initDataStore(container);
    });
    card.appendChild(delBtn);

    section.appendChild(card);
  }

  container.appendChild(section);
}

function showTable(section: HTMLElement, key: string): void {
  const existing = section.querySelector('.data-table-container');
  if (existing) existing.remove();

  const rows = getUnifiedTable(key);
  if (!rows.length) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-container';

  const table = document.createElement('table');
  const headers = Object.keys(rows[0]);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h.toUpperCase();
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const h of headers) {
      const td = document.createElement('td');
      const val = row[h];
      td.textContent = Array.isArray(val) ? val.join(', ') : String(val ?? '');
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  wrapper.appendChild(table);
  section.appendChild(wrapper);
}
