import { CONSTRUCTOR_RGB } from '../config.js';

export function generateDemoViolins(): unknown[] {
  const driverSets = [
    ['VER', 'NOR', 'PIA'],
    ['HAM', 'RUS', 'LEC'],
    ['SAI', 'ALO', 'STR'],
    ['TSU', 'GAS', 'OCO'],
    ['HUL', 'MAG', 'BOT'],
    ['ZHO', 'LAW', 'COL'],
  ];

  const constructorPairs = [
    ['MCL', 'RED'], ['MER', 'FER'], ['AST', 'WIL'],
    ['ALP', 'HAA'], ['MCL', 'MER'], ['RED', 'FER'],
  ];

  const violins = [];
  for (let i = 0; i < 6; i++) {
    const p50 = 80 + Math.round(Math.random() * 40);
    const spread = 10 + Math.round(Math.random() * 20);
    const [cn1, cn2] = constructorPairs[i];
    violins.push({
      row: Math.floor(i / 3),
      col: i % 3,
      header: {
        budget_required: 95 + Math.round(Math.random() * 20),
        avg_xpts: p50,
        avg_xpts_dollar_impact: 0.8,
        avg_budget_uplift: null,
      },
      percentiles: {
        p05: p50 - spread * 2,
        p25: p50 - spread,
        p50,
        p75: p50 + spread,
        p95: p50 + spread * 2,
      },
      drivers: driverSets[i].map((name, j) => ({ name, multiplier: j === 0 ? '2X' : null })),
      constructors: {
        cn1: { color_rgb: CONSTRUCTOR_RGB[cn1] ?? null, team: cn1 },
        cn2: { color_rgb: CONSTRUCTOR_RGB[cn2] ?? null, team: cn2 },
      },
      confidence: 'high' as const,
      flagged: i === 2,
      flag_reasons: i === 2 ? ['P95 OUTLIER'] : [],
      raw_response: '',
    });
  }

  return violins;
}
