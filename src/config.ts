// RGB hex colors for display
export const CONSTRUCTOR_COLORS: Record<string, string> = {
  MCL: '#FF8700',
  MER: '#00D2BE',
  RED: '#001B5E',
  FER: '#DC0000',
  WIL: '#0057FF',
  VRB: '#6AB4E4',
  AST: '#006F49',
  HAA: '#FFFFFF',
  AUD: '#7A0028',
  ALP: '#FF87BC',
  CAD: '#C0C0C0',
};

export const TEAMS = Object.keys(CONSTRUCTOR_COLORS);
export const CONSTRUCTOR_CODES = [...TEAMS];

export const CONSTRUCTOR_RGB: Record<string, [number, number, number]> = {
  MCL: [255, 135, 0],
  MER: [0, 210, 190],
  RED: [0, 27, 94],
  FER: [220, 0, 0],
  WIL: [0, 87, 255],
  VRB: [106, 180, 228],
  AST: [0, 111, 73],
  HAA: [255, 255, 255],
  AUD: [122, 0, 40],
  ALP: [255, 135, 188],
  CAD: [192, 192, 192],
};

// Lab reference colors for Delta-E matching (L, a, b)
// Derived from the hex values above via standard sRGB→Lab transform
export const CONSTRUCTOR_LAB: Record<string, [number, number, number]> = {
  MCL: [ 68.46,  39.35,  74.86],
  MER: [ 75.95, -47.29,  -2.29],
  RED: [ 13.18,  21.15, -42.18],
  FER: [ 45.94,  71.64,  60.11],
  WIL: [ 44.28,  44.59, -87.96],
  VRB: [ 70.39,  -9.72, -31.11],
  AST: [ 40.98, -37.14,  13.68],
  HAA: [100.00,   0.00,   0.00],
  AUD: [ 24.61,  47.74,  14.01],
  ALP: [ 71.02,  51.37,  -6.90],
  CAD: [ 77.70,   0.00,   0.00],
};

// Grid layout for 2000×1124px reference screenshot
// Populated in Task 7 after calibration
export const GRID_COLS = 24;
export const GRID_ROWS = 3;
