import React from 'react';

import {
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native';

import {
    colors,
    spacing,
} from '../../theme';

import {AppBadge} from './AppBadge';
import {AppButton} from './AppButton';
import {AppCard} from './AppCard';
import {AppText} from './AppText';

type Props = {
    title: string;
    subtitle?: string;
    badge?: string;
    buttonTitle?: string;
    onPress: () => void;
    style?: ViewStyle;
};

export function AppActivityCard({
                                    title,
                                    subtitle,
                                    badge,
                                    buttonTitle = 'Open Activity',
                                    onPress,
                                    style,
                                }: Props) {
    return (
        <AppCard onPress={onPress} style={style}>
            <View style={styles.header}>
                <View style={styles.iconPlaceholder}>
                    <AppText variant="subtitle" color="primary">
                        ✦
                    </AppText>
                </View>

                <View style={styles.textArea}>
                    {badge ? (
                        <AppBadge label={badge} tone="info"/>
                    ) : null}

                    <AppText
                        variant="sectionTitle"
                        style={styles.title}
                    >
                        {title}
                    </AppText>

                    {subtitle ? (
                        <AppText
                            variant="caption"
                            color="textMuted"
                            style={styles.subtitle}
                        >
                            {subtitle}
                        </AppText>
                    ) : null}
                </View>
            </View>

            <AppButton
                title={buttonTitle}
                onPress={onPress}
                style={styles.button}
            />
        </AppCard>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    iconPlaceholder: {
        width: 52,
        height: 52,
        borderRadius: 18,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },

    textArea: {
        flex: 1,
    },

    title: {
        marginTop: spacing.sm,
    },

    subtitle: {
        marginTop: spacing.xs,
    },

    button: {
        marginTop: spacing.lg,
    },
});