import React from 'react';

import {
    ActivityIndicator,
    StyleSheet,
    View,
} from 'react-native';

import {
    colors,
    spacing,
} from '../../theme';

import {AppText} from './AppText';

type Props = {
    message?: string;
};

export function LoadingState({
                                 message = 'Loading...',
                             }: Props) {
    return (
        <View style={styles.container}>
            <ActivityIndicator color={colors.primary}/>

            <AppText
                variant="caption"
                color="textMuted"
                style={styles.message}
            >
                {message}
            </AppText>
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
    },
});