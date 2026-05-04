import React from 'react';
import {
    StyleProp,
    StyleSheet,
    TextInput,
    TextInputProps,
    View,
    ViewStyle,
} from 'react-native';

import {colors, radius, spacing, typography} from '../../theme';
import {AppText} from './AppText';

type Props = TextInputProps & {
    label?: string;
    error?: string;
    containerStyle?: StyleProp<ViewStyle>;
};

export function AppInput({
                             label,
                             error,
                             containerStyle,
                             style,
                             ...props
                         }: Props) {
    return (
        <View style={[styles.container, containerStyle]}>
            {label ? (
                <AppText variant="caption" color="textMuted" style={styles.label}>
                    {label}
                </AppText>
            ) : null}

            <TextInput
                {...props}
                placeholderTextColor={colors.textSubtle}
                style={[styles.input, error ? styles.inputError : null, style]}
            />

            {error ? (
                <AppText variant="caption" color="danger" style={styles.error}>
                    {error}
                </AppText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.md,
    },

    label: {
        marginBottom: spacing.xs,
    },

    input: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        color: colors.text,
        ...typography.body,
    },

    inputError: {
        borderColor: colors.danger,
    },

    error: {
        marginTop: spacing.xs,
    },
});