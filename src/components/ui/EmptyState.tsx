import React from 'react';

import {StyleSheet, View,} from 'react-native';

import {spacing} from '../../theme';

import {AppButton} from './AppButton';
import {AppText} from './AppText';

type Props = {
    title: string;
    message?: string;
    actionLabel?: string;
    onAction?: () => void;
};

export function EmptyState({
                               title,
                               message,
                               actionLabel,
                               onAction,
                           }: Props) {
    return (
        <View style={styles.container}>
            <AppText variant="subtitle" align="center">
                {title}
            </AppText>

            {message ? (
                <AppText
                    variant="body"
                    color="textMuted"
                    align="center"
                    style={styles.message}
                >
                    {message}
                </AppText>
            ) : null}

            {actionLabel && onAction ? (
                <AppButton
                    title={actionLabel}
                    onPress={onAction}
                    style={styles.button}
                />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: spacing.xxxl,
        alignItems: 'center',
    },

    message: {
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
    },

    button: {
        marginTop: spacing.md,
    },
});