/**
 * createAreaChart — pure function, no state, no side effects.
 * Returns an SVG element showing a percentile area shape.
 *
 * @param {{ p05, p25, p50, p75, p95 }} percentiles
 * @param {number} globalMin  lowest score across all 72 violins
 * @param {number} globalMax  highest score across all 72 violins
 * @param {number} width      SVG width in px
 * @param {number} height     SVG height in px
 * @returns {SVGSVGElement}
 */
function createAreaChart(percentiles, globalMin, globalMax, width, height) {
    const points = [
        [percentiles.p05, 5],
        [percentiles.p25, 25],
        [percentiles.p50, 50],
        [percentiles.p75, 75],
        [percentiles.p95, 95],
    ];

    const range = globalMax - globalMin || 1;

    function toX(score) {
        return ((score - globalMin) / range) * width;
    }
    function toY(rank) {
        return height - (rank / 100) * height;
    }

    // Area path: forward along curve, then back along the baseline
    const top = points.map(([score, rank]) => `${toX(score).toFixed(1)},${toY(rank).toFixed(1)}`);
    const bottomLeft = `${toX(percentiles.p05).toFixed(1)},${height}`;
    const bottomRight = `${toX(percentiles.p95).toFixed(1)},${height}`;
    const d = `M ${top[0]} L ${top.slice(1).join(' L ')} L ${bottomRight} L ${bottomLeft} Z`;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', d);
    area.setAttribute('fill', 'rgba(233,69,96,0.25)');
    area.setAttribute('stroke', '#e94560');
    area.setAttribute('stroke-width', '1.5');
    svg.appendChild(area);

    return svg;
}

export { createAreaChart };
