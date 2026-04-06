import { createAreaChart } from './areaChart.js';
import { importJSON, saveReviewedDataset, getImportedViolins } from './dataStore.js';

const TEAM_COLORS = {
    MCL: '#FF8700', MER: '#00D2BE', RED: '#001B5E', FER: '#DC0000',
    WIL: '#0057FF', VRB: '#6AB4E4', AST: '#006F49', HAA: '#FFFFFF',
    AUD: '#7A0028', ALP: '#FF87BC', CAD: '#C0C0C0',
};
const TEAMS = Object.keys(TEAM_COLORS);

// Module-level working copy of violins (post-correction)
let violins = [];

function computeGlobalBounds(data) {
    let min = Infinity, max = -Infinity;
    for (const v of data) {
        if (v.percentiles.p05 < min) min = v.percentiles.p05;
        if (v.percentiles.p95 > max) max = v.percentiles.p95;
    }
    return { globalMin: min, globalMax: max };
}

function makeConstructorBadge(violin, which) {
    // which: 'cn1' | 'cn2'
    const wrapper = document.createElement('div');
    wrapper.className = 'constructor-badge';

    const dot = document.createElement('span');
    dot.className = 'color-dot';
    const team = violin.constructors[which].team;
    dot.style.background = TEAM_COLORS[team] || '#888';

    const label = document.createElement('span');
    label.textContent = team;

    const dropdown = document.createElement('div');
    dropdown.className = 'constructor-dropdown';

    for (const t of TEAMS) {
        const opt = document.createElement('button');
        const optDot = document.createElement('span');
        optDot.className = 'color-dot';
        optDot.style.background = TEAM_COLORS[t];
        opt.appendChild(optDot);
        opt.appendChild(document.createTextNode(t));
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            violin.constructors[which].team = t;
            dot.style.background = TEAM_COLORS[t];
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
        // Close all other open dropdowns
        document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) dropdown.classList.add('open');
    });

    return wrapper;
}

function makeCard(violin, globalMin, globalMax) {
    const card = document.createElement('div');
    card.className = 'violin-card';
    if (violin.flagged || violin.confidence !== 'high') card.classList.add('flagged');
    if (violin._accepted) card.classList.add('accepted');

    // Header row
    const header = document.createElement('div');
    header.className = 'card-header';
    header.textContent = `${violin.header.budget_required}m  ${violin.header.avg_xpts}pts  +${violin.header.avg_budget_uplift}m`;
    card.appendChild(header);

    // Chart
    const chartWrap = document.createElement('div');
    chartWrap.className = 'card-chart';
    chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 100, 40));
    card.appendChild(chartWrap);

    // Drivers
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
            input.style.cssText = 'width:3ch;background:#1a1a2e;color:#e0e0e0;border:1px solid #e94560;border-radius:2px;font-size:0.7rem;padding:0;text-align:center;';
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
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') input.replaceWith(span); });
        });
        driverRow.appendChild(span);
    }
    card.appendChild(driverRow);

    // Constructors
    const cnRow = document.createElement('div');
    cnRow.className = 'card-constructors';
    cnRow.appendChild(makeConstructorBadge(violin, 'cn1'));
    cnRow.appendChild(makeConstructorBadge(violin, 'cn2'));
    card.appendChild(cnRow);

    return card;
}

function renderGrid(container, data) {
    const { globalMin, globalMax } = computeGlobalBounds(data);

    const ROWS = [
        { label: 'Budget Tier 1', items: data.filter(v => v.row === 0).sort((a, b) => a.col - b.col) },
        { label: 'Budget Tier 2', items: data.filter(v => v.row === 1).sort((a, b) => a.col - b.col) },
        { label: 'Budget Tier 3', items: data.filter(v => v.row === 2).sort((a, b) => a.col - b.col) },
    ];

    for (const tier of ROWS) {
        const tierLabel = document.createElement('div');
        tierLabel.className = 'tier-label';
        tierLabel.textContent = tier.label;
        container.appendChild(tierLabel);

        const grid = document.createElement('div');
        grid.className = 'violin-grid';
        for (const v of tier.items) {
            grid.appendChild(makeCard(v, globalMin, globalMax));
        }
        container.appendChild(grid);
    }
}

