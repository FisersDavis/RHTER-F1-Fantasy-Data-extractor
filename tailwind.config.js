module.exports = {
  content: ['./src/**/*.ts', './docs/index.html'],
  theme: {
    extend: {
      colors: {
        bg:           '#0a0a0a',
        bg1:          '#111111',
        bg2:          '#161616',
        bg3:          '#1c1c1c',
        border:       '#222222',
        border2:      '#2a2a2a',
        muted:        '#444444',
        sub:          '#666666',
        dim:          '#888888',
        text:         '#e8e8e8',
        accent:       '#e8401c',
        'accent-dim': 'rgba(232,64,28,0.12)',
        'accent-border': 'rgba(232,64,28,0.40)',
        team: {
          MER: '#06d3bf', FER: '#dd1818', RBR: '#1e41ff',
          MCL: '#ff6700', AMR: '#006b3c', WIL: '#005aff',
          ALP: '#ff87bc', HAA: '#b6babd', KIC: '#52e252', SAU: '#9b0000',
        }
      },
      fontFamily: { mono: ['"Space Mono"', 'monospace'] },
      borderRadius: { DEFAULT: '0', none: '0' },
      fontSize: { label: ['9px', { letterSpacing: '0.18em' }] },
    }
  }
}
