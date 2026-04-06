/**
 * Pure function: takes percentile data + global bounds, returns an SVG element.
 * No state, no side effects.
 *
 * @param {{ p05, p25, p50, p75, p95 }} percentiles
 * @param {number} globalMin
 * @param {number} globalMax
 * @param {number} width
 * @param {number} height
 * @returns {SVGElement}
 */
function makeAreaChart(percentiles, globalMin, globalMax, width, height) {
    const { p05, p25, p50, p75, p95 } = percentiles;
    const pad = { top: 4, bottom: 4, left: 2, right: 2 };

    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    // x: score value mapped to globalMin–globalMax
    function xPos(score) {
        const range = globalMax - globalMin || 1;
        return pad.left + ((score - globalMin) / range) * chartW;
    }

    // y: percentile rank — fixed positions p05=5, p25=25, p50=50, p75=75, p95=95
    // mapped so p95 is at top (low y), p05 at bottom (high y)
    function yPos(pct) {
        return pad.top + ((95 - pct) / 90) * chartH;
    }

    // 5 points: (score, percentile)
    const points = [
        [p05, 5],
        [p25, 25],
        [p50, 50],
        [p75, 75],
        [p95, 95],
    ];

    // Build SVG path: area from bottom-left, up through points, back down
    const linePoints = points.map(([s, p]) => `${xPos(s)},${yPos(p)}`);

    // Closed area: go along points, then close back along bottom
    const areaPath = [
        `M ${xPos(p05)},${yPos(5)}`,
        ...points.slice(1).map(([s, p]) => `L ${xPos(s)},${yPos(p)}`),
        `L ${xPos(p95)},${height - pad.bottom}`,
        `L ${xPos(p05)},${height - pad.bottom}`,
        'Z',
    ].join(' ');

    // Stroke-only line through the points
    const linePath = `M ${linePoints.join(' L ')}`;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.display = 'block';

    const area = document.createElementNS(NS, 'path');
    area.setAttribute('d', areaPath);
    area.setAttribute('fill', 'rgba(180,180,200,0.18)');
    area.setAttribute('stroke', 'none');
    svg.appendChild(area);

    const line = document.createElementNS(NS, 'path');
    line.setAttribute('d', linePath);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'rgba(200,200,220,0.7)');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);

    // p50 tick mark
    const midX = xPos(p50);
    const tick = document.createElementNS(NS, 'line');
    tick.setAttribute('x1', midX);
    tick.setAttribute('y1', yPos(50) - 3);
    tick.setAttribute('x2', midX);
    tick.setAttribute('y2', yPos(50) + 3);
    tick.setAttribute('stroke', 'rgba(233,69,96,0.8)');
    tick.setAttribute('stroke-width', '1');
    svg.appendChild(tick);

    return svg;
}

export { makeAreaChart };
