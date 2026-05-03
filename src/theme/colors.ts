export const colors = {
    background: '#F6F8FB',
    backgroundSoft: '#EDF6F8',

    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F9',

    primary: '#315BA3',
    primaryDark: '#18325F',
    primarySoft: '#DCEBFF',

    accent: '#78BDFB',
    accentSoft: '#E3F3FF',

    text: '#172033',
    textMuted: '#64748B',
    textSubtle: '#94A3B8',
    inverseText: '#FFFFFF',

    border: '#E2E8F0',
    divider: '#E5E7EB',

    success: '#16A34A',
    successSoft: '#DCFCE7',

    warning: '#D97706',
    warningSoft: '#FEF3C7',

    danger: '#DC2626',
    dangerSoft: '#FEE2E2',

    info: '#0284C7',
    infoSoft: '#E0F2FE',
} as const;

export type AppColor = keyof typeof colors;