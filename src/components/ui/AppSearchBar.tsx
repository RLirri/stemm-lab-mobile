import React from 'react';

import {StyleSheet, TextInput, TextInputProps, View,} from 'react-native';

import {colors, radius, shadows, spacing, typography,} from '../../theme';

type Props = TextInputProps;

export function AppSearchBar({
                                 style,
                                 placeholder = 'Search',
                                 ...props
                             }: Props) {
    return (
        <View style={styles.container}>
            <TextInput
                {...props}
                placeholder={placeholder}
                placeholderTextColor={colors.textSubtle}
                style={[styles.input, style]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.lg,
        minHeight: 50,
        justifyContent: 'center',
        marginVertical: spacing.lg,
        ...shadows.card,
    },

    input: {
        color: colors.text,
        ...typography.body,
    },
});