import React from 'react';
import {SafeAreaView, ScrollView, StyleSheet, View, ViewStyle,} from 'react-native';

import {LinearGradient} from 'expo-linear-gradient';

import {spacing,} from '../../theme';

type Props = {
    children: React.ReactNode;
    scroll?: boolean;
    padded?: boolean;
    contentStyle?: ViewStyle;
};

export function AppGradientScreen({
                                      children,
                                      scroll = true,
                                      padded = true,
                                      contentStyle,
                                  }: Props) {
    const innerContent = (
        <View
            style={[
                styles.content,
                padded && styles.padded,
                contentStyle,
            ]}
        >
            {children}
        </View>
    );

    return (
        <LinearGradient
            colors={[
                '#A8D5FF',
                '#EAF6FF',
                '#F8FAFC',
            ]}
            locations={[0, 0.18, 1]}
            style={styles.gradient}
        >
            <SafeAreaView style={styles.safeArea}>
                {scroll ? (
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.scrollContent}
                    >
                        {innerContent}
                    </ScrollView>
                ) : (
                    innerContent
                )}
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    gradient: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    content: {
        flex: 1,
    },
    padded: {
        padding: spacing.lg,
    },
});