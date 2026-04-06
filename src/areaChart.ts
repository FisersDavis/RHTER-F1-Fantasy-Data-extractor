import type { Percentiles } from './types.js';

export function createAreaChart(
  percentiles: Percentiles,
  globalMin: number,
  globalMax: number,
  width: number,
  height: number,
): SVGSVGElement {
  const points: [number, number][] = [
    [percentiles.p05, 5],
    [percentiles.p25, 25],
    [percentiles.p50, 50],
    [percentiles.p75, 75],
    [percentiles.p95, 95],
  ];

  const range = globalMax - globalMin || 1;

  function toX(score: number): number {
    return ((score - globalMin) / range) * width;
  }
  function toY(rank: number): number {
    return height - (rank / 100) * height;
  }

  let d = '';
  for (let i = 0; i < points.length; i++) {
    const x = toX(points[i][0]).toFixed(1);
    const y = toY(points[i][1]).toFixed(1);
    if (i === 0) {
      d += `M ${x},${y}`;
    } else {
      d += ` H ${x} V ${y}`;
    }
  }

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg') as SVGSVGElement;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#62eeb7');
  line.setAttribute('stroke-width', '1.5');
  svg.appendChild(line);

  return svg;
}
