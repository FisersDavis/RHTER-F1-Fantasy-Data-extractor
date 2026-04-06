import { importJSON, getImportedDataset, saveReviewedDataset } from './dataStore.js';
import { makeViolinCard } from './reviewCard.js';

let corrections = {};
let reviewedSet = new Set();
let dataset = [];
let globalMin = 0;
let globalMax = 500;

function rowColKey(v) { return `${v.row}_${v.col}`; }
function isFlagged(v) { return v.flagged || v.confidence !== 'high'; }

function computeGlobalBounds(data) {
    let min = Infinity, max = -Infinity;
    for (const v of data) {
        const p = v.percentiles;
        if (p.p05 < min) min = p.p05;
        if (p.p95 > max) max = p.p95;
    }
    return { min, max };
}

function getViolinData(v) {
    const key = rowColKey(v);
    const cor = corrections[key];
    if (!cor) return v;
    return {
        ...v,
        constructors: cor.constructors
            ? { cn1: { ...v.constructors.cn1, ...cor.constructors.cn1 }, cn2: { ...v.constructors.cn2, ...cor.constructors.cn2 } }
            : v.constructors,
        drivers: cor.drivers ?? v.drivers,
    };
}

function saveCorrection(key, field, value) {
    if (!corrections[key]) corrections[key] = {};
    corrections[key][field] = value;
    localStorage.setItem('review_corrections', JSON.stringify(corrections));
    persistReviewed();
}

function persistReviewed() {
    saveReviewedDataset(dataset.map(v => getViolinData(v)));
}

function renderGrid(container) {
    const existing = container.querySelector('.review-grid-area');
    if (existing) existing.remove();

    const gridArea = document.createElement('div');
    gridArea.className = 'review-grid-area';

    for (const row of [0, 1, 2]) {
        const tierLabel = document.createElement('div');
        tierLabel.className = 'tier-label';
        tierLabel.textContent = `Budget Tier ${row + 1}`;
        gridArea.appendChild(tierLabel);

        const rowGrid = document.createElement('div');
        rowGrid.className = 'violin-grid';

        const tierItems = dataset.filter(v => v.row === row).sort((a, b) => a.col - b.col);
        for (const v of tierItems) {
            const key = rowColKey(v);
            const data = getViolinData(v);
            const accepted = reviewedSet.has(key);

            const card = makeViolinCard(
                data,
                globalMin,
                globalMax,
                accepted,
                (cn, newTeam) => {
                    const cur = corrections[key]?.constructors ?? {};
                    const updated = {
                        cn1: { ...(v.constructors.cn1), ...(cur.cn1 ?? {}), ...(cn === 'cn1' ? { team: newTeam } : {}) },
                        cn2: { ...(v.constructors.cn2), ...(cur.cn2 ?? {}), ...(cn === 'cn2' ? { team: newTeam } : {}) },
                    };
                    saveCorrection(key, 'constructors', updated);
                },
                (idx, newName) => {
                    const base = corrections[key]?.drivers ?? v.drivers;
                    const updated = base.map((d, i) => i === idx ? { ...d, name: newName } : d);
                    saveCorrection(key, 'drivers', updated);
                }
            );
            rowGrid.appendChild(card);
        }
        gridArea.appendChild(rowGrid);
    }

    container.appendChild(gridArea);
}

