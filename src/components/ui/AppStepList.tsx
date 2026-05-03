import React from 'react';
import {StyleSheet, View} from 'react-native';

import {spacing} from '../../theme';
import {AppText} from './AppText';

type Props = {
    items: string[];
};

export function AppStepList({items}: Props) {
    return (
        <View style={styles.container}>
            {items.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.row}>
                    <AppText
                        variant="bodyStrong"
                        color="primary"
                        style={styles.index}
                    >
                        {index + 1}.
                    </AppText>

                    <AppText
                        variant="body"
                        color="textMuted"
                        style={styles.text}
                    >
                        {item}
                    </AppText>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: spacing.md,
    },

    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
    },

    index: {
        width: 24,
    },

    text: {
        flex: 1,
        lineHeight: 28,
    },
});