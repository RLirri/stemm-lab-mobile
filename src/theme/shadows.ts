import {Platform} from 'react-native';

export const shadows = {
    card: Platform.select({
        ios: {
            shadowColor: '#172033',
            shadowOffset: {width: 0, height: 6},
            shadowOpacity: 0.08,
            shadowRadius: 14,
        },
        android: {
            elevation: 3,
        },
        default: {},
    }),
    floating: Platform.select({
        ios: {
            shadowColor: '#172033',
            shadowOffset: {width: 0, height: 10},
            shadowOpacity: 0.16,
            shadowRadius: 20,
        },
        android: {
            elevation: 8,
        },
        default: {},
    }),
} as const;