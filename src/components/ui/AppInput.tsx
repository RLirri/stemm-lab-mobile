import React from 'react';
import {
    StyleProp,
    StyleSheet,
    TextInput,
    TextInputProps,
    ViewStyle,
} from 'react-native';

import {
    colors,
    radius,
    spacing,
    typography,
} from '../../theme';

type Props = TextInputProps & {
    containerStyle?: StyleProp<ViewStyle>;
};

export function AppInput({
                             containerStyle,
                             style,
                             ...props
                         }: Props) {
    return (
        <TextInput
            placeholderTextColor={colors.textMuted}
            style={[styles.input, style, containerStyle]}
            {...props}
        />
    );
}

const styles = StyleSheet.create({
    input: {
        minHeight: 54,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.md,
        marginTop: spacing.md,
        marginBottom: spacing.md,

        fontSize: typography.body.fontSize,
        color: colors.text,
    },
});