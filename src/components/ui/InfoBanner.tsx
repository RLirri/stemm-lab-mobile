import React from 'react';

import {
    StyleSheet,
    View,
} from 'react-native';

import {
    colors,
    radius,
    spacing,
} from '../../theme';

import {AppText} from './AppText';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const toneMap = {
    info: colors.infoSoft,
    success: colors.successSoft,
    warning: colors.warningSoft,
    danger: colors.dangerSoft,
} as const;

type Props = {
    title: string;
    message?: string;
    tone?: Tone;
};

export function InfoBanner({
                               title,
                               message,
                               tone = 'info',
                           }: Props) {
    return (
        <View
            style={[
                styles.container,
                {backgroundColor: toneMap[tone]},
            ]}
        >
            <AppText variant="bodyStrong">
                {title}
            </AppText>

            {message ? (
                <AppText
                    variant="caption"
                    color="textMuted"
                    style={styles.message}
                >
                    {message}
                </AppText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },

    message: {
        marginTop: spacing.xs,
    },
});