function initReview(container) {
    const section = document.createElement('section');

    // Import area
    const importHeading = document.createElement('h2');
    importHeading.textContent = 'Import Pipeline JSON';
    section.appendChild(importHeading);

    const pasteArea = document.createElement('textarea');
    pasteArea.placeholder = 'Paste pipeline JSON array here, or drag and drop a .json file…';
    pasteArea.style.cssText = 'width:100%;height:120px;background:#16213e;color:#e0e0e0;border:1px solid #0f3460;border-radius:4px;padding:0.5rem;font-family:monospace;font-size:0.8rem;resize:vertical;';
    section.appendChild(pasteArea);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn';
    importBtn.textContent = 'Load JSON';
    importBtn.style.marginTop = '0.5rem';
    section.appendChild(importBtn);

    const summaryEl = document.createElement('div');
    section.appendChild(summaryEl);

    // File drop
    pasteArea.addEventListener('dragover', (e) => e.preventDefault());
    pasteArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { pasteArea.value = reader.result; };
        reader.readAsText(file);
    });

    // Bulk actions
    const bulkBar = document.createElement('div');
    bulkBar.className = 'bulk-actions';
    bulkBar.style.display = 'none';

    const acceptAllBtn = document.createElement('button');
    acceptAllBtn.className = 'btn';
    acceptAllBtn.textContent = 'Accept all unflagged';

    const clearFlagsBtn = document.createElement('button');
    clearFlagsBtn.className = 'btn';
    clearFlagsBtn.textContent = 'Clear all flags';

    const proceedBtn = document.createElement('button');
    proceedBtn.className = 'btn';
    proceedBtn.textContent = 'Proceed to Analysis';
    proceedBtn.disabled = true;

    bulkBar.appendChild(acceptAllBtn);
    bulkBar.appendChild(clearFlagsBtn);
    bulkBar.appendChild(proceedBtn);
    section.appendChild(bulkBar);

    // Grid container
    const gridContainer = document.createElement('div');
    section.appendChild(gridContainer);

    // Close dropdowns on outside click (registered once)
    document.addEventListener('click', () => {
        document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
    });

    function loadData(data) {
        violins = data.map(v => ({ ...v, _accepted: false }));
        summaryEl.className = 'import-summary';
        const flaggedCount = data.filter(v => v.flagged || v.confidence !== 'high').length;
        summaryEl.textContent = `✓ ${data.length} violins loaded, ${flaggedCount} flagged`;
        bulkBar.style.display = 'flex';
        gridContainer.innerHTML = '';
        renderGrid(gridContainer, violins);
        updateProceedBtn();
        saveReviewedDataset(violins);
    }

    function updateProceedBtn() {
        proceedBtn.disabled = !violins.some(v => v._accepted);
    }

    // Try loading persisted import on init
    const persisted = getImportedViolins();
    if (persisted) loadData(persisted);

    importBtn.addEventListener('click', () => {
        summaryEl.textContent = '';
        summaryEl.className = '';
        try {
            const parsed = JSON.parse(pasteArea.value.trim());
            importJSON(parsed);
            loadData(parsed);
        } catch (err) {
            summaryEl.className = 'import-error';
            summaryEl.textContent = `Error: ${err.message}`;
        }
    });

    acceptAllBtn.addEventListener('click', () => {
        for (const v of violins) {
            if (!v.flagged && v.confidence === 'high') v._accepted = true;
        }
        gridContainer.innerHTML = '';
        renderGrid(gridContainer, violins);
        updateProceedBtn();
        saveReviewedDataset(violins);
    });

    clearFlagsBtn.addEventListener('click', () => {
        for (const v of violins) {
            v.flagged = false;
        }
        gridContainer.innerHTML = '';
        renderGrid(gridContainer, violins);
        saveReviewedDataset(violins);
    });

    proceedBtn.addEventListener('click', () => {
        // Navigation is handled by app.js — dispatch a custom event
        document.dispatchEvent(new CustomEvent('navigate', { detail: 'analysis' }));
    });

    container.appendChild(section);
}

export { initReview, TEAM_COLORS, TEAMS };
