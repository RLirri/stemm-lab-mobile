import React from 'react';

import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    ViewStyle,
} from 'react-native';

import {
    colors,
    radius,
    spacing,
} from '../../theme';

import {AppText} from './AppText';

type Variant =
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'danger';

type Props = {
    title: string;
    onPress: () => void;
    variant?: Variant;
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    style?: ViewStyle;
};

export function AppButton({
                              title,
                              onPress,
                              variant = 'primary',
                              disabled = false,
                              loading = false,
                              fullWidth = true,
                              style,
                          }: Props) {
    const isDisabled = disabled || loading;

    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            disabled={isDisabled}
            style={({pressed}) => [
                styles.base,
                styles[variant],
                fullWidth && styles.fullWidth,
                isDisabled && styles.disabled,
                pressed &&
                !isDisabled &&
                styles.pressed,
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator
                    color={
                        variant === 'outline'
                            ? colors.primary
                            : colors.inverseText
                    }
                />
            ) : (
                <AppText
                    variant="button"
                    color={
                        variant === 'outline' ||
                        variant === 'ghost'
                            ? 'primary'
                            : 'inverseText'
                    }
                >
                    {title}
                </AppText>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        minHeight: 50,
        borderRadius: radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
    },

    fullWidth: {
        alignSelf: 'stretch',
    },

    primary: {
        backgroundColor: colors.primary,
    },

    secondary: {
        backgroundColor: colors.accent,
    },

    danger: {
        backgroundColor: colors.danger,
    },

    outline: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.primary,
    },

    ghost: {
        backgroundColor: 'transparent',
    },

    disabled: {
        opacity: 0.5,
    },

    pressed: {
        opacity: 0.88,
    },
});