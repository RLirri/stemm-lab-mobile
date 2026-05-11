import React from 'react';

import {StyleSheet, View,} from 'react-native';

import {colors, spacing,} from '../../theme';

export function AppDivider() {
    return <View style={styles.divider}/>;
}

const styles = StyleSheet.create({
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.divider,
        marginVertical: spacing.md,
    },
});