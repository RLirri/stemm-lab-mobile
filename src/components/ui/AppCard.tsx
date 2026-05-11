import React from 'react';

import {Pressable, StyleSheet, ViewStyle,} from 'react-native';

import {colors, shadows, spacing,} from '../../theme';

type Props = {
    children: React.ReactNode;
    onPress?: () => void;
    style?: ViewStyle;
};

export function AppCard({
                            children,
                            onPress,
                            style,
                        }: Props) {
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({pressed}) => [
                styles.card,
                pressed && onPress
                    ? styles.pressed
                    : null,
                style,
            ]}
        >
            {children}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 28,
        padding: spacing.xl,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.md,
        overflow: 'hidden',
        ...shadows.card,
    },
    pressed: {
        opacity: 0.92,
        transform: [{scale: 0.995}],
    },
});