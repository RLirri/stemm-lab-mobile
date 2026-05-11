import React from 'react';
import {Platform, StyleSheet, View} from 'react-native';
import {BannerAd, BannerAdSize, TestIds,} from 'react-native-google-mobile-ads';

import {AppText} from '../ui';
import {colors, spacing} from '../../theme';

type Props = {
    placement?: 'profile' | 'history' | 'home';
};

const adUnitId = __DEV__
    ? TestIds.BANNER
    : Platform.select({
        android: 'ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx',
        ios: 'ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx',
        default: TestIds.BANNER,
    });

export function AppAdBanner({placement = 'profile'}: Props) {
    return (
        <View style={styles.container}>
            <AppText variant="caption" color="textMuted" align="center" style={styles.label}>
                Sponsored
            </AppText>

            <View style={styles.bannerShell}>
                <BannerAd
                    unitId={adUnitId}
                    size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                    requestOptions={{
                        requestNonPersonalizedAdsOnly: true,
                        keywords: ['education', 'science', 'learning', placement],
                    }}
                    onAdFailedToLoad={(error) => {
                        if (__DEV__) {
                            console.log('[AdMob] Banner failed to load:', error.message);
                        }
                    }}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: spacing.lg,
        marginBottom: spacing.md,
        alignItems: 'center',
    },

    label: {
        marginBottom: spacing.xs,
    },

    bannerShell: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.sm,
        borderRadius: 18,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
});