function renderBulkActions(container, proceedCallback) {
    const existing = container.querySelector('.bulk-actions');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.className = 'bulk-actions';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'btn';
    acceptBtn.textContent = 'Accept all unflagged';
    acceptBtn.addEventListener('click', () => {
        for (const v of dataset) {
            if (!isFlagged(v)) reviewedSet.add(rowColKey(v));
        }
        localStorage.setItem('review_accepted', JSON.stringify([...reviewedSet]));
        persistReviewed();
        renderGrid(container);
        updateProceedBtn(proceedBtn);
    });

    const clearFlagsBtn = document.createElement('button');
    clearFlagsBtn.className = 'btn';
    clearFlagsBtn.textContent = 'Clear all flags';
    clearFlagsBtn.addEventListener('click', () => {
        for (const v of dataset) reviewedSet.add(rowColKey(v));
        localStorage.setItem('review_accepted', JSON.stringify([...reviewedSet]));
        persistReviewed();
        renderGrid(container);
        updateProceedBtn(proceedBtn);
    });

    const proceedBtn = document.createElement('button');
    proceedBtn.className = 'btn btn-primary';
    proceedBtn.textContent = 'Proceed to Analysis';
    proceedBtn.disabled = reviewedSet.size === 0;
    proceedBtn.addEventListener('click', proceedCallback);

    bar.appendChild(acceptBtn);
    bar.appendChild(clearFlagsBtn);
    bar.appendChild(proceedBtn);

    const gridArea = container.querySelector('.review-grid-area');
    if (gridArea) container.insertBefore(bar, gridArea);
    else container.appendChild(bar);

    return proceedBtn;
}

function updateProceedBtn(btn) {
    if (btn) btn.disabled = reviewedSet.size === 0;
}

function onDataLoaded(arr, container, statusEl, proceedCallback) {
    try {
        const { count, flagged } = importJSON(arr);
        dataset = arr;
        const bounds = computeGlobalBounds(dataset);
        globalMin = bounds.min;
        globalMax = bounds.max;
        statusEl.textContent = `✓ ${count} violins loaded, ${flagged} flagged`;
        statusEl.className = 'status-msg';
        renderBulkActions(container, proceedCallback);
        renderGrid(container);
    } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        statusEl.className = 'error-msg';
    }
}

function renderImportUI(container, proceedCallback) {
    const section = document.createElement('section');
    section.className = 'import-section';

    const heading = document.createElement('h2');
    heading.textContent = 'Import Pipeline Output';
    section.appendChild(heading);

    const hint = document.createElement('p');
    hint.className = 'status-msg';
    hint.textContent = 'Paste the JSON array from data/final/<stem>.json, or drop the file below.';
    section.appendChild(hint);

    const dropzone = document.createElement('div');
    dropzone.className = 'upload-area';
    dropzone.textContent = 'Drop .json file here or click to choose';
    dropzone.tabIndex = 0;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) readFile(fileInput.files[0]);
    });
    section.appendChild(dropzone);
    section.appendChild(fileInput);

    const textarea = document.createElement('textarea');
    textarea.className = 'json-paste';
    textarea.placeholder = 'Or paste JSON array here…';
    textarea.rows = 6;
    section.appendChild(textarea);

    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn';
    loadBtn.textContent = 'Load JSON';
    loadBtn.addEventListener('click', () => {
        try {
            const arr = JSON.parse(textarea.value.trim());
            onDataLoaded(arr, container, statusEl, proceedCallback);
        } catch {
            statusEl.textContent = 'Invalid JSON — check the pasted text.';
            statusEl.className = 'error-msg';
        }
    });
    section.appendChild(loadBtn);

    const statusEl = document.createElement('p');
    statusEl.className = 'status-msg';
    section.appendChild(statusEl);

    function readFile(file) {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const arr = JSON.parse(e.target.result);
                onDataLoaded(arr, container, statusEl, proceedCallback);
            } catch {
                statusEl.textContent = 'Could not parse file as JSON.';
                statusEl.className = 'error-msg';
            }
        };
        reader.readAsText(file);
    }

    container.appendChild(section);
}

function initReview(container, proceedCallback) {
    container.innerHTML = '';

    const saved = getImportedDataset();
    const savedCorrections = localStorage.getItem('review_corrections');
    const savedAccepted = localStorage.getItem('review_accepted');
    if (savedCorrections) corrections = JSON.parse(savedCorrections);
    if (savedAccepted) reviewedSet = new Set(JSON.parse(savedAccepted));

    renderImportUI(container, proceedCallback);

    if (saved && saved.length) {
        dataset = saved;
        const bounds = computeGlobalBounds(dataset);
        globalMin = bounds.min;
        globalMax = bounds.max;
        renderBulkActions(container, proceedCallback);
        renderGrid(container);
    }
}

export { initReview };
