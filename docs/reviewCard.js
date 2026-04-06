import { makeAreaChart } from './areaChart.js';

const TEAMS = ['MCL', 'MER', 'RED', 'FER', 'WIL', 'VRB', 'AST', 'HAA', 'AUD', 'ALP', 'CAD'];

const TEAM_COLORS = {
    MCL: '#ff8700', MER: '#00d2d2', RED: '#1e3a5f', FER: '#e8002d',
    WIL: '#0057b8', VRB: '#6ab4e8', AST: '#006f3c', HAA: '#c8c8c8',
    AUD: '#800000', ALP: '#ff69b4', CAD: '#808080',
};

function makeConstructorBadge(team, key, cn, onTeamChange) {
    const wrapper = document.createElement('span');
    wrapper.className = 'constructor-badge';
    wrapper.title = 'Click to change team';

    const dot = document.createElement('span');
    dot.className = 'constructor-dot';
    dot.style.background = TEAM_COLORS[team] || '#888';

    const label = document.createElement('span');
    label.textContent = team;

    wrapper.appendChild(dot);
    wrapper.appendChild(label);

    wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        const existing = wrapper.querySelector('.team-dropdown');
        if (existing) { existing.remove(); return; }

        const dropdown = document.createElement('select');
        dropdown.className = 'team-dropdown';
        for (const t of TEAMS) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === team) opt.selected = true;
            dropdown.appendChild(opt);
        }
        dropdown.addEventListener('change', () => {
            const newTeam = dropdown.value;
            dot.style.background = TEAM_COLORS[newTeam] || '#888';
            label.textContent = newTeam;
            dropdown.remove();
            onTeamChange(cn, newTeam);
        });
        dropdown.addEventListener('blur', () => dropdown.remove());
        wrapper.appendChild(dropdown);
        dropdown.focus();
    });

    return wrapper;
}

function makeDriverLabel(driver, idx, onDriverChange) {
    const span = document.createElement('span');
    span.className = 'driver-label';
    if (driver.multiplier) span.classList.add('driver-2x');

    const name = document.createElement('span');
    name.className = 'driver-name';
    name.textContent = driver.name;
    name.contentEditable = true;
    name.addEventListener('blur', () => {
        const val = name.textContent.trim().toUpperCase().slice(0, 3);
        name.textContent = val;
        onDriverChange(idx, val);
    });
    name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
    });

    span.appendChild(name);
    if (driver.multiplier) {
        const mx = document.createElement('sup');
        mx.textContent = '2×';
        mx.className = 'multiplier';
        span.appendChild(mx);
    }
    return span;
}

/**
 * @param {object} v - violin data (already merged with corrections)
 * @param {number} globalMin
 * @param {number} globalMax
 * @param {boolean} accepted
 * @param {function} onTeamChange - (cn, newTeam) => void
 * @param {function} onDriverChange - (idx, newName) => void
 */
function makeViolinCard(v, globalMin, globalMax, accepted, onTeamChange, onDriverChange) {
    const flagged = v.flagged || v.confidence !== 'high';

    const card = document.createElement('div');
    card.className = 'violin-card' + (flagged ? ' card-flagged' : '') + (accepted ? ' card-accepted' : '');

    const stats = document.createElement('div');
    stats.className = 'card-stats';
    const h = v.header;
    stats.textContent = `${h.budget_required}m  ${h.avg_xpts}pts  +${h.avg_budget_uplift}m`;
    card.appendChild(stats);

    const chartEl = makeAreaChart(v.percentiles, globalMin, globalMax, 120, 48);
    chartEl.classList.add('card-chart');
    card.appendChild(chartEl);

    const driversRow = document.createElement('div');
    driversRow.className = 'card-drivers';
    for (let i = 0; i < v.drivers.length; i++) {
        driversRow.appendChild(makeDriverLabel(v.drivers[i], i, onDriverChange));
    }
    card.appendChild(driversRow);

    const cnsRow = document.createElement('div');
    cnsRow.className = 'card-constructors';
    cnsRow.appendChild(makeConstructorBadge(v.constructors.cn1.team, null, 'cn1', onTeamChange));
    cnsRow.appendChild(makeConstructorBadge(v.constructors.cn2.team, null, 'cn2', onTeamChange));
    card.appendChild(cnsRow);

    return card;
}

export { makeViolinCard, TEAMS, TEAM_COLORS };
