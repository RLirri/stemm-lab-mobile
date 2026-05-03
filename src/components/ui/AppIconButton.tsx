import React from 'react';

import {
    Pressable,
    StyleSheet,
    ViewStyle,
} from 'react-native';

import {
    colors,
    radius,
    shadows,
    spacing,
} from '../../theme';

import {AppText} from './AppText';

type Props = {
    label: string;
    onPress: () => void;
    style?: ViewStyle;
    accessibilityLabel?: string;
};

export function AppIconButton({
                                  label,
                                  onPress,
                                  style,
                                  accessibilityLabel,
                              }: Props) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            onPress={onPress}
            style={({pressed}) => [
                styles.button,
                pressed && styles.pressed,
                style,
            ]}
        >
            <AppText variant="bodyStrong" color="primary">
                {label}
            </AppText>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        ...shadows.card,
    },

    pressed: {
        opacity: 0.85,
        transform: [{scale: 0.97}],
    },
});