/**
 * Tema visual de STI-Cam.
 * Colores, espaciado, tipografía.
 */

export const colors = {
  bg:          '#000000',
  bgCard:      '#1A1C1E',
  bgInput:     '#1F2937',
  border:      '#1F2937',
  borderLight: '#374151',
  text:        '#E5E7EB',
  textMuted:   '#9CA3AF',
  textDim:     '#6B7280',
  textWhite:   '#F9FAFB',
  accent:      '#454545',
  accentLight: '#383838',
  accentGlow:  '#303030',
  success:     '#22C55E',
  successBg:   '#1A1F1A',
  successBorder: '#22472A',
  error:       '#E64242',
  white:       '#FFFFFF',
  black:       '#000000',
  overlay:     '#00000099',
  glass:       '#FFFFFF1F',
  glassBorder: 'rgba(255,255,255,0.15)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  round: 9999,
};

export const font = {
  family: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 15,
  xl: 17,
  xxl: 22,
  title: 28,
};

export const globalStyles = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes flashFade { from { opacity: 0.8; } to { opacity: 0; } }
  @keyframes popIn { from { transform: scale(0.85); opacity:0; } to { transform: scale(1); opacity:1; } }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
`;
