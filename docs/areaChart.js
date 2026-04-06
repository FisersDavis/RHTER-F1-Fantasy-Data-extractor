/**
 * createAreaChart — pure function, no state, no side effects.
 * Returns an SVG element showing a stepped percentile polyline.
 *
 * @param {{ p05, p25, p50, p75, p95 }} percentiles
 * @param {number} globalMin  lowest score across all violins
 * @param {number} globalMax  highest score across all violins
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

    // Stepped polyline: horizontal then vertical segments
    let d = '';
    for (let i = 0; i < points.length; i++) {
        const x = toX(points[i][0]).toFixed(1);
        const y = toY(points[i][1]).toFixed(1);
        if (i === 0) {
            d += `M ${x},${y}`;
        } else {
            // Step: go horizontal to new x at previous y, then vertical to new y
            d += ` H ${x} V ${y}`;
        }
    }

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#62eeb7');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);

    return svg;
}

export { createAreaChart };
