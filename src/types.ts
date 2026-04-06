export interface Header {
  budget_required: number;
  avg_xpts: number;
  avg_xpts_dollar_impact: number;
  avg_budget_uplift: number | null;
}

export interface Percentiles {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface Driver {
  name: string;
  multiplier: string | null;
}

export interface ConstructorEntry {
  color_rgb: [number, number, number] | null;
  team: string;
}

export interface Constructors {
  cn1: ConstructorEntry;
  cn2: ConstructorEntry;
}

export interface ViolinCrop {
  row: number;
  col: number;
  header: Header;
  percentiles: Percentiles;
  drivers: Driver[];
  constructors: Constructors;
  confidence: 'high' | 'low';
  flagged: boolean;
  flag_reasons: string[];
  raw_response: string;
}

export interface DatasetMeta {
  key: string;
  date: string;
  count: number;
  errors: number;
}
