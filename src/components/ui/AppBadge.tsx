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

type Tone =
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info';

const toneMap = {
    primary: {
        background: colors.primarySoft,
        text: colors.primary,
    },

    success: {
        background: colors.successSoft,
        text: colors.success,
    },

    warning: {
        background: colors.warningSoft,
        text: colors.warning,
    },

    danger: {
        background: colors.dangerSoft,
        text: colors.danger,
    },

    info: {
        background: colors.infoSoft,
        text: colors.info,
    },
} as const;

type Props = {
    label: string;
    tone?: Tone;
};

export function AppBadge({
                             label,
                             tone = 'primary',
                         }: Props) {
    return (
        <View
            style={[
                styles.badge,
                {
                    backgroundColor:
                    toneMap[tone].background,
                },
            ]}
        >
            <AppText
                variant="caption"
                style={{
                    color: toneMap[tone].text,
                }}
            >
                {label}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        alignSelf: 'flex-start',
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
});