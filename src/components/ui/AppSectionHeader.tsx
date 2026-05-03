import React from 'react';

import {
    StyleSheet,
    View,
} from 'react-native';

import {
    spacing,
} from '../../theme';

import {AppText} from './AppText';

type Props = {
    title: string;
    subtitle?: string;
};

export function AppSectionHeader({
                                     title,
                                     subtitle,
                                 }: Props) {
    return (
        <View style={styles.container}>
            <AppText variant="sectionTitle">
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
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.md,
    },

    subtitle: {
        marginTop: spacing.xs,
    },
});