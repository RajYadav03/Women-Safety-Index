/**
 * WSI App — Design System
 * Inspired by Claude's warm, minimal aesthetic
 * with a safety-focused dark palette.
 */

export const Colors = {
  // Backgrounds — layered depth
  bg:             '#111114',
  bgSurface:      '#1B1B20',
  bgElevated:     '#232329',
  bgInput:        '#1E1E24',
  bgOverlay:      'rgba(17, 17, 20, 0.92)',

  // Accent — warm amber/gold (safety feels trustworthy + warm)
  accent:         '#D4A574',
  accentSoft:     '#C4956A',
  accentMuted:    'rgba(212, 165, 116, 0.15)',
  accentBorder:   'rgba(212, 165, 116, 0.25)',

  // Safety
  safe:           '#4ADE80',
  safeBg:         'rgba(74, 222, 128, 0.12)',
  moderate:       '#FBBF24',
  moderateBg:     'rgba(251, 191, 36, 0.12)',
  danger:         '#F87171',
  dangerBg:       'rgba(248, 113, 113, 0.12)',

  // Text — high contrast hierarchy
  text:           '#F4F4F5',
  textSecondary:  '#A1A1AA',
  textTertiary:   '#71717A',
  textInverse:    '#111114',

  // Structural
  border:         'rgba(255, 255, 255, 0.06)',
  borderSubtle:   'rgba(255, 255, 255, 0.04)',
  divider:        'rgba(255, 255, 255, 0.05)',

  // Chat
  bubbleUser:     '#D4A574',
  bubbleUserText: '#1A1207',
  bubbleAi:       '#1B1B20',
  bubbleAiBorder: 'rgba(255, 255, 255, 0.07)',

  // Map
  mapBorder:      'rgba(255, 255, 255, 0.08)',
  mapOverlay:     'rgba(17, 17, 20, 0.88)',
};

export const Space = {
  xxs: 2,
  xs:  4,
  s:   8,
  m:   12,
  l:   16,
  xl:  20,
  xxl: 28,
  xxxl: 36,
};

export const Radii = {
  s:    8,
  m:    12,
  l:    16,
  xl:   20,
  xxl:  24,
  full: 999,
};

export const Type = {
  // Weight helpers (RN StyleSheet compatible)
  light:    { fontWeight: '300' as const },
  regular:  { fontWeight: '400' as const },
  medium:   { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold:     { fontWeight: '700' as const },
};
