import type {TextStyle} from 'react-native';

type FontWeight = TextStyle['fontWeight'];

export const typography = {
    title: {
        fontSize: 30,
        lineHeight: 36,
        fontWeight: '800' as FontWeight,
    },
    subtitle: {
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '700' as FontWeight,
    },
    sectionTitle: {
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '700' as FontWeight,
    },
    body: {
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '400' as FontWeight,
    },
    bodyStrong: {
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '700' as FontWeight,
    },
    caption: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '400' as FontWeight,
    },
    button: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '700' as FontWeight,
    },
} as const;