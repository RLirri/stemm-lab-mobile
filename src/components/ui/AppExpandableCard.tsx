import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';

import {colors, spacing} from '../../theme';
import {AppCard} from './AppCard';
import {AppText} from './AppText';

type Props = {
    title: string;
    children: React.ReactNode;
    defaultExpanded?: boolean;
};

export function AppExpandableCard({
                                      title,
                                      children,
                                      defaultExpanded = false,
                                  }: Props) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <AppCard style={styles.card}>
            <Pressable
                accessibilityRole="button"
                onPress={() => setExpanded((prev) => !prev)}
                style={styles.header}
            >
                <AppText variant="sectionTitle">{title}</AppText>

                <AppText variant="sectionTitle" color="primary">
                    {expanded ? '−' : '+'}
                </AppText>
            </Pressable>

            {expanded ? <View style={styles.content}>{children}</View> : null}
        </AppCard>
    );
}

const styles = StyleSheet.create({
    card: {
        marginTop: spacing.sm,
        padding: spacing.lg,
    },

    header: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    content: {
        marginTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        paddingTop: spacing.md,
    },
});