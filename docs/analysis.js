import { getReviewedDataset } from './dataStore.js';
import { makeViolinCard } from './reviewCard.js';

/**
 * Compute Kelly fraction for a single violin.
 * @param {{ p05, p25, p50, p75, p95 }} percentiles
 * @param {number} threshold - median p50 across all violins
 * @returns {number} Kelly fraction clamped to [0, 1]
 */
function kellyFraction(percentiles, threshold) {
    const { p05, p25, p50, p75, p95 } = percentiles;

    // Estimate p_above: fraction of distribution above threshold
    // Interpolate linearly between the two percentile points straddling threshold
    let pBelow;
    if (threshold <= p05) {
        pBelow = 0.05;
    } else if (threshold <= p25) {
        pBelow = 0.05 + 0.20 * (threshold - p05) / (p25 - p05 || 1);
    } else if (threshold <= p50) {
        pBelow = 0.25 + 0.25 * (threshold - p25) / (p50 - p25 || 1);
    } else if (threshold <= p75) {
        pBelow = 0.50 + 0.25 * (threshold - p50) / (p75 - p50 || 1);
    } else if (threshold <= p95) {
        pBelow = 0.75 + 0.20 * (threshold - p75) / (p95 - p75 || 1);
    } else {
        pBelow = 0.95;
    }

    const p = 1 - pBelow; // win probability

    // Upside ratio: reward above threshold relative to threshold
    const b = (p95 - threshold) / (threshold || 1);

    const f = (b * p - (1 - p)) / (b || 1);
    return Math.max(0, Math.min(1, f));
}

function computeKellyRankings(dataset) {
    const p50s = dataset.map(v => v.percentiles.p50).sort((a, b) => a - b);
    const mid = Math.floor(p50s.length / 2);
    const threshold = p50s.length % 2 === 0
        ? (p50s[mid - 1] + p50s[mid]) / 2
        : p50s[mid];

    return dataset.map(v => ({
        ...v,
        kellyScore: kellyFraction(v.percentiles, threshold),
    })).sort((a, b) => b.kellyScore - a.kellyScore);
}

function computeGlobalBounds(data) {
    let min = Infinity, max = -Infinity;
    for (const v of data) {
        if (v.percentiles.p05 < min) min = v.percentiles.p05;
        if (v.percentiles.p95 > max) max = v.percentiles.p95;
    }
    return { min, max };
}

function renderEntry(v, rank, globalMin, globalMax, maxKelly, overBudget) {
    const row = document.createElement('div');
    row.className = 'analysis-entry' + (overBudget ? ' entry-over-budget' : '') + (rank <= 3 && !overBudget ? ' entry-top3' : '');

    // Rank + Kelly bar
    const rankCol = document.createElement('div');
    rankCol.className = 'entry-rank';
    const rankNum = document.createElement('span');
    rankNum.className = 'rank-number';
    rankNum.textContent = `#${rank}`;
    rankCol.appendChild(rankNum);

    const kellyBar = document.createElement('div');
    kellyBar.className = 'kelly-bar-wrap';
    const kellyFill = document.createElement('div');
    kellyFill.className = 'kelly-bar-fill';
    kellyFill.style.width = `${(v.kellyScore / (maxKelly || 1)) * 100}%`;
    kellyBar.appendChild(kellyFill);

    const kellyNum = document.createElement('span');
    kellyNum.className = 'kelly-score-label';
    kellyNum.textContent = v.kellyScore.toFixed(3);
    rankCol.appendChild(kellyBar);
    rankCol.appendChild(kellyNum);

    row.appendChild(rankCol);

    // Mini card (reuse from reviewCard)
    const card = makeViolinCard(v, globalMin, globalMax, false, () => {}, () => {});
    card.classList.add('analysis-mini-card');
    row.appendChild(card);

    // Score summary
    const summary = document.createElement('div');
    summary.className = 'entry-summary';
    const p = v.percentiles;
    summary.innerHTML = '';
    const p50el = document.createElement('div');
    p50el.className = 'entry-p50';
    p50el.textContent = `Median: ${p.p50}`;
    const rangeel = document.createElement('div');
    rangeel.className = 'entry-range';
    rangeel.textContent = `Range: ${p.p05}–${p.p95}`;
    summary.appendChild(p50el);
    summary.appendChild(rangeel);
    row.appendChild(summary);

    return row;
}

function renderList(container, ranked, budget, globalMin, globalMax) {
    const existing = container.querySelector('.analysis-list');
    if (existing) existing.remove();

    const list = document.createElement('div');
    list.className = 'analysis-list';

    const maxKelly = ranked[0]?.kellyScore ?? 1;
    const inBudget = ranked.filter(v => v.header.budget_required <= budget);
    const overBudget = ranked.filter(v => v.header.budget_required > budget);
    const ordered = [...inBudget, ...overBudget];

    let displayRank = 0;
    for (const v of ordered) {
        const ob = v.header.budget_required > budget;
        if (!ob) displayRank++;
        list.appendChild(renderEntry(v, ob ? '–' : displayRank, globalMin, globalMax, maxKelly, ob));
    }

    container.appendChild(list);
}

function initAnalysis(container) {
    container.innerHTML = '';

    const dataset = getReviewedDataset();
    if (!dataset || !dataset.length) {
        const msg = document.createElement('p');
        msg.className = 'status-msg';
        msg.textContent = 'No reviewed data yet. Import and review data in the Review tab first.';
        container.appendChild(msg);
        return;
    }

    const ranked = computeKellyRankings(dataset);
    const { min: globalMin, max: globalMax } = computeGlobalBounds(dataset);
    const defaultBudget = Math.max(...dataset.map(v => v.header.budget_required));

    // Controls
    const controls = document.createElement('div');
    controls.className = 'analysis-controls';

    const budgetLabel = document.createElement('label');
    budgetLabel.textContent = 'Budget limit (m): ';
    const budgetInput = document.createElement('input');
    budgetInput.type = 'number';
    budgetInput.value = defaultBudget;
    budgetInput.step = '0.1';
    budgetInput.min = '0';
    budgetInput.className = 'budget-input';
    budgetLabel.appendChild(budgetInput);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn';
    applyBtn.textContent = 'Apply';

    const sortLabel = document.createElement('label');
    sortLabel.textContent = '  Sort: ';
    const sortSelect = document.createElement('select');
    sortSelect.className = 'sort-select';
    for (const [val, text] of [['kelly', 'Kelly Score'], ['avg_xpts', 'Avg xPts'], ['p50', 'p50'], ['budget', 'Budget Required']]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = text;
        sortSelect.appendChild(opt);
    }

    controls.appendChild(budgetLabel);
    controls.appendChild(applyBtn);
    controls.appendChild(sortLabel);
    controls.appendChild(sortSelect);
    container.appendChild(controls);

    function getSorted(sortKey, data) {
        const copy = [...data];
        if (sortKey === 'kelly') return copy; // already sorted by kelly
        if (sortKey === 'avg_xpts') return copy.sort((a, b) => b.header.avg_xpts - a.header.avg_xpts);
        if (sortKey === 'p50') return copy.sort((a, b) => b.percentiles.p50 - a.percentiles.p50);
        if (sortKey === 'budget') return copy.sort((a, b) => a.header.budget_required - b.header.budget_required);
        return copy;
    }

    function applyFilters() {
        const budget = parseFloat(budgetInput.value) || defaultBudget;
        const sortKey = sortSelect.value;
        const sorted = getSorted(sortKey, ranked);
        renderList(container, sorted, budget, globalMin, globalMax);
    }

    applyBtn.addEventListener('click', applyFilters);
    sortSelect.addEventListener('change', applyFilters);

    applyFilters();
}

export { initAnalysis };
