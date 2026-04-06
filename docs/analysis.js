import { createAreaChart } from './areaChart.js';
import { getReviewedDataset } from './dataStore.js';
import { TEAM_COLORS } from './review.js';

function estimateWinProb(percentiles, threshold) {
    const pts = [
        [percentiles.p05, 0.05],
        [percentiles.p25, 0.25],
        [percentiles.p50, 0.50],
        [percentiles.p75, 0.75],
        [percentiles.p95, 0.95],
    ];

    if (threshold <= pts[0][0]) return 1 - pts[0][1];
    if (threshold >= pts[4][0]) return 1 - pts[4][1];

    for (let i = 0; i < pts.length - 1; i++) {
        const [s0, c0] = pts[i];
        const [s1, c1] = pts[i + 1];
        if (threshold >= s0 && threshold <= s1) {
            const t = (threshold - s0) / (s1 - s0);
            const cdf = c0 + t * (c1 - c0);
            return 1 - cdf;
        }
    }
    return 0;
}

function calcKelly(violin, threshold) {
    const p = estimateWinProb(violin.percentiles, threshold);
    const b = (violin.percentiles.p95 - threshold) / Math.max(threshold, 1);
    const f = (b * p - (1 - p)) / Math.max(b, 0.0001);
    return Math.max(0, Math.min(1, f));
}

function computeRankedList(violins, budgetLimit, sortKey) {
    const p50s = violins.map(v => v.percentiles.p50).sort((a, b) => a - b);
    const threshold = p50s[Math.floor(p50s.length / 2)];

    const entries = violins.map(v => ({
        violin: v,
        kelly: calcKelly(v, threshold),
        overBudget: v.header.budget_required > budgetLimit,
    }));

    const sortFns = {
        kelly: (a, b) => b.kelly - a.kelly,
        avg_xpts: (a, b) => b.violin.header.avg_xpts - a.violin.header.avg_xpts,
        p50: (a, b) => b.violin.percentiles.p50 - a.violin.percentiles.p50,
        budget: (a, b) => a.violin.header.budget_required - b.violin.header.budget_required,
    };

    const eligible = entries.filter(e => !e.overBudget).sort(sortFns[sortKey] || sortFns.kelly);
    const overBudget = entries.filter(e => e.overBudget).sort(sortFns[sortKey] || sortFns.kelly);
    return [...eligible, ...overBudget];
}

function makeRankedEntry(entry, rank, globalMin, globalMax) {
    const { violin, kelly, overBudget } = entry;
    const el = document.createElement('div');
    el.className = 'ranked-entry' + (overBudget ? ' over-budget' : '');

    // Rank number
    const rankEl = document.createElement('div');
    rankEl.className = 'rank-number';
    rankEl.textContent = `#${rank}`;
    el.appendChild(rankEl);

    // Mini chart
    const chartWrap = document.createElement('div');
    chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 120, 40));
    el.appendChild(chartWrap);

    // Kelly bar + score text
    const infoCol = document.createElement('div');

    const barWrap = document.createElement('div');
    barWrap.className = 'kelly-bar-wrap';
    const barFill = document.createElement('div');
    barFill.className = 'kelly-bar-fill';
    barFill.style.width = `${(kelly * 100).toFixed(1)}%`;
    barWrap.appendChild(barFill);
    infoCol.appendChild(barWrap);

    const scoreText = document.createElement('div');
    scoreText.className = 'score-text';
    scoreText.textContent = `P50:${violin.percentiles.p50}  RANGE:${violin.percentiles.p05}–${violin.percentiles.p95}`;
    infoCol.appendChild(scoreText);

    const drivers = violin.drivers.map(d => d.multiplier ? `${d.name}(${d.multiplier})` : d.name).join(' ');
    const cn1 = violin.constructors.cn1.team;
    const cn2 = violin.constructors.cn2.team;

    const pickText = document.createElement('div');
    pickText.className = 'score-text';
    pickText.textContent = `${drivers}  [${cn1}][${cn2}]`;
    infoCol.appendChild(pickText);

    el.appendChild(infoCol);

    // Budget
    const budgetEl = document.createElement('div');
    budgetEl.className = 'score-text';
    budgetEl.textContent = `${violin.header.budget_required}M`;
    el.appendChild(budgetEl);

    return el;
}

function initAnalysis(container) {
    const section = document.createElement('section');

    const violins = getReviewedDataset();
    if (!violins || !violins.length) {
        const msg = document.createElement('p');
        msg.className = 'status-msg';
        msg.textContent = 'NO DATA. IMPORT PIPELINE JSON IN THE REVIEW TAB FIRST.';
        section.appendChild(msg);
        container.appendChild(section);
        return;
    }

    // Controls
    const controls = document.createElement('div');
    controls.className = 'analysis-controls';

    const budgetLabel = document.createElement('label');
    budgetLabel.textContent = 'BUDGET (M)';
    const budgetInput = document.createElement('input');
    budgetInput.type = 'number';
    budgetInput.value = localStorage.getItem('userBudget') || '105';
    budgetInput.step = '0.1';
    budgetInput.min = '0';
    budgetInput.style.width = '80px';
    budgetLabel.appendChild(budgetInput);
    controls.appendChild(budgetLabel);

    const sortLabel = document.createElement('label');
    sortLabel.textContent = 'SORT BY';
    const sortSelect = document.createElement('select');
    [
        { value: 'kelly', text: 'KELLY SCORE' },
        { value: 'avg_xpts', text: 'AVG XPTS' },
        { value: 'p50', text: 'P50 SCORE' },
        { value: 'budget', text: 'BUDGET' },
    ].forEach(({ value, text }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        sortSelect.appendChild(opt);
    });
    sortLabel.appendChild(sortSelect);
    controls.appendChild(sortLabel);

    section.appendChild(controls);

    const listContainer = document.createElement('div');
    listContainer.className = 'ranked-list';
    section.appendChild(listContainer);

    function render() {
        listContainer.innerHTML = '';
        const budget = parseFloat(budgetInput.value) || Infinity;
        const sortKey = sortSelect.value;
        const ranked = computeRankedList(violins, budget, sortKey);

        const allScores = violins.flatMap(v => [v.percentiles.p05, v.percentiles.p95]);
        const globalMin = Math.min(...allScores);
        const globalMax = Math.max(...allScores);

        ranked.forEach((entry, i) => {
            listContainer.appendChild(makeRankedEntry(entry, i + 1, globalMin, globalMax));
        });
    }

    budgetInput.addEventListener('input', () => {
        localStorage.setItem('userBudget', budgetInput.value);
        render();
    });
    sortSelect.addEventListener('change', render);
    render();

    container.appendChild(section);
}

export { initAnalysis };
