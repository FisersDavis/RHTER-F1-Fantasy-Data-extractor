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

// Lab reference colors for Delta-E matching (L, a, b)
// Derived from the hex values above via standard sRGB→Lab transform
export const CONSTRUCTOR_LAB: Record<string, [number, number, number]> = {
  MCL: [60.73,  28.28,  62.55],
  MER: [78.82, -32.07,  -4.34],
  RED: [ 5.27,   7.74, -22.87],
  FER: [37.21,  57.00,  45.71],
  WIL: [29.57,  32.33, -75.64],
  VRB: [70.30,  -8.15, -27.73],
  AST: [25.90, -26.39,  10.69],
  HAA: [100.0,   0.00,   0.00],
  AUD: [18.24,  26.95,  -2.35],
  ALP: [72.68,  30.66,  -9.47],
  CAD: [76.61,   0.00,   0.00],
};

// Grid layout for 2000×1124px reference screenshot
// Populated in Task 7 after calibration
export const GRID_COLS = 24;
export const GRID_ROWS = 3;
