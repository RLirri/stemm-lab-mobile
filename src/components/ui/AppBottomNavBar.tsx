import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Feather} from '@expo/vector-icons';

import {
    colors,
    radius,
    shadows,
    spacing,
} from '../../theme';

import {AppText} from './AppText';

type BottomNavIcon = 'home' | 'activity' | 'user';

type TabItem = {
    label: string;
    icon: BottomNavIcon;
    active?: boolean;
    onPress: () => void;
};

type Props = {
    items: TabItem[];
};

export function AppBottomNavBar({items}: Props) {
    return (
        <View style={styles.container}>
            {items.map((item) => {
                const isActive = item.active === true;

                return (
                    <Pressable
                        key={item.label}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        onPress={item.onPress}
                        style={({pressed}) => [
                            styles.item,
                            isActive && styles.activeItem,
                            pressed && styles.pressed,
                        ]}
                    >
                        <Feather
                            name={item.icon}
                            size={25}
                            color={colors.inverseText}
                        />

                        <AppText
                            variant="caption"
                            color="inverseText"
                            style={styles.label}
                        >
                            {item.label}
                        </AppText>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: spacing.xl,
        marginBottom: spacing.lg,
        borderRadius: radius.pill,
        backgroundColor: colors.primaryDark,
        padding: spacing.xs,
        flexDirection: 'row',
        justifyContent: 'space-between',
        ...shadows.floating,
    },

    item: {
        flex: 1,
        minHeight: 66,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.sm,
        gap: 4,
    },

    activeItem: {
        backgroundColor: colors.primary,
    },

    pressed: {
        opacity: 0.86,
    },

    label: {
        fontWeight: '700',
    },